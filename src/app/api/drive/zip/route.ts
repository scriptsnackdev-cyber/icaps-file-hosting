import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET_NAME } from '@/lib/r2';
import { createClient } from '@/utils/supabase/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
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

    let allFiles: { key: string; name: string }[] = (files || []).map((f: any) => ({
        key: f.r2_key,
        name: currentPath + f.name
    }));

    // 3. Recurse into subfolders
    if (folders) {
        for (const folder of folders) {
            const subFiles = await getAllFiles(supabase, folder.id, currentPath + folder.name + '/');
            allFiles = [...allFiles, ...subFiles];
        }
    }

    return allFiles;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId');
    const pwd = searchParams.get('pwd');
    const nodeIdsParam = searchParams.get('nodeIds'); // Comma separated IDs
    const nodeIds = nodeIdsParam ? nodeIdsParam.split(',').filter(Boolean) : [];

    if (!folderId && nodeIds.length === 0) {
        return new NextResponse('Folder ID or Node IDs are required', { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let filesToZip: { key: string; name: string }[] = [];
    let zipName = 'download.zip';

    try {
        if (nodeIds.length > 0) {
            // Bulk Selection Mode - Typically requires Auth
            if (!user) return new NextResponse('Unauthorized', { status: 401 });

            zipName = 'bulk_download.zip';

            // Fetch selected nodes - use supabase client for RLS check
            const { data: nodes } = await supabase
                .from('storage_nodes')
                .select('*')
                .in('id', nodeIds);

            if (!nodes || nodes.length === 0) {
                return new NextResponse('No valid files found', { status: 404 });
            }

            for (const node of nodes) {
                if (node.type === 'FILE') {
                    filesToZip.push({
                        key: node.r2_key,
                        name: node.name
                    });
                } else if (node.type === 'FOLDER') {
                    const subFiles = await getAllFiles(supabaseAdmin, node.id, node.name + '/');
                    filesToZip = [...filesToZip, ...subFiles];
                }
            }
            if (nodes.length === 1 && nodes[0].type === 'FOLDER') {
                zipName = `${nodes[0].name}.zip`;
            }

        } else if (folderId) {
            // Single Folder Mode - Support Public Sharing
            // 1. Fetch metadata with Admin to check availability
            const { data: folder } = await supabaseAdmin.from('storage_nodes').select('*').eq('id', folderId).single();
            if (!folder) return new NextResponse('Folder not found', { status: 404 });

            // 2. Check Access
            let hasAccess = false;

            // Check if it's PUBLIC
            if (folder.sharing_scope === 'PUBLIC') {
                if (folder.share_password) {
                    if (pwd === folder.share_password) {
                        hasAccess = true;
                    } else {
                        return new NextResponse('Invalid Password', { status: 403 });
                    }
                } else {
                    hasAccess = true;
                }
            } else {
                // If not public, check if current user has access via RLS or is owner
                if (user) {
                    // Try to fetch via normal client to check RLS
                    const { data: authTest } = await supabase.from('storage_nodes').select('id').eq('id', folderId).maybeSingle();
                    if (authTest) hasAccess = true;
                }
            }

            if (!hasAccess) {
                return new NextResponse('Unauthorized: Access Denied', { status: 403 });
            }

            zipName = `${folder.name}.zip`;
            filesToZip = await getAllFiles(supabaseAdmin, folderId);
        }

        if (filesToZip.length === 0) {
            return new NextResponse('Selection is empty', { status: 400 });
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
                    archive.append(stream as any, { name: file.name });
                }
            } catch (err) {
                console.error(`Failed to download ${file.name}`, err);
                archive.append(Buffer.from(`Error downloading this file.`), { name: file.name + '.error.txt' });
            }
        }

        archive.finalize();

        return new NextResponse(passThrough as any, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${zipName}"`,
            },
        });

    } catch (error: any) {
        console.error('ZIP Error:', error);
        return new NextResponse('Failed to generate ZIP', { status: 500 });
    }
}
