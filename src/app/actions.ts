'use server';

import { supabase, DriveNode, hasValidSupabaseEnv } from '@/lib/supabase';
import { r2Client, R2_BUCKET, hasValidR2Env } from '@/lib/r2';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import bcrypt from 'bcryptjs';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

// =======================
// ACTIVITY LOGGING (internal helper)
// =======================

async function logActivity(params: {
    projectId: string | null | undefined;
    userEmail: string;
    action: string;
    nodeId?: string | null;
    nodeName: string;
    metadata?: Record<string, unknown>;
}) {
    if (!hasValidSupabaseEnv || !params.projectId) return;
    try {
        // Use service client so logging never fails due to RLS
        await createServiceClient().from('share_log').insert({
            project_id: params.projectId,
            user_email: params.userEmail,
            action: params.action,
            node_id: params.nodeId ?? null,
            node_name: params.nodeName,
            metadata: params.metadata ?? null,
        });
    } catch (_) {
        // Logging is a side-effect — never break the main operation
    }
}

export type ShareLink = {
    id: string;
    node_id: string;
    password_hash: string | null;
    expires_at: string | null;
    created_at: string;
};

// MOCK DATA GENERATOR (For when user hasn't setup keys yet)
function getMockData() {
    return [
        { id: '1', name: 'Project Alpha', type: 'folder', parent_id: null, size: 4500123, mime_type: null, r2_key: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: '2', name: 'Financial Reports', type: 'folder', parent_id: null, size: 210456, mime_type: null, r2_key: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: '3', name: 'Q3_Earnings_Presentation.pptx', type: 'file', parent_id: null, size: 4500123, mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', r2_key: 'mock-123', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: '4', name: 'employee_handbook.pdf', type: 'file', parent_id: null, size: 210456, mime_type: 'application/pdf', r2_key: 'mock-456', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ] as DriveNode[];
}

export async function getTotalUsage(projectId?: string) {
    if (!hasValidSupabaseEnv) return 0;

    // Supabase RPC requires p_project_id
    const { data, error } = await (await createClient()).rpc('get_total_usage', { p_project_id: projectId || null });
    if (error) {
        console.error('Error fetching total usage:', error);
        return 0;
    }
    return Number(data) || 0;
}

export async function fetchNodes(parentId: string | null = null, searchQuery?: string, projectId?: string): Promise<DriveNode[]> {
    if (!hasValidSupabaseEnv) {
        return getMockData(); // Return dummy data if purely testing design
    }

    const { data, error } = await (await createClient()).rpc('get_nodes_with_sizes', {
        p_project_id: projectId || null,
        p_parent_id: parentId,
        p_search_query: searchQuery || null
    });

    if (error) {
        console.error('Error fetching nodes:', error);
        throw new Error('Failed to fetch files');
    }

    return data as DriveNode[];
}

export async function fetchRecentNodes(projectId?: string): Promise<DriveNode[]> {
    if (!hasValidSupabaseEnv) {
        return getMockData(); // Return dummy data if purely testing design
    }

    const { data, error } = await (await createClient()).rpc('get_recent_nodes_with_sizes', {
        p_project_id: projectId || null
    });

    if (error) {
        console.error('Error fetching recent nodes:', error);
        throw new Error('Failed to fetch recent files');
    }

    return data as DriveNode[];
}

export async function getFolderPath(folderId: string) {
    if (!hasValidSupabaseEnv) return { history: [], currentFolder: { id: null, name: 'Root' } };

    const history = [];
    let currentId: string | null = folderId;
    let currentFolderName = 'Unknown Folder';

    while (currentId) {
        const response = await (await createClient()).from('share_nodes').select('id, name, parent_id').eq('id', currentId).single();
        if (response.error || !response.data) break;
        const nodeData = response.data as { id: string, name: string, parent_id: string | null };

        if (currentId === folderId) {
            currentFolderName = nodeData.name;
        } else {
            history.unshift({ id: nodeData.id, name: nodeData.name });
        }
        currentId = nodeData.parent_id || null;
    }

    return {
        history,
        currentFolder: { id: folderId, name: currentFolderName }
    };
}

export async function getNodePath(nodeId: string | null): Promise<string> {
    if (!hasValidSupabaseEnv || !nodeId) return '';

    const pathParts: string[] = [];
    let currentId: string | null = nodeId;

    while (currentId) {
        const client = await createClient();
        const response = await client
            .from('share_nodes')
            .select('id, name, parent_id')
            .eq('id', currentId)
            .single();

        if (response.error || !response.data) break;

        const data = response.data as { name: string; parent_id: string | null };
        pathParts.unshift(data.name.replace(/[^a-zA-Z0-9.-]/g, '_'));
        currentId = data.parent_id;
    }

    return pathParts.join('/');
}

export async function createFolderFolder(name: string, parentId: string | null = null, projectId?: string) {
    if (!hasValidSupabaseEnv) return { success: true };
    const supabaseServer = await createClient();
    const { data: inserted, error } = await supabaseServer.from('share_nodes').insert([{
        name,
        type: 'folder',
        parent_id: parentId,
        project_id: projectId || null
    }]).select('id').single();

    if (error) throw new Error(error.message);

    const { data: { user } } = await supabaseServer.auth.getUser();
    if (user?.email) {
        await logActivity({ projectId, userEmail: user.email, action: 'folder_create', nodeId: inserted?.id, nodeName: name });
    }

    revalidatePath('/');
    return { success: true };
}

export async function ensurePathExists(pathArray: string[], rootId: string | null = null, projectId?: string): Promise<string | null> {
    if (!hasValidSupabaseEnv) return rootId;
    const supabaseServer = await createClient();
    if (pathArray.length === 0) return rootId;

    let currentParentId = rootId;

    for (const folderName of pathArray) {
        let query = supabaseServer
            .from('share_nodes')
            .select('id')
            .eq('type', 'folder')
            .eq('name', folderName);

        if (projectId) {
            query = query.eq('project_id', projectId);
        } else {
            query = query.is('project_id', null);
        }

        if (currentParentId) {
            query = query.eq('parent_id', currentParentId);
        } else {
            query = query.is('parent_id', null);
        }

        const { data: existing } = await query.single();

        if (existing) {
            currentParentId = existing.id;
        } else {
            const { data: created, error } = await supabaseServer
                .from('share_nodes')
                .insert([{
                    name: folderName,
                    type: 'folder',
                    parent_id: currentParentId,
                    project_id: projectId || null
                }])
                .select('id')
                .single();

            if (error || !created) throw new Error('Failed to create folder ' + folderName);
            currentParentId = created.id;
        }
    }
    return currentParentId;
}

export async function getUploadPresignedUrl(fileName: string, contentType: string, projectId?: string, parentId: string | null = null) {
    if (!hasValidR2Env) {
        return { uploadUrl: 'mock-url', key: 'mock-key' };
    }

    const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const projectPart = projectId || 'unassigned';

    // Get actual node path from DB hierarchy
    const nodePath = await getNodePath(parentId);

    // Final path: ${projectId}/${nodePath}/${timestamp}-${filename}
    let key = `${projectPart}`;
    if (nodePath) key += `/${nodePath}`;
    key += `/${Date.now()}-${cleanFileName}`;

    const command = new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        ContentType: contentType,
        // Ensure no checksum is added to URL parameters
        ChecksumAlgorithm: undefined,
    });

    // Explicitly sign both host and content-type. 
    // This requires the client to send the EXACT same Content-Type header.
    const uploadUrl = await getSignedUrl(r2Client, command, {
        expiresIn: 3600,
        signableHeaders: new Set(['host', 'content-type'])
    });
    return { uploadUrl, key };
}

