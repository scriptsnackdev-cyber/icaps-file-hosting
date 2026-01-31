
import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2, R2_BUCKET_NAME } from '@/lib/r2';
import { createClient } from '@/utils/supabase/server';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const {
            filename,
            fileSize,
            fileType,
            parentId,
            projectId,
            resolution,
            silent
        } = body;

        if (!filename) return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
        if (!projectId) return NextResponse.json({ error: 'Project context required' }, { status: 400 });

        // [Performance] Parallelize Initial Lookups
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);

        const whitelistPromise = supabase.from('whitelist').select('email, role').eq('email', user.email).single();

        let projectPromise;
        if (isUUID) {
            projectPromise = supabase
                .from('projects')
                .select('id, name, max_storage_bytes, current_storage_bytes, settings')
                .eq('id', projectId)
                .single();
        } else {
            projectPromise = supabase
                .from('projects')
                .select('id, name, max_storage_bytes, current_storage_bytes, settings')
                .eq('name', decodeURIComponent(projectId))
                .maybeSingle();
        }

        const [whitelistRes, projectRes] = await Promise.all([whitelistPromise, projectPromise]);

        const whitelistData = whitelistRes.data;
        if (!whitelistData) return NextResponse.json({ error: 'Access Denied' }, { status: 403 });

        const project = projectRes.data;
        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        const resolvedProjectId = project.id;

        // --- READ ONLY CHECK ---
        if (project.settings?.read_only && whitelistData.role !== 'admin') {
            return NextResponse.json({ error: 'This project is in Read-Only mode.' }, { status: 403 });
        }

        // [Performance] Parallelize Conflict Check & Folder Path
        let existingNodeQuery = supabase
            .from('storage_nodes')
            .select('*')
            .eq('project_id', resolvedProjectId)
            .eq('name', filename)
            .eq('type', 'FILE');

        if (parentId && parentId !== 'null') existingNodeQuery = existingNodeQuery.eq('parent_id', parentId);
        else existingNodeQuery = existingNodeQuery.is('parent_id', null);

        const conflictPromise = existingNodeQuery.order('version', { ascending: false });

        let folderPathPromise;
        if (parentId && parentId !== 'null') {
            folderPathPromise = supabase.rpc('get_folder_path', { folder_id: parentId });
        } else {
            folderPathPromise = Promise.resolve({ data: [] });
        }

        const [conflictRes, folderPathRes] = await Promise.all([conflictPromise, folderPathPromise]);

        const existingNodes = conflictRes.data;
        const latestNode = existingNodes?.[0];

        // --- CONFLICT HANDLING ---
        if (latestNode && !resolution) {
            const isAdmin = whitelistData.role === 'admin';
            const isOwner = latestNode.created_by === user.id || latestNode.owner_email === user.email;

            return NextResponse.json({
                conflict: true,
                existing: {
                    id: latestNode.id,
                    name: latestNode.name,
                    version: latestNode.version || 1,
                    owner: latestNode.owner_email,
                    isOwnerOrAdmin: isOwner || isAdmin
                }
            }, { status: 409 });
        }

        // --- RESOLUTION LOGIC ---
        let targetVersion = 1;
        let overwriteNodeId = null;

        if (latestNode) {
            if (resolution === 'update') {
                targetVersion = (latestNode.version || 1) + 1;
            } else if (resolution === 'overwrite') {
                const isAdmin = whitelistData.role === 'admin';
                const isOwner = latestNode.created_by === user.id || latestNode.owner_email === user.email;

                if (!isAdmin && !isOwner) {
                    return NextResponse.json({ error: 'Forbidden: Only owner or admin can overwrite.' }, { status: 403 });
                }
                overwriteNodeId = latestNode.id;
                targetVersion = latestNode.version || 1;
            }
        }

        // Adjust Quota check
        const sizeDiff = overwriteNodeId ? (fileSize - (latestNode.size || 0)) : fileSize;

        if (project.current_storage_bytes + sizeDiff > project.max_storage_bytes) {
            return NextResponse.json({ error: `Storage Limit Exceeded! Max: ${(project.max_storage_bytes / 1073741824).toFixed(2)} GB` }, { status: 403 });
        }

        // Get folder path string
        let folderPath = "";
        const pathNodes = folderPathRes.data;
        if (pathNodes && Array.isArray(pathNodes) && pathNodes.length > 0) {
            folderPath = [...pathNodes].reverse().map((n: any) => n.name).join('/') + '/';
        }

        // 1. Generate R2 Key
        const safeProjectName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const uniquePrefix = uuidv4().split('-')[0];
        const uniqueKey = `projects/${safeProjectName}/${folderPath}${uniquePrefix}_v${targetVersion}_${filename}`;

        // 2. Generate Presigned URL
        const command = new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: uniqueKey,
            ContentType: fileType || 'application/octet-stream',
        });

        const signedUrl = await getSignedUrl(r2, command, { expiresIn: 3600 });

        return NextResponse.json({
            url: signedUrl,
            key: uniqueKey,
            resolvedProjectId,
            targetVersion,
            overwriteNodeId,
            sizeDiff
        });

    } catch (error: any) {
        console.error('Upload Init Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
