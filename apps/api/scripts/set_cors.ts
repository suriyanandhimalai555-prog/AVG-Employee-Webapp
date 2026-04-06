import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the api root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const region = process.env.AWS_REGION || 'ap-south-2';
const bucket = process.env.AWS_S3_BUCKET_NAME || 'avg-employee-management-bucket';

// Check for required AWS environment variables
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error("❌ AWS credentials missing in environment variables.");
  process.exit(1);
}

const s3Client = new S3Client({ region });

async function configureCors() {
  try {
    const command = new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
            // Frontend domains that can access the S3 bucket
            AllowedOrigins: [
              'http://localhost:5173',
              'http://localhost:5174',
              'http://localhost:5175',
              'http://localhost:5176',
              'http://localhost:5177',
              'http://localhost:5178',
              'http://localhost:5179',
              'http://localhost:4173',
              'https://ems.avgprimetech.com',
            ],
            // Expose these headers so the browser can read S3 responses
            // ETag is needed for upload confirmations; checksum headers are added by AWS SDK v3
            ExposeHeaders: [
              'ETag',
              'x-amz-checksum-crc32',
              'x-amz-checksum-sha1',
              'x-amz-checksum-sha256',
            ],
            MaxAgeSeconds: 3000,
          },
        ],
      },
    });

    console.log(`📡 Applying strict CORS configuration to S3 bucket: ${bucket}...`);
    await s3Client.send(command);
    console.log("✅ Success: S3 Bucket CORS rules successfully updated.");
  } catch (error) {
    console.error("❌ Failed to configure CORS:", error);
    process.exit(1);
  }
}

configureCors();
