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

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const parentId = formData.get('parentId') as string;
        const projectId = formData.get('projectId') as string;
        let filename = formData.get('filename') as string || file.name;

        if (!file || !projectId) {
            return NextResponse.json({ error: 'Missing Required Fields' }, { status: 400 });
        }

        // 1. Get Project & Path Info
        const { data: project } = await supabase.from('projects')
            .select('id, name').eq('id', projectId).single();

        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        // Get Folder Path
        let folderPath = "";
        if (parentId && parentId !== 'null') {
            const { data: pathNodes } = await supabase.rpc('get_folder_path', { folder_id: parentId });
            if (pathNodes && Array.isArray(pathNodes)) {
                folderPath = [...pathNodes].reverse().map((n: any) => n.name).join('/') + '/';
            }
        }

        // 2. Generate R2 Key
        const safeProjectName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const uniquePrefix = uuidv4().split('-')[0];
        const uniqueKey = `projects/${safeProjectName}/${folderPath}${uniquePrefix}_v1_${filename}`;

        // 3. Upload to R2 (Server-side upload)
        const buffer = Buffer.from(await file.arrayBuffer());

        await r2.send(new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: uniqueKey,
            Body: buffer,
            ContentType: 'text/plain' // Force simple text
        }));

        // 4. Insert into DB
        // Check if updating existing
        const { data: existing } = await supabase.from('storage_nodes')
            .select('id, version')
            .eq('project_id', project.id)
            .eq('parent_id', parentId === 'null' ? null : parentId)
            .eq('name', filename)
            .eq('type', 'FILE')
            .single();

        if (existing) {
            // Update
            await supabase.from('storage_nodes').update({
                r2_key: uniqueKey,
                size: file.size,
                updated_at: new Date().toISOString(),
                version: (existing.version || 1) + 1
            }).eq('id', existing.id);
        } else {
            // Insert
            await supabase.from('storage_nodes').insert({
                name: filename,
                type: 'FILE',
                parent_id: parentId === 'null' ? null : parentId,
                project_id: project.id,
                r2_key: uniqueKey,
                size: file.size,
                mime_type: 'text/plain',
                created_by: user.id,
                owner_email: user.email,
                sharing_scope: 'PRIVATE',
                version: 1
            });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Proxy Upload Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
