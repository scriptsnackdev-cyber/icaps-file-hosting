'use server';

import { hasValidSupabaseEnv } from '@/lib/supabase';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import bcrypt from 'bcryptjs';
import { logActivity } from '@/actions/log';
import { isDescendant, getDownloadUrl, getPreviewUrl } from '@/actions/node';
import { DriveNode } from '@/lib/supabase';

export async function createShareLink(nodeId: string, passwordAttempt?: string, expiresAt?: string) {
    if (!hasValidSupabaseEnv) return { success: true, linkId: Date.now().toString() };

    let passwordHash = null;
    if (passwordAttempt) {
        passwordHash = await bcrypt.hash(passwordAttempt, 10);
    }

    const supabaseServer = await createClient();

    const { data, error } = await supabaseServer.from('share_links').insert([{
        node_id: nodeId,
        password_hash: passwordHash,
        expires_at: expiresAt || null
    }]).select('id').single();

    if (error || !data) throw new Error(error?.message || 'Failed to create link');

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

    const { data: linkData, error: linkError } = await svc
        .from('share_links')
        .select('id, node_id, password_hash, expires_at')
        .eq('id', linkId)
        .single();

    if (linkError || !linkData) return null;

    if (linkData.expires_at && new Date(linkData.expires_at) < new Date()) return null;

    const { data: nodeData } = await svc
        .from('share_nodes')
        .select('id, name, size, mime_type, type, project_id, parent_id')
        .eq('id', linkData.node_id)
        .single();

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

    const { data: linkData, error: linkError } = await svc
        .from('share_links')
        .select('node_id, password_hash, expires_at')
        .eq('id', linkId)
        .single();

    if (linkError || !linkData) return { error: 'Link not found or expired' };

    if (linkData.expires_at && new Date(linkData.expires_at) < new Date()) return { error: 'Link expired' };

    if (linkData.password_hash) {
        if (!passwordAttempt) return { error: 'Password required' };

        const isMatch = await bcrypt.compare(passwordAttempt, linkData.password_hash);
        if (!isMatch) return { error: 'Incorrect password' };
    }

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

    const url = await getDownloadUrl(node.r2_key, node.name);
    return { success: true, type: 'file', downloadUrl: url, fileName: node.name };
}

export async function getSharedFolderContents(linkId: string, folderId: string, passwordAttempt?: string) {
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

    const valid = await isDescendant(folderId, link.node_id);
    if (!valid) return { error: 'Access denied' };

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
