import { NextResponse } from 'next/server';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET_NAME } from '@/lib/r2';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
    // 1. Check if R2 is Configured
    if (!R2_BUCKET_NAME) {
        return NextResponse.json({ error: 'R2_BUCKET_NAME is not configured' }, { status: 500 });
    }

    // 2. Auth Check (Important!)
    // We must protect the "List Files" API as well, otherwise anyone can see the file names.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        // If not logged in, return 401 Unauthorized
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 3. Whitelist Check (Optional but Recommended)
    // Even if logged in, we might want to ensure they are still in the whitelist.
    const { data: whitelistData } = await supabase
        .from('whitelist')
        .select('email')
        .eq('email', user.email)
        .single();

    if (!whitelistData) {
        return NextResponse.json({ error: 'Access Denied: Not Whitelisted' }, { status: 403 });
    }

    try {
        const command = new ListObjectsV2Command({
            Bucket: R2_BUCKET_NAME,
        });

        const data = await r2.send(command);

        const objects = data.Contents?.map((item) => ({
            key: item.Key,
            size: item.Size,
            uploaded: item.LastModified?.toISOString(),
            etag: item.ETag,
        })) || [];

        return NextResponse.json({
            objects,
            truncated: data.IsTruncated,
            cursor: data.NextContinuationToken,
        });
    } catch (error: any) {
        console.error('Error listing files:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
