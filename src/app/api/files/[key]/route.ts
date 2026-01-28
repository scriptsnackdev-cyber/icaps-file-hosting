import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET_NAME } from '@/lib/r2';
import { createClient } from '@/utils/supabase/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Helper to check Authorization and Whitelist
async function checkAuth() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { user: null, isWhitelisted: false };

    // Check Whitelist
    const { data: whitelistData } = await supabase
        .from('whitelist')
        .select('email')
        .eq('email', user.email)
        .single();

    return { user, isWhitelisted: !!whitelistData };
}

async function logActivity(action: 'UPLOAD' | 'DOWNLOAD' | 'DELETE', fileKey: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Fire and forget (don't await) unless critical
    // Ideally we await to ensure log is written
    const email = user?.email || 'anonymous'; // Update to handle anonymous logging

    // We use admin client here if user is not logged in to ensure log is written? 
    // Actually access_logs might require auth. Let's use service role for logging to be safe if anonymous.
    await supabaseAdmin.from('access_logs').insert({
        user_email: email,
        action: action,
        file_key: fileKey,
    });
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ key: string }> }
) {
    const { key } = await params;
    const decodedKey = decodeURIComponent(key);

    try {
        const { isWhitelisted } = await checkAuth();
        let hasAccess = isWhitelisted;

        if (!hasAccess) {
            // Check Public Access via Database
            const { data: node } = await supabaseAdmin
                .from('storage_nodes')
                .select('sharing_scope, share_password')
                .eq('r2_key', decodedKey)
                .maybeSingle(); // Use maybeSingle to avoid 406 if multiple (shouldn't happen, but safe) or 0

            if (node && node.sharing_scope === 'PUBLIC') {
                if (node.share_password) {
                    const pwd = request.nextUrl.searchParams.get('pwd');
                    if (pwd === node.share_password) {
                        hasAccess = true;
                    }
                } else {
                    hasAccess = true;
                }
            }
        }

        if (!hasAccess) {
            return new NextResponse('Unauthorized: Access Restricted', { status: 403 });
        }

        const command = new GetObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: decodedKey,
        });

        const response = await r2.send(command);

        // LOGGING
        await logActivity('DOWNLOAD', decodedKey);

        const body = response.Body as unknown as BodyInit;

        const filename = request.nextUrl.searchParams.get('filename');
        const headers: HeadersInit = {
            'Content-Type': response.ContentType || 'application/octet-stream',
            'Content-Length': response.ContentLength?.toString() || '',
            'ETag': response.ETag || '',
        };

        if (filename) {
            // Encode filename for Content-Disposition to handle Thai/Special characters
            const encodedFilename = encodeURIComponent(filename);
            headers['Content-Disposition'] = `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`;
        }

        return new NextResponse(body, { headers });

    } catch (error: any) {
        if (error.name === 'NoSuchKey') {
            return new NextResponse('Not Found', { status: 404 });
        }
        console.error('Error downloading file:', error);
        return new NextResponse(error.message, { status: 500 });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ key: string }> }
) {
    const { key } = await params;
    const decodedKey = decodeURIComponent(key);

    // AUTH CHECK & WHITELIST CHECK
    const { user, isWhitelisted } = await checkAuth();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isWhitelisted) {
        return NextResponse.json({ error: 'Access Denied: Not Whitelisted' }, { status: 403 });
    }

    try {
        const arrayBuffer = await request.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const command = new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: decodedKey,
            Body: buffer,
        });

        await r2.send(command);

        // LOGGING
        await logActivity('UPLOAD', decodedKey);

        return NextResponse.json({ success: true, key: decodedKey });
    } catch (error: any) {
        console.error('Error uploading file:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ key: string }> }
) {
    const { key } = await params;
    const decodedKey = decodeURIComponent(key);

    // AUTH CHECK & WHITELIST CHECK
    const { user, isWhitelisted } = await checkAuth();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isWhitelisted) {
        return NextResponse.json({ error: 'Access Denied: Not Whitelisted' }, { status: 403 });
    }

    try {
        const command = new DeleteObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: decodedKey,
        });

        await r2.send(command);

        // LOGGING
        await logActivity('DELETE', decodedKey);

        return NextResponse.json({ success: true, key: decodedKey });
    } catch (error: any) {
        console.error('Error deleting file:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
