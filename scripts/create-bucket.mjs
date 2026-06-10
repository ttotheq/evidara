import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// Values already present in the process environment take precedence over the file.
function loadEnvironmentFile() {
  const fileName = process.env.NODE_ENV === "test" ? ".env.test" : ".env";
  let directory = process.cwd();
  for (;;) {
    const candidate = join(directory, fileName);
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
    const parent = dirname(directory);
    if (parent === directory) return;
    directory = parent;
  }
}

loadEnvironmentFile();

const required = [
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});

const bucket = process.env.S3_BUCKET;

try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log(`Bucket "${bucket}" already exists.`);
} catch (error) {
  if (error.name !== "NotFound" && error.name !== "NoSuchBucket") {
    throw error;
  }
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  console.log(`Created bucket "${bucket}".`);
}
