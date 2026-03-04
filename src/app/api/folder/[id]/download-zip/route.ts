import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { r2Client, R2_BUCKET } from '@/lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import archiver from 'archiver';
import { PassThrough } from 'stream';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id: folderId } = await params;

        if (!folderId) return NextResponse.json({ error: 'Missing folderId' }, { status: 400 });

        const svc = createServiceClient();

        // Get folder name
        const { data: folderNode } = await svc.from('share_nodes').select('name').eq('id', folderId).single();
        if (!folderNode) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
        const folderName = folderNode.name;

        // Get all descendant files using RPC
        const { data: descendantFiles, error: rpcError } = await svc.rpc('get_descendant_files', { folder_uuid: folderId });

        if (rpcError || !descendantFiles || descendantFiles.length === 0) {
            return NextResponse.json({ error: 'Folder is empty or error reading files' }, { status: 404 });
        }

        const allFiles = descendantFiles.map((f: { r2_key: string, name: string, rel_path: string }) => ({
            r2_key: f.r2_key,
            name: f.name,
            relPath: f.rel_path
        }));

        // Setup Zip stream
        const passthrough = new PassThrough();
        const archive = archiver('zip', {
            zlib: { level: 5 }
        });

        archive.on('error', (err) => {
            console.error('Archiver error:', err);
        });

        archive.pipe(passthrough);

        const addFilesToArchive = async () => {
            for (const file of allFiles) {
                try {
                    const getObj = new GetObjectCommand({
                        Bucket: R2_BUCKET,
                        Key: file.r2_key,
                    });
                    const r2res = await r2Client.send(getObj);
                    if (r2res.Body) {
                        archive.append(r2res.Body as unknown as import('stream').Readable, { name: file.relPath });
                    }
                } catch (e) {
                    console.error('Failed to get file:', file.name, e);
                }
            }
            archive.finalize();
        };

        // Don't await this, let it stream
        addFilesToArchive();

        // Convert PassThrough to Web ReadableStream
        const stream = new ReadableStream({
            start(controller) {
                passthrough.on('data', chunk => controller.enqueue(chunk));
                passthrough.on('end', () => controller.close());
                passthrough.on('error', err => controller.error(err));
            },
            cancel() {
                passthrough.destroy();
            }
        });

        const headers = new Headers();
        headers.set('Content-Type', 'application/zip');
        headers.set('Content-Disposition', `attachment; filename="${folderName}.zip"`);

        return new Response(stream, { headers, status: 200 });

    } catch (e: unknown) {
        console.error('ZIP error:', e instanceof Error ? e.message : 'Unknown error');
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
