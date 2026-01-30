
import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2, R2_BUCKET_NAME } from '@/lib/r2';
import { createClient } from '@/utils/supabase/server';

// Helper to check Authorization and Whitelist
async function checkAuth() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { user: null, isWhitelisted: false };

    const { data: whitelistData } = await supabase
        .from('whitelist')
        .select('email')
        .eq('email', user.email)
        .single();

    return { user, isWhitelisted: !!whitelistData };
}

export async function POST(request: NextRequest) {
    try {
        const { filename, contentType } = await request.json();

        if (!filename) {
            return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
        }

        // AUTH CHECK
        const { user, isWhitelisted } = await checkAuth();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!isWhitelisted) {
            return NextResponse.json({ error: 'Access Denied: Not Whitelisted' }, { status: 403 });
        }

        const key = filename;

        const command = new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
            ContentType: contentType || 'application/octet-stream',
        });

        const signedUrl = await getSignedUrl(r2, command, { expiresIn: 3600 });

        return NextResponse.json({ url: signedUrl, key });
    } catch (error: any) {
        console.error('Error generating presigned URL:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
