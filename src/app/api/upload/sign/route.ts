import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client, R2_BUCKET, hasValidR2Env } from '@/lib/r2';
import { createClient } from '@/utils/supabase/server';

// NOTE: To COMPLETELY bypass Vercel (including the signature step), 
// you can move this logic to a Cloudflare Worker and call it from the client.
// This route handler is a "Direct Upload" middle-ground that avoids Server Action limits.
export async function POST(request: NextRequest) {
    try {
        if (!hasValidR2Env) {
            return NextResponse.json({ error: 'R2 not configured' }, { status: 500 });
        }

        const { fileName, contentType, projectId, parentId } = await request.json();

        if (!fileName || !contentType) {
            return NextResponse.json({ error: 'Missing fileName or contentType' }, { status: 400 });
        }

        // Clean filename
        const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const projectPart = projectId || 'unassigned';

        // Generate key: ${projectId}/${timestamp}-${filename}
        // Note: For simplicity and to avoid recursive DB calls during sign, 
        // we use a flatter structure if parentId is not provided, 
        // but we'll use the projectId and timestamp to keep it unique.
        const key = `${projectPart}/${Date.now()}-${cleanFileName}`;

        const command = new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            ContentType: contentType,
            ChecksumAlgorithm: undefined,
        });

        // Sign the URL
        const uploadUrl = await getSignedUrl(r2Client, command, {
            expiresIn: 3600,
            signableHeaders: new Set(['host', 'content-type'])
        });

        return NextResponse.json({ uploadUrl, key });
    } catch (error: any) {
        console.error('Error in /api/upload/sign:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
