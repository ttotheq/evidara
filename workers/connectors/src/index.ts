import { database } from "@evidara/database";
import { Worker } from "bullmq";
import { z } from "zod";

const jobSchema = z.object({
  connectorJobId: z.string().uuid(),
});

const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  ...(redisUrl.username ? { username: redisUrl.username } : {}),
  ...(redisUrl.password ? { password: redisUrl.password } : {}),
  maxRetriesPerRequest: null,
};

const worker = new Worker(
  "connector-jobs",
  async (queueJob) => {
    const { connectorJobId } = jobSchema.parse(queueJob.data);
    const connectorJob = await database.connectorJob.findUniqueOrThrow({
      where: { id: connectorJobId },
    });

    await database.connectorJob.update({
      where: { id: connectorJobId },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });

    // Connector registry and object-storage finalization are the next vertical slice.
    throw new Error(`Connector not registered: ${connectorJob.connectorKey}`);
  },
  {
    connection,
    concurrency: Number(process.env.CONNECTOR_CONCURRENCY ?? 4),
  },
);

worker.on("failed", async (job, error) => {
  const parsed = job ? jobSchema.safeParse(job.data) : undefined;
  if (!parsed?.success) return;
  await database.connectorJob.update({
    where: { id: parsed.data.connectorJobId },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      errorCode: "CONNECTOR_EXECUTION_FAILED",
      errorMessage: error.message.slice(0, 2000),
    },
  });
});

const shutdown = async () => {
  await worker.close();
  await database.$disconnect();
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
