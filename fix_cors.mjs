
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import fs from 'fs';
import path from 'path';

// Load env vars manually since we don't want to depend on dotenv being installed
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');

const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        let value = match[2].trim();
        // Remove quotes if present
        if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
        }
        env[match[1].trim()] = value;
    }
});

const R2_BUCKET_NAME = env.R2_BUCKET_NAME;
const R2_ENDPOINT = env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = env.R2_SECRET_ACCESS_KEY;

if (!R2_BUCKET_NAME || !R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.error("Missing required environment variables in .env.local");
    process.exit(1);
}

const client = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
});

const run = async () => {
    console.log(`Setting CORS for bucket: ${R2_BUCKET_NAME}...`);

    try {
        await client.send(new PutBucketCorsCommand({
            Bucket: R2_BUCKET_NAME,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedHeaders: ["*", "authorization", "content-type", "x-amz-date", "x-amz-content-sha256", "x-amz-user-agent"],
                        AllowedMethods: ["PUT", "POST", "GET", "HEAD", "DELETE"],
                        AllowedOrigins: ["http://localhost:3000", "http://localhost:3001"], // Add more if needed
                        ExposeHeaders: ["ETag"],
                        MaxAgeSeconds: 3600
                    }
                ]
            }
        }));
        console.log("Successfully set CORS configuration.");
    } catch (err) {
        console.error("Error setting CORS:", err);
    }
};

run();
