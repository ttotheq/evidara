import type { Readable } from "node:stream";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";

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

export class UploadTimeoutError extends Error {
  constructor() {
    super("The upload did not complete within the allowed time.");
    this.name = "UploadTimeoutError";
  }
}

// Streams a body of unknown length to object storage. Aborts (and removes
// already-transferred parts) when the timeout elapses.
export async function putObjectStream(
  key: string,
  body: Readable,
  contentType: string,
  timeoutMs: number,
): Promise<{ etag: string | null }> {
  const upload = new Upload({
    client,
    params: {
      Bucket: config.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    },
    leavePartsOnError: false,
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void upload.abort().catch(() => undefined);
  }, timeoutMs);

  try {
    const result = await upload.done();
    return { etag: result.ETag?.replaceAll('"', "") ?? null };
  } catch (error) {
    if (timedOut) throw new UploadTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
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

export async function presignDownload(
  key: string,
  options: { filename: string; mediaType: string; expiresInSeconds: number },
): Promise<string> {
  const asciiFallback =
    options.filename.replaceAll(/[^ -~]/g, "_").replaceAll(/["\\]/g, "_") ||
    "download";
  const disposition = `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(options.filename)}`;
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: key,
      ResponseContentDisposition: disposition,
      ResponseContentType: options.mediaType,
    }),
    { expiresIn: options.expiresInSeconds },
  );
}
