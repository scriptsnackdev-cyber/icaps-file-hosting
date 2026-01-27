import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET_NAME } from '@/lib/r2';
import { createClient } from '@/utils/supabase/server';

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
    await supabase.from('access_logs').insert({
        user_email: user?.email || 'anonymous',
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
        // Enforce Auth for Download too? Usually yes for private files.
        const { isWhitelisted } = await checkAuth();
        // If you want strict privacy, un-comment this:
        if (!isWhitelisted) {
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
