'use server';

import { DriveNode, hasValidSupabaseEnv } from '@/lib/supabase';
import { r2Client, R2_BUCKET, hasValidR2Env } from '@/lib/r2';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { logActivity } from '@/actions/log';

// MOCK DATA GENERATOR
function getMockData() {
    return [
        { id: '1', name: 'Project Alpha', type: 'folder', parent_id: null, size: 4500123, mime_type: null, r2_key: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: '2', name: 'Financial Reports', type: 'folder', parent_id: null, size: 210456, mime_type: null, r2_key: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: '3', name: 'Q3_Earnings_Presentation.pptx', type: 'file', parent_id: null, size: 4500123, mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', r2_key: 'mock-123', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: '4', name: 'employee_handbook.pdf', type: 'file', parent_id: null, size: 210456, mime_type: 'application/pdf', r2_key: 'mock-456', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ] as DriveNode[];
}

export async function fetchNodes(parentId: string | null = null, searchQuery?: string, projectId?: string): Promise<DriveNode[]> {
    if (!hasValidSupabaseEnv) {
        return getMockData();
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
        return getMockData();
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

    const nodePath = await getNodePath(parentId);

    let key = `${projectPart}`;
    if (nodePath) key += `/${nodePath}`;
    key += `/${Date.now()}-${cleanFileName}`;

    const command = new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        ContentType: contentType,
        ChecksumAlgorithm: undefined,
    });

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
        ResponseContentType: mimeType,
        ResponseContentDisposition: 'inline'
    });

    const url = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
    return url;
}

import { DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';

export async function deleteNode(id: string, r2_key: string | null = null) {
    if (!hasValidSupabaseEnv) return { success: true };

    const supabaseServer = await createClient();
    const serviceClient = createServiceClient();

    // 1. Get info
    const { data: nodeInfo } = await supabaseServer.from('share_nodes').select('name, type, project_id').eq('id', id).single();
    if (!nodeInfo) return { success: true };

    // 2. Collect all keys to delete
    let keysToDelete: string[] = [];
    if (nodeInfo.type === 'folder') {
        const { data: descendants } = await serviceClient.rpc('get_all_descendants', { p_node_id: id });
        keysToDelete = (descendants || []).filter((n: any) => n.type === 'file' && n.r2_key).map((n: any) => n.r2_key);
    } else if (r2_key) {
        keysToDelete = [r2_key];
    }

    // 3. Delete from R2 in batches of 1000
    if (keysToDelete.length > 0 && hasValidR2Env) {
        try {
            for (let i = 0; i < keysToDelete.length; i += 1000) {
                const batch = keysToDelete.slice(i, i + 1000);
                await r2Client.send(new DeleteObjectsCommand({
                    Bucket: R2_BUCKET,
                    Delete: { Objects: batch.map(k => ({ Key: k })) }
                }));
            }
        } catch (e) {
            console.error('Batch delete from R2 failed', e);
        }
    }

    // 4. DB Delete
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

export async function isDescendant(childId: string, ancestorId: string) {
    if (childId === ancestorId) return true;
    const { data, error } = await createServiceClient().rpc('is_descendant', {
        child_id: childId,
        ancestor_id: ancestorId
    });
    if (error) return false;
    return !!data;
}
