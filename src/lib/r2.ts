import { S3Client } from '@aws-sdk/client-s3';

const endpoint = process.env.R2_ENDPOINT || 'https://mock.r2.cloudflarestorage.com';
const accessKeyId = process.env.R2_ACCESS_KEY_ID || 'mock-access-key';
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || 'mock-secret-key';

export const hasValidR2Env =
    !!process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_ACCESS_KEY_ID !== 'mock-access-key' &&
    process.env.R2_ACCESS_KEY_ID !== 'YOUR_R2_ACCESS_KEY_ID';

export const r2Client = new S3Client({
    region: 'auto',
    endpoint: endpoint,
    credentials: {
        accessKeyId,
        secretAccessKey,
    },
    // CRITICAL: Disable "Flexible Checksums" which R2 does not support and cause ERR_CONNECTION_CLOSED
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
});

export const R2_BUCKET = process.env.R2_BUCKET_NAME || 'mock-bucket';
export const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