export async function saveFileRecord(
    name: string,
    r2_key: string,
    size: number,
    mime_type: string,
    parentId: string | null = null,
    projectId?: string
) {
    if (!hasValidSupabaseEnv) return { success: true };

    const supabaseServer = await createClient();
    const { data: inserted, error } = await supabaseServer.from('share_nodes').insert([{
        name,
        type: 'file',
        r2_key,
        size,
        mime_type,
        parent_id: parentId,
        project_id: projectId || null
    }]).select('id').single();

    if (error) throw new Error(error.message);

    const { data: { user } } = await supabaseServer.auth.getUser();
    if (user?.email) {
        await logActivity({ projectId, userEmail: user.email, action: 'upload', nodeId: inserted?.id, nodeName: name, metadata: { size, mime_type } });
    }

    revalidatePath('/');
    return { success: true };
}

// Called from client after a successful download
export async function logDownload(nodeId: string, nodeName: string, projectId: string | null) {
    if (!hasValidSupabaseEnv || !projectId) return;
    const supabaseServer = await createClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (user?.email) {
        await logActivity({ projectId, userEmail: user.email, action: 'download', nodeId, nodeName });
    }
}

export async function getDownloadUrl(r2_key: string, fileName: string) {
    if (!hasValidR2Env) {
        return 'https://example.com/mock-download';
    }

    const command = new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: r2_key,
        ResponseContentDisposition: `attachment; filename="${fileName}"`
    });

    const url = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
    return url;
}

