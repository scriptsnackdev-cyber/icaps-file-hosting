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

        if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        if (!projectId) return NextResponse.json({ error: 'Project context required' }, { status: 400 });

        // Resolve Project ID if it's a name/slug
        let resolvedProjectId = projectId;
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);

        if (!isUUID) {
            const { data: projs } = await supabase
                .from('projects')
                .select('id')
                .eq('name', decodeURIComponent(projectId))
                .limit(1);

            if (projs && projs.length > 0) {
                resolvedProjectId = projs[0].id;
            } else {
                return NextResponse.json({ error: 'Project not found' }, { status: 404 });
            }
        }

        // 0. FETCH PROJECT AND FOLDER PATH
        const { data: project, error: projError } = await supabase
            .from('projects')
            .select('id, name, max_storage_bytes, current_storage_bytes') // Also get ID!
            .eq('id', resolvedProjectId)
            .single();

        if (projError || !project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        if (project.current_storage_bytes + file.size > project.max_storage_bytes) {
            return NextResponse.json({ error: `Storage Limit Exceeded! Max: ${(project.max_storage_bytes / 1073741824).toFixed(2)} GB` }, { status: 403 });
        }

        // Get folder path
        let folderPath = "";
        if (parentId && parentId !== 'null') {
            const { data: pathNodes } = await supabase.rpc('get_folder_path', { folder_id: parentId });
            if (pathNodes && Array.isArray(pathNodes)) {
                // pathNodes is [child, parent, grandparent], so we reverse it
                folderPath = [...pathNodes].reverse().map((n: any) => n.name).join('/') + '/';
            }
        }

        // 1. Generate Descriptive R2 Key
        // Format: projects/{projectName}/{folderPath}{uuid}_{fileName}
        const safeProjectName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const uniquePrefix = uuidv4().split('-')[0];
        const uniqueKey = `projects/${safeProjectName}/${folderPath}${uniquePrefix}_${file.name}`;

        // 2. Upload to R2
        const buffer = Buffer.from(await file.arrayBuffer());

        await r2.send(new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: uniqueKey,
            Body: buffer,
            ContentType: file.type,
        }));

        // 3. Create DB Record AND Update Quota
        const { data: node, error: dbError } = await supabase.from('storage_nodes').insert({
            name: file.name,
            type: 'FILE',
            parent_id: parentId === 'null' ? null : parentId,
            project_id: project.id,
            r2_key: uniqueKey,
            size: file.size,
            mime_type: file.type,
            created_by: user.id,
            owner_email: user.email,
            sharing_scope: 'PRIVATE'
        }).select().single();

        if (dbError) throw dbError;

        // Update Project Usage (Critical!)
        const { error: rpcError } = await supabase.rpc('increment_project_storage', {
            p_id: project.id,
            amount: file.size
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
