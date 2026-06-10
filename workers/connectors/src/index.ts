import { database } from "@evidara/database";
import { Worker } from "bullmq";
import { z } from "zod";
import { config, redisConnectionFromUrl } from "./config.js";

const jobSchema = z.object({
  connectorJobId: z.string().uuid(),
});

const connection = redisConnectionFromUrl(config.REDIS_URL);

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
    concurrency: config.CONNECTOR_CONCURRENCY,
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