export async function getPreviewUrl(r2_key: string, mimeType: string) {
    if (!hasValidR2Env) {
        return 'https://example.com/mock-preview';
    }

    const command = new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: r2_key,
        ResponseContentType: mimeType, // ensure the browser renders it correctly
        ResponseContentDisposition: 'inline'
    });

    const url = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
    return url;
}

export async function deleteNode(id: string, r2_key: string | null = null) {
    if (!hasValidSupabaseEnv) return { success: true };

    const supabaseServer = await createClient();

    // Fetch node info before deletion for logging
    const { data: nodeInfo } = await supabaseServer.from('share_nodes').select('name, project_id').eq('id', id).single();

    // If it's a file, delete from R2 first
    if (r2_key && hasValidR2Env) {
        try {
            await r2Client.send(new DeleteObjectCommand({
                Bucket: R2_BUCKET,
                Key: r2_key
            }));
        } catch (e) {
            console.error('Failed to delete from R2', e);
        }
    }

    const { error } = await supabaseServer.from('share_nodes').delete().eq('id', id);
    if (error) throw new Error(error.message);

    const { data: { user } } = await supabaseServer.auth.getUser();
    if (user?.email && nodeInfo) {
        await logActivity({ projectId: nodeInfo.project_id, userEmail: user.email, action: 'delete', nodeId: id, nodeName: nodeInfo.name });
    }

    revalidatePath('/');
    return { success: true };
}

export async function renameNode(id: string, newName: string) {
    if (!hasValidSupabaseEnv) return { success: true };
    const supabaseServer = await createClient();

    // Fetch old name before rename
    const { data: oldNode } = await supabaseServer.from('share_nodes').select('name, project_id').eq('id', id).single();

    const { error } = await supabaseServer.from('share_nodes').update({ name: newName }).eq('id', id);
    if (error) throw new Error(error.message);

    const { data: { user } } = await supabaseServer.auth.getUser();
    if (user?.email && oldNode) {
        await logActivity({ projectId: oldNode.project_id, userEmail: user.email, action: 'rename', nodeId: id, nodeName: newName, metadata: { old_name: oldNode.name, new_name: newName } });
    }

    revalidatePath('/');
    return { success: true };
}

export async function moveNode(nodeId: string, newParentId: string | null) {
    if (!hasValidSupabaseEnv) return { success: true };
    if (nodeId === newParentId) throw new Error("Cannot move to itself");

    if (newParentId) {
        const isDesc = await isDescendant(newParentId, nodeId);
        if (isDesc) throw new Error("Cannot move folder into itself or its subfolders");
    }

    const supabaseServer = await createClient();
    const { data: nodeInfo } = await supabaseServer.from('share_nodes').select('name, project_id').eq('id', nodeId).single();

    const { error } = await supabaseServer.from('share_nodes').update({ parent_id: newParentId }).eq('id', nodeId);
    if (error) throw new Error(error.message);

    const { data: { user } } = await supabaseServer.auth.getUser();
    if (user?.email && nodeInfo) {
        const destName = newParentId ? (await supabaseServer.from('share_nodes').select('name').eq('id', newParentId).single()).data?.name : 'Root';
        await logActivity({ projectId: nodeInfo.project_id, userEmail: user.email, action: 'move', nodeId, nodeName: nodeInfo.name, metadata: { destination: destName ?? 'Root' } });
    }

    revalidatePath('/');
    return { success: true };
}

