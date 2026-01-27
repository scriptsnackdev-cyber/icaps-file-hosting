import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET_NAME } from '@/lib/r2';
import { createClient } from '@/utils/supabase/server';
import archiver from 'archiver';
import { PassThrough } from 'stream';

// Helper to recursively fetch all files in a folder structure
async function getAllFiles(supabase: any, folderId: string, currentPath: string = '') {
    // 1. Get direct files
    const { data: files } = await supabase
        .from('storage_nodes')
        .select('*')
        .eq('parent_id', folderId)
        .eq('type', 'FILE');

    // 2. Get direct subfolders
    const { data: folders } = await supabase
        .from('storage_nodes')
        .select('*')
        .eq('parent_id', folderId)
        .eq('type', 'FOLDER');

    let allFiles: { key: string; name: string }[] = files.map((f: any) => ({
        key: f.r2_key,
        name: currentPath + f.name
    }));

    // 3. Recurse into subfolders
    for (const folder of folders) {
        const subFiles = await getAllFiles(supabase, folder.id, currentPath + folder.name + '/');
        allFiles = [...allFiles, ...subFiles];
    }

    return allFiles;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId');

    if (!folderId) {
        return new NextResponse('Folder ID is required', { status: 400 });
    }

    // AUTH / SHARE CHECK
    // If accessed via share link logic, we might need to validate permission differently.
    // For now, assuming this is called from the authenticated dashboard OR a valid public share page which checks logic.
    // Ideally updateSession/middleware handles auth, but for public download we need the NODE info to check "sharing_scope".

    const supabase = await createClient();

    // Check if folder exists and is accessible
    const { data: folder } = await supabase.from('storage_nodes').select('*').eq('id', folderId).single();
    if (!folder) return new NextResponse('Folder not found', { status: 404 });

    // REAL permission check: Is user owner? OR Is file Public?
    // For this demo, if it's not PUBLIC, we check Auth.
    // const { data: { user } } = await supabase.auth.getUser();
    // if (folder.sharing_scope === 'PRIVATE' && !user) {
    //     return new NextResponse('Unauthorized', { status: 401 });
    // }

    try {
        const filesToZip = await getAllFiles(supabase, folderId);

        if (filesToZip.length === 0) {
            return new NextResponse('Folder is empty', { status: 400 });
        }

        // Create PassThrough stream to pipe archiver to response
        const passThrough = new PassThrough();
        const archive = archiver('zip', { zlib: { level: 9 } });

        archive.pipe(passThrough);

        // Process files concurrently-ish (be careful with limits)
        for (const file of filesToZip) {
            try {
                const command = new GetObjectCommand({
                    Bucket: R2_BUCKET_NAME,
                    Key: file.key,
                });
                const s3Response = await r2.send(command);
                const stream = s3Response.Body;
                if (stream) {
                    // Cast to any to bypass type mismatch between Web and Node streams
                    // In a Node.js environment, the SDK stream implements Node Readable
                    archive.append(stream as any, { name: file.name });
                }
            } catch (err) {
                console.error(`Failed to download ${file.name}`, err);
                // Optionally append a text file saying it failed?
                archive.append(Buffer.from(`Error downloading this file.`), { name: file.name + '.error.txt' });
            }
        }

        archive.finalize();

        return new NextResponse(passThrough as any, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${folder.name}.zip"`,
            },
        });

    } catch (error: any) {
        console.error('ZIP Error:', error);
        return new NextResponse('Failed to generate ZIP', { status: 500 });
    }
}
