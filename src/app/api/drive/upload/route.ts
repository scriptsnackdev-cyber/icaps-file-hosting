import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET_NAME } from '@/lib/r2';
import { createClient } from '@/utils/supabase/server';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check Whitelist (Optional but good)
    const { data: whitelistData } = await supabase.from('whitelist').select('email').eq('email', user.email).single();
    if (!whitelistData) return NextResponse.json({ error: 'Access Denied' }, { status: 403 });

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const parentId = formData.get('parentId') as string | null;
        const projectId = formData.get('projectId') as string | null;
        const resolution = formData.get('resolution') as 'update' | 'overwrite' | null;

        if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        if (!projectId) return NextResponse.json({ error: 'Project context required' }, { status: 400 });

        // Resolve Project ID... (existing logic)
        let resolvedProjectId = projectId;
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);

        if (!isUUID) {
            const { data: projs } = await supabase.from('projects').select('id').eq('name', decodeURIComponent(projectId)).limit(1);
            if (projs && projs.length > 0) resolvedProjectId = projs[0].id;
            else return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        // --- CONFLICT CHECK ---
        let existingNodeQuery = supabase
            .from('storage_nodes')
            .select('*')
            .eq('project_id', resolvedProjectId)
            .eq('name', file.name)
            .eq('type', 'FILE');

        if (parentId && parentId !== 'null') existingNodeQuery = existingNodeQuery.eq('parent_id', parentId);
        else existingNodeQuery = existingNodeQuery.is('parent_id', null);

        const { data: existingNodes } = await existingNodeQuery.order('version', { ascending: false });
        const latestNode = existingNodes?.[0];

        if (latestNode && !resolution) {
            // Check Admin status for overwrite permission later
            const { data: whitelistUser } = await supabase.from('whitelist').select('role').eq('email', user.email).single();
            const isAdmin = whitelistUser?.role === 'admin';
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
                // Permission Check
                const { data: whitelistUser } = await supabase.from('whitelist').select('role').eq('email', user.email).single();
                const isAdmin = whitelistUser?.role === 'admin';
                const isOwner = latestNode.created_by === user.id || latestNode.owner_email === user.email;

                if (!isAdmin && !isOwner) {
                    return NextResponse.json({ error: 'Forbidden: Only owner or admin can overwrite.' }, { status: 403 });
                }
                overwriteNodeId = latestNode.id;
                targetVersion = latestNode.version || 1;
            }
        }

        // Fetch Project for quota...
        const { data: project, error: projError } = await supabase
            .from('projects')
            .select('id, name, max_storage_bytes, current_storage_bytes')
            .eq('id', resolvedProjectId)
            .single();

        if (projError || !project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        // Adjust Quota check for overwrite (subtract old size)
        const sizeDiff = overwriteNodeId ? (file.size - (latestNode.size || 0)) : file.size;

        if (project.current_storage_bytes + sizeDiff > project.max_storage_bytes) {
            return NextResponse.json({ error: `Storage Limit Exceeded! Max: ${(project.max_storage_bytes / 1073741824).toFixed(2)} GB` }, { status: 403 });
        }

        // Get folder path...
        let folderPath = "";
        if (parentId && parentId !== 'null') {
            const { data: pathNodes } = await supabase.rpc('get_folder_path', { folder_id: parentId });
            if (pathNodes && Array.isArray(pathNodes)) {
                folderPath = [...pathNodes].reverse().map((n: any) => n.name).join('/') + '/';
            }
        }

        // 1. Generate R2 Key
        const safeProjectName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const uniquePrefix = uuidv4().split('-')[0];
        const uniqueKey = `projects/${safeProjectName}/${folderPath}${uniquePrefix}_v${targetVersion}_${file.name}`;

        // 2. Upload to R2
        const buffer = Buffer.from(await file.arrayBuffer());
        await r2.send(new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: uniqueKey,
            Body: buffer,
            ContentType: file.type,
        }));

        // Delete old physical file if overwriting
        if (overwriteNodeId && latestNode.r2_key) {
            try {
                const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
                await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: latestNode.r2_key }));
            } catch (e) { console.error("Failed to delete old version during overwrite", e); }
        }

        // 3. Create or Update DB Record
        let node;
        let dbError;

        if (overwriteNodeId) {
            const { data, error } = await supabase.from('storage_nodes').update({
                r2_key: uniqueKey,
                size: file.size,
                updated_at: new Date().toISOString(),
                // Keep version same
            }).eq('id', overwriteNodeId).select().single();
            node = data;
            dbError = error;
        } else {
            const { data, error } = await supabase.from('storage_nodes').insert({
                name: file.name,
                type: 'FILE',
                parent_id: parentId === 'null' ? null : parentId,
                project_id: project.id,
                r2_key: uniqueKey,
                size: file.size,
                mime_type: file.type,
                created_by: user.id,
                owner_email: user.email,
                sharing_scope: 'PRIVATE',
                version: targetVersion
            }).select().single();
            node = data;
            dbError = error;
        }

        if (dbError) throw dbError;

        // Update Project Usage
        const { error: rpcError } = await supabase.rpc('increment_project_storage', {
            p_id: project.id,
            amount: sizeDiff
        });

        if (rpcError) {
            console.error("RPC Error updating quota:", rpcError);
            // Fallback
            await supabase.from('projects')
                .update({ current_storage_bytes: project.current_storage_bytes + file.size })
                .eq('id', project.id);
        }

        // 4. Log
        await supabase.from('access_logs').insert({
            user_email: user.email,
            action: 'UPLOAD',
            file_key: uniqueKey,
            details: `Project: ${project.name} (${projectId})`
        });

        return NextResponse.json(node);

    } catch (error: any) {
        console.error('Upload Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