// =======================
// SHARING LINKS
// =======================

export async function createShareLink(nodeId: string, passwordAttempt?: string, expiresAt?: string) {
    if (!hasValidSupabaseEnv) return { success: true, linkId: Date.now().toString() };

    let passwordHash = null;
    if (passwordAttempt) {
        // Hash the password with bcrypt (run on server)
        passwordHash = await bcrypt.hash(passwordAttempt, 10);
    }

    // Must use authenticated server client to pass the RLS policy for share_links
    const supabaseServer = await createClient();

    const { data, error } = await supabaseServer.from('share_links').insert([{
        node_id: nodeId,
        password_hash: passwordHash,
        expires_at: expiresAt || null
    }]).select('id').single();

    if (error || !data) throw new Error(error?.message || 'Failed to create link');

    // Log share link creation
    const { data: nodeInfo } = await supabaseServer.from('share_nodes').select('name, project_id').eq('id', nodeId).single();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (user?.email && nodeInfo) {
        await logActivity({ projectId: nodeInfo.project_id, userEmail: user.email, action: 'share_create', nodeId, nodeName: nodeInfo.name, metadata: { link_id: data.id } });
    }

    return { success: true, linkId: data.id };
}

export async function getNodeShareLinks(nodeId: string) {
    if (!hasValidSupabaseEnv) return { success: true, links: [] };

    const { data, error } = await (await createClient()).from('share_links')
        .select('id, expires_at, created_at')
        .eq('node_id', nodeId)
        .order('created_at', { ascending: false });

    if (error) return { error: error.message };
    return { success: true, links: data };
}

export async function revokeShareLink(linkId: string) {
    if (!hasValidSupabaseEnv) return { success: true };

    const { error } = await (await createClient()).from('share_links').delete().eq('id', linkId);
    if (error) throw new Error(error.message);
    return { success: true };
}

export async function getShareLinkDetails(linkId: string) {
    if (!hasValidSupabaseEnv) return null;

    const svc = createServiceClient();

    // Step 1: Fetch the share link — use service client to bypass RLS for anon users
    const { data: linkData, error: linkError } = await svc
        .from('share_links')
        .select('id, node_id, password_hash, expires_at')
        .eq('id', linkId)
        .single();

    if (linkError || !linkData) return null;

    if (linkData.expires_at && new Date(linkData.expires_at) < new Date()) return null;

    // Step 2: Fetch the node using service client (bypasses project RLS for external viewer)
    const { data: nodeData } = await svc
        .from('share_nodes')
        .select('id, name, size, mime_type, type, project_id, parent_id')
        .eq('id', linkData.node_id)
        .single();

    // Step 3: For folders, calculate total recursive size via RPC
    let fileSize = nodeData?.size ?? null;
    if (nodeData?.type === 'folder') {
        const { data: folderSize } = await svc.rpc('get_folder_size', { folder_uuid: nodeData.id });
        fileSize = typeof folderSize === 'number' ? folderSize : null;
    }

    return {
        id: linkData.id,
        nodeId: linkData.node_id,
        projectId: nodeData?.project_id ?? null,
        parentId: nodeData?.parent_id ?? null,
        requiresPassword: !!linkData.password_hash,
        fileName: nodeData?.name ?? null,
        fileSize,
        mimeType: nodeData?.mime_type ?? null,
        type: (nodeData?.type ?? null) as 'file' | 'folder' | null
    };
}


