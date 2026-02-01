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
        // Read Metadata from Headers
        const rawFilename = request.headers.get('x-filename');
        const parentId = request.headers.get('x-parent-id');
        const projectId = request.headers.get('x-project-id');
        const skipDb = request.headers.get('x-skip-db') === 'true';
        const contentType = request.headers.get('content-type') || 'application/octet-stream';

        if (!rawFilename || !projectId) {
            return NextResponse.json({ error: 'Missing Required Headers (x-filename, x-project-id)' }, { status: 400 });
        }

        const filename = decodeURIComponent(rawFilename);

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
        // Read raw body
        const arrayBuffer = await request.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        console.log(`[Proxy] Uploading to R2: Bucket=${R2_BUCKET_NAME}, Key=${uniqueKey}, Size=${buffer.length}`);

        try {
            await r2.send(new PutObjectCommand({
                Bucket: R2_BUCKET_NAME,
                Key: uniqueKey,
                Body: buffer,
                ContentType: contentType
            }));
            console.log(`[Proxy] R2 Upload Success: ${uniqueKey}`);
        } catch (r2Error: any) {
            console.error(`[Proxy] R2 Upload FAILED: Bucket=${R2_BUCKET_NAME}, Key=${uniqueKey}`, r2Error);
            throw new Error(`R2 Upload Failed: ${r2Error.message}`);
        }

        if (skipDb) {
            return NextResponse.json({
                success: true,
                key: uniqueKey,
                size: buffer.length,
                type: contentType,
                filename: filename,
                projectId: project.id // Return resolved project ID
            });
        }

        // 4. Insert into DB (Legacy / Planner mode)
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
                size: buffer.length,
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
                size: buffer.length,
                mime_type: contentType,
                created_by: user.id,
                owner_email: user.email,
                sharing_scope: 'PRIVATE',
                version: 1
            });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Proxy Upload Global Error:', error);
        return NextResponse.json({
            error: error.message || 'Internal Server Error',
            stack: error.stack,
            details: JSON.stringify(error)
        }, { status: 500 });
    }
}
