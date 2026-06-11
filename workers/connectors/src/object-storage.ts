import {
  CopyObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { config } from "./config.js";

export const STORAGE_PROVIDER = "s3";

const client = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.S3_ACCESS_KEY,
    secretAccessKey: config.S3_SECRET_KEY,
  },
});

export function storageBucket(): string {
  return config.S3_BUCKET;
}

// Capture bodies are bounded buffers (the capture enforces byte limits while
// streaming), so a single PutObject is sufficient here.
export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<{ etag: string | null }> {
  const result = await client.send(
    new PutObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { etag: result.ETag?.replaceAll('"', "") ?? null };
}

export async function copyObject(
  sourceKey: string,
  destinationKey: string,
): Promise<{ etag: string | null }> {
  const result = await client.send(
    new CopyObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: destinationKey,
      CopySource: `${config.S3_BUCKET}/${sourceKey}`,
    }),
  );
  return { etag: result.CopyObjectResult?.ETag?.replaceAll('"', "") ?? null };
}

export async function deleteObjectQuietly(key: string): Promise<void> {
  try {
    await client.send(
      new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }),
    );
  } catch {
    // Leftover temporary objects are reclaimed by lifecycle cleanup.
  }
}