export async function verifyShareLink(linkId: string, passwordAttempt?: string) {
    if (!hasValidSupabaseEnv) return { error: 'Not connected' };

    const svc = createServiceClient();

    // Step 1: Fetch the share link — service client bypasses RLS for anon users
    const { data: linkData, error: linkError } = await svc
        .from('share_links')
        .select('node_id, password_hash, expires_at')
        .eq('id', linkId)
        .single();

    if (linkError || !linkData) return { error: 'Link not found or expired' };

    if (linkData.expires_at && new Date(linkData.expires_at) < new Date()) return { error: 'Link expired' };

    // Step 2: Verify password if required
    if (linkData.password_hash) {
        if (!passwordAttempt) return { error: 'Password required' };

        const isMatch = await bcrypt.compare(passwordAttempt, linkData.password_hash);
        if (!isMatch) return { error: 'Incorrect password' };
    }

    // Step 3: Fetch the node using service client (bypasses project RLS)
    const { data: node, error: nodeError } = await svc
        .from('share_nodes')
        .select('id, name, type, r2_key')
        .eq('id', linkData.node_id)
        .single();

    if (nodeError || !node) return { error: 'Node not found on server' };

    if (node.type === 'folder') {
        return { success: true, type: 'folder', folderId: node.id, name: node.name };
    }

    if (!node.r2_key) return { error: 'File not found on server' };

    // Step 4: Generate real secure download URL
    const url = await getDownloadUrl(node.r2_key, node.name);
    return { success: true, type: 'file', downloadUrl: url, fileName: node.name };
}

export async function isDescendant(childId: string, ancestorId: string) {
    if (childId === ancestorId) return true;
    // Use service client so this works for both authenticated users and external share link viewers
    const { data, error } = await createServiceClient().rpc('is_descendant', {
        child_id: childId,
        ancestor_id: ancestorId
    });
    if (error) return false;
    return !!data;
}

export async function getSharedFolderContents(linkId: string, folderId: string, passwordAttempt?: string) {
    if (!hasValidSupabaseEnv) return { error: 'Not connected' };

    const svc = createServiceClient();

    const { data: link, error: linkError } = await svc.from('share_links').select('password_hash, node_id, expires_at, node_id').eq('id', linkId).single();
    if (linkError || !link) return { error: 'Invalid link' };

    if (link.expires_at && new Date(link.expires_at) < new Date()) return { error: 'Link expired' };

    if (link.password_hash) {
        if (!passwordAttempt) return { error: 'Password required' };
        const isMatch = await bcrypt.compare(passwordAttempt, link.password_hash);
        if (!isMatch) return { error: 'Incorrect password' };
    }

    const valid = await isDescendant(folderId, link.node_id);
    if (!valid) return { error: 'Access denied' };

    // Fetch node to get project_id (required by updated RPC)
    const { data: rootNode } = await svc.from('share_nodes').select('project_id').eq('id', link.node_id).single();

    const { data, error } = await svc.rpc('get_nodes_with_sizes', {
        p_project_id: rootNode?.project_id ?? null,
        p_parent_id: folderId,
        p_search_query: null
    });

    if (error) return { error: error.message };

    return { success: true, nodes: data as DriveNode[] };
}

export async function getSharedFileDownloadUrlInside(linkId: string, fileId: string, passwordAttempt?: string) {
    if (!hasValidSupabaseEnv) return { error: 'Not connected' };

    const svc = createServiceClient();

    const { data: link, error: linkError } = await svc.from('share_links').select('password_hash, node_id, expires_at').eq('id', linkId).single();
    if (linkError || !link) return { error: 'Invalid link' };

    if (link.expires_at && new Date(link.expires_at) < new Date()) return { error: 'Link expired' };

    if (link.password_hash) {
        if (!passwordAttempt) return { error: 'Password required' };
        const isMatch = await bcrypt.compare(passwordAttempt, link.password_hash);
        if (!isMatch) return { error: 'Incorrect password' };
    }

    const valid = await isDescendant(fileId, link.node_id);
    if (!valid) return { error: 'Access denied' };

    const { data: node, error } = await svc.from('share_nodes').select('*').eq('id', fileId).single();
    if (error || !node || !node.r2_key) return { error: 'File not found' };

    const url = await getDownloadUrl(node.r2_key, node.name);
    return { success: true, downloadUrl: url, fileName: node.name };
}

