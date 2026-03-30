import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env';
import crypto from 'crypto';

// Initialize the AWS S3 client using credentials and region from the environment
const s3Client = new S3Client({
  // Specify the region for the AWS service
  region: env.AWS_REGION,
  // Define credentials for the S3 client
  credentials: {
    // Provide the access key ID from the config
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    // Provide the secret access key from the config
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

// Function to generate a presigned URL that allows a client to upload (PUT) a file directly to S3
export const generateUploadUrl = async (photoKey: string): Promise<string> => {
  // Define the operation to perform on the S3 bucket for the upload
  const command = new PutObjectCommand({
    // Specify the bucket to upload to
    Bucket: env.S3_BUCKET_NAME,
    // Specify the unique key for the photo object
    Key: photoKey,
  });

  // Generate and return the signed URL that expires after the configured duration
  return await getSignedUrl(s3Client, command, { expiresIn: env.S3_PRESIGN_EXPIRES });
};

// Function to generate a presigned URL that allows a client to download (GET) a file from S3
export const generateDownloadUrl = async (photoKey: string): Promise<string> => {
  // Define the operation to perform on the S3 bucket to retrieve the object
  const command = new GetObjectCommand({
    // Specify the bucket where the photo object is stored
    Bucket: env.S3_BUCKET_NAME,
    // Specify the unique key for the photo object to be fetched
    Key: photoKey,
  });

  // Generate and return the signed URL that expires after 1 hour (3600 seconds)
  return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
};

// Function to generate a unique S3 key for storing attendance photos
export const generatePhotoKey = (userId: string): string => {
  // Create a current timestamp in milliseconds to ensure uniqueness over time
  const timestamp = Date.now();
  // Generate a random string to ensure the key is globally unique
  const random = crypto.randomBytes(4).toString('hex');
  // Construct the formatted path for the S3 key
  return `attendance/${userId}/${timestamp}-${random}.jpg`;
};
