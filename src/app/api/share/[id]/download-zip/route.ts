import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { r2Client, R2_BUCKET } from '@/lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import bcrypt from 'bcryptjs';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import { isDescendant } from '@/app/actions';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id: linkId } = await params;

        let folderId, passwordAttempt;
        const contentType = req.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            const body = await req.json();
            folderId = body.folderId;
            passwordAttempt = body.passwordAttempt;
        } else {
            const formData = await req.formData();
            folderId = formData.get('folderId')?.toString();
            passwordAttempt = formData.get('passwordAttempt')?.toString();
        }

        if (!folderId) return NextResponse.json({ error: 'Missing folderId' }, { status: 400 });

        // Use service client to bypass RLS for external (unauthenticated) share link users
        const svc = createServiceClient();

        // Verify link
        const { data: link, error: linkError } = await svc
            .from('share_links')
            .select('password_hash, node_id')
            .eq('id', linkId)
            .single();

        if (linkError || !link) {
            console.error('[share/download-zip] Link fetch error:', linkError?.message);
            return NextResponse.json({ error: 'Invalid link' }, { status: 403 });
        }

        // Verify password
        if (link.password_hash) {
            if (!passwordAttempt) return NextResponse.json({ error: 'Password required' }, { status: 401 });
            const isMatch = await bcrypt.compare(passwordAttempt, link.password_hash);
            if (!isMatch) return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
        }

        // Check that requested folder is within the shared root
        const valid = await isDescendant(folderId, link.node_id);
        if (!valid) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

        // Get folder name
        const { data: folderNode, error: folderErr } = await svc
            .from('share_nodes')
            .select('name')
            .eq('id', folderId)
            .single();

        if (folderErr || !folderNode) {
            console.error('[share/download-zip] Folder node fetch error:', folderErr?.message);
            return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
        }
        const folderName = folderNode.name;

        // Get all descendant files using RPC
        const { data: descendantFiles, error: rpcError } = await svc.rpc('get_descendant_files', { folder_uuid: folderId });

        if (rpcError) {
            console.error('[share/download-zip] RPC get_descendant_files error:', rpcError.message, rpcError);
            return NextResponse.json({ error: `RPC error: ${rpcError.message}` }, { status: 500 });
        }

        // Allow empty folder — stream an empty ZIP instead of erroring
        const allFiles = (descendantFiles || []).map((f: { r2_key: string, name: string, rel_path: string }) => ({
            r2_key: f.r2_key,
            name: f.name,
            relPath: f.rel_path,
        }));

        // Setup Zip stream
        const passthrough = new PassThrough();
        const archive = archiver('zip', { zlib: { level: 5 } });

        archive.on('error', (err) => {
            console.error('[share/download-zip] Archiver error:', err);
        });

        archive.pipe(passthrough);

        const addFilesToArchive = async () => {
            for (const file of allFiles) {
                try {
                    const getObj = new GetObjectCommand({ Bucket: R2_BUCKET, Key: file.r2_key });
                    const r2res = await r2Client.send(getObj);
                    if (r2res.Body) {
                        archive.append(r2res.Body as unknown as import('stream').Readable, { name: file.relPath });
                    }
                } catch (e) {
                    console.error('[share/download-zip] Failed to get file from R2:', file.name, e);
                }
            }
            archive.finalize();
        };

        addFilesToArchive();

        // Convert Node PassThrough to Web ReadableStream
        const stream = new ReadableStream({
            start(controller) {
                passthrough.on('data', chunk => controller.enqueue(chunk));
                passthrough.on('end', () => controller.close());
                passthrough.on('error', err => controller.error(err));
            },
            cancel() { passthrough.destroy(); }
        });

        const headers = new Headers();
        headers.set('Content-Type', 'application/zip');
        headers.set('Content-Disposition', `attachment; filename="${folderName}.zip"`);

        return new Response(stream, { headers, status: 200 });

    } catch (e: unknown) {
        console.error('[share/download-zip] Unhandled error:', e instanceof Error ? e.message : e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