export async function getSharedFilePreviewUrlInside(linkId: string, fileId: string, passwordAttempt?: string) {
    if (!hasValidSupabaseEnv) return { error: 'Not connected' };

    const svc = createServiceClient();

    const { data: link, error: linkError } = await svc.from('share_links').select('password_hash, node_id, expires_at').eq('id', linkId).single();
    if (linkError || !link) return { error: 'Invalid link' };

    if (link.expires_at && new Date(link.expires_at) < new Date()) return { error: 'Link expired' };

    if (link.password_hash) {
        if (!passwordAttempt) return { error: 'Password required' };
        const isMatch = await bcrypt.compare(passwordAttempt, link.password_hash);
        if (!isMatch) return { error: 'Incorrect password' };
    }

    const valid = await isDescendant(fileId, link.node_id);
    if (!valid) return { error: 'Access denied' };

    const { data: node, error } = await svc.from('share_nodes').select('*').eq('id', fileId).single();
    if (error || !node || !node.r2_key) return { error: 'File not found' };

    const url = await getPreviewUrl(node.r2_key, node.mime_type || 'application/octet-stream');
    return { success: true, previewUrl: url };
}

// =======================
// PROJECTS & MEMBERS
// =======================

export async function getWhitelistUsers(): Promise<{ email: string; role: string }[]> {
    if (!hasValidSupabaseEnv) return [];
    const { data, error } = await (await createClient()).from('share_whitelist').select('email, role').order('email');
    if (error) return [];
    return data ?? [];
}

export async function fetchUserProjects(): Promise<{ id: string; name: string; userRole: string | null }[]> {
    if (!hasValidSupabaseEnv) return [{ id: 'mock', name: 'Mock Project', userRole: 'admin' }];
    const supabaseServer = await createClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return [];

    const [projectsRes, membersRes] = await Promise.all([
        supabaseServer.from('share_projects').select('id, name').order('name'),
        user.email
            ? supabaseServer.from('share_project_members').select('project_id, role').eq('email', user.email)
            : Promise.resolve({ data: [] as { project_id: string; role: string }[] })
    ]);

    if (projectsRes.error) {
        console.error('Error fetching projects:', projectsRes.error);
        return [];
    }

    const roleMap = new Map((membersRes.data || []).map((m: { project_id: string; role: string }) => [m.project_id, m.role]));

    return (projectsRes.data || []).map(p => ({
        id: p.id,
        name: p.name,
        userRole: (roleMap.get(p.id) as string | null) ?? null
    }));
}

export async function fetchUserProjectsWithUsage(): Promise<{
    id: string;
    name: string;
    userRole: string | null;
    totalBytes: number;
}[]> {
    if (!hasValidSupabaseEnv) return [{
        id: 'mock', name: 'Mock Project', userRole: 'admin', totalBytes: 123456789
    }];
    const supabaseServer = await createClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return [];

    const [projectsRes, membersRes] = await Promise.all([
        supabaseServer.from('share_projects').select('id, name').order('name'),
        user.email
            ? supabaseServer.from('share_project_members').select('project_id, role').eq('email', user.email)
            : Promise.resolve({ data: [] as { project_id: string; role: string }[] })
    ]);

    if (projectsRes.error) {
        console.error('Error fetching projects:', projectsRes.error);
        return [];
    }

    const projects = projectsRes.data || [];
    const roleMap = new Map((membersRes.data || []).map((m: { project_id: string; role: string }) => [m.project_id, m.role]));

    // Only fetch usage for projects the user is a member of
    const myProjectIds = projects
        .filter(p => roleMap.has(p.id))
        .map(p => p.id);

    let usageMap = new Map<string, number>();
    if (myProjectIds.length > 0) {
        const { data: usageData, error: usageError } = await supabaseServer.rpc('get_project_usages', {
            p_project_ids: myProjectIds,
        });
        if (!usageError && usageData) {
            for (const row of usageData as { project_id: string; total_bytes: number }[]) {
                usageMap.set(row.project_id, Number(row.total_bytes));
            }
        }
    }

    return projects.map(p => ({
        id: p.id,
        name: p.name,
        userRole: (roleMap.get(p.id) as string | null) ?? null,
        totalBytes: usageMap.get(p.id) ?? 0,
    }));
}


