import { Queue } from "bullmq";
import { config } from "../config.js";

export const CONNECTOR_QUEUE_NAME = "connector-jobs";

function redisConnectionFromUrl(rawUrl: string) {
  const redisUrl = new URL(rawUrl);
  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    ...(redisUrl.pathname.length > 1
      ? { db: Number(redisUrl.pathname.slice(1)) }
      : {}),
    ...(redisUrl.username ? { username: redisUrl.username } : {}),
    ...(redisUrl.password ? { password: redisUrl.password } : {}),
  };
}

let queue: Queue | null = null;

function connectorQueue(): Queue {
  queue ??= new Queue(CONNECTOR_QUEUE_NAME, {
    connection: redisConnectionFromUrl(config.REDIS_URL),
  });
  return queue;
}

// Enqueues by database job id; the payload carries no case data. Retries use
// a distinct queue job id so BullMQ does not deduplicate them away.
export async function enqueueConnectorJob(
  connectorJobId: string,
  attempt: number,
): Promise<void> {
  await connectorQueue().add(
    "execute",
    { connectorJobId },
    {
      jobId: `${connectorJobId}-attempt-${attempt}`,
      removeOnComplete: true,
      removeOnFail: true,
      attempts: 1,
    },
  );
}

export async function closeConnectorQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
