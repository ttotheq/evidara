import { randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { database, type Prisma } from "@evidara/database";

export async function resetDatabase() {
  const tables = await database.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  await database.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((table) => `"${table.tablename}"`).join(", ")} CASCADE`,
  );
}

// Creates the minimal organization/user/case graph a connector job needs and
// the QUEUED job row the queue producer would have written.
export async function createJobFixture(input: {
  url?: string;
  connectorKey?: string;
  jobInput?: Prisma.InputJsonValue;
}) {
  const suffix = randomUUID().slice(0, 8);
  const user = await database.user.create({
    data: {
      email: `analyst-${suffix}@example.test`,
      displayName: `Analyst ${suffix}`,
    },
  });
  const organization = await database.organization.create({
    data: { name: `org-${suffix}`, slug: `org-${suffix}` },
  });
  await database.organizationMember.create({
    data: { organizationId: organization.id, userId: user.id, role: "MEMBER" },
  });
  const caseRecord = await database.case.create({
    data: {
      organizationId: organization.id,
      createdById: user.id,
      name: `Worker fixture case ${suffix}`,
      objective: "Objective text for worker fixture case.",
      scope: "Scope text for worker fixture case.",
      justification: "Justification text for worker fixture case.",
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });
  const job = await database.connectorJob.create({
    data: {
      caseId: caseRecord.id,
      requestedById: user.id,
      connectorKey: input.connectorKey ?? "web-page-capture",
      connectorVersion: "1.0.0",
      input: input.jobInput ?? { url: input.url },
      targetSummary: input.url ?? null,
      idempotencyKey: randomUUID(),
    },
  });
  return { user, organization, caseRecord, job };
}

const objectStore = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
});

export async function getObjectBytes(key: string): Promise<Buffer> {
  const result = await objectStore.send(
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
  );
  if (!result.Body) throw new Error(`object ${key} has no body`);
  return Buffer.from(await result.Body.transformToByteArray());
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await objectStore.send(
      new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
    );
    return true;
  } catch {
    return false;
  }
}