export async function fetchProject(projectId: string) {
    if (!hasValidSupabaseEnv) return { id: 'mock', name: 'Mock Project' };
    const { data, error } = await (await createClient()).from('share_projects')
        .select('id, name')
        .eq('id', projectId)
        .single();

    if (error) {
        console.error('Error fetching project:', error);
        return null;
    }
    return data;
}

export async function renameProject(projectId: string, newName: string) {
    if (!hasValidSupabaseEnv) return { success: true };
    const { error } = await (await createClient()).from('share_projects').update({ name: newName }).eq('id', projectId);
    if (error) throw new Error(error.message);
    revalidatePath('/');
    return { success: true };
}

export async function deleteProject(projectId: string) {
    if (!hasValidSupabaseEnv) return { success: true };
    const { error } = await (await createClient()).from('share_projects').delete().eq('id', projectId);
    if (error) throw new Error(error.message);
    revalidatePath('/');
    return { success: true };
}

export async function createProject(name: string, description: string) {
    if (!hasValidSupabaseEnv) return { success: true, id: 'mock' };
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) throw new Error('Unauthorized');

    // Server action logic
    const { data, error } = await (await createClient()).from('share_projects').insert([{
        name,
        description,
        created_by: user.id
    }]).select('id').single();

    if (error) throw new Error(error.message);

    // Add the creator as an admin in members table
    if (user.email) {
        await (await createClient()).from('share_project_members').insert([{
            project_id: data.id,
            email: user.email,
            role: 'admin',
            created_by: user.id
        }]);
    }

    revalidatePath('/');
    return { success: true, id: data.id };
}

export async function getProjectMembers(projectId: string) {
    if (!hasValidSupabaseEnv) return [];
    const { data, error } = await (await createClient()).from('share_project_members')
        .select('*')
        .eq('project_id', projectId);

    if (error) throw new Error(error.message);
    return data;
}

export async function addProjectMember(projectId: string, email: string, role: string) {
    if (!hasValidSupabaseEnv) return { success: true };
    const { data: { user } } = await (await createClient()).auth.getUser();

    const { error } = await (await createClient()).from('share_project_members').insert([{
        project_id: projectId,
        email,
        role,
        created_by: user?.id
    }]);

    if (error) throw new Error(error.message);
    revalidatePath('/');
    return { success: true };
}

export async function updateProjectMemberRole(projectId: string, email: string, role: string) {
    if (!hasValidSupabaseEnv) return { success: true };

    const { error } = await (await createClient()).from('share_project_members')
        .update({ role })
        .eq('project_id', projectId)
        .eq('email', email);

    if (error) throw new Error(error.message);
    revalidatePath('/');
    return { success: true };
}

export async function removeProjectMember(projectId: string, email: string) {
    if (!hasValidSupabaseEnv) return { success: true };

    const { error } = await (await createClient()).from('share_project_members')
        .delete()
        .eq('project_id', projectId)
        .eq('email', email);

    if (error) throw new Error(error.message);
    revalidatePath('/');
    return { success: true };
}

export async function getMyRoleInProject(projectId: string | null) {
    if (!hasValidSupabaseEnv || !projectId) return 'admin'; // default open if valid
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user?.email) return 'read_only';

    // check if global admin
    const { data: roleData } = await (await createClient()).from('share_whitelist').select('role').eq('email', user.email).single();
    if (roleData?.role === 'admin') return 'admin';

    const { data } = await (await createClient()).from('share_project_members').select('role').eq('project_id', projectId).eq('email', user.email).single();
    return data?.role || 'read_only';
}

// =======================
// ACTIVITY LOG
// =======================

export type ActivityLog = {
    id: string;
    user_email: string;
    action: string;
    node_id: string | null;
    node_name: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
};

export async function fetchProjectLogs(projectId: string): Promise<ActivityLog[]> {
    if (!hasValidSupabaseEnv) return [];
    const { data, error } = await (await createClient())
        .from('share_log')
        .select('id, user_email, action, node_id, node_name, metadata, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(200);

    if (error) {
        console.error('Error fetching logs:', error);
        return [];
    }
    return (data ?? []) as ActivityLog[];
}
