-- AlterTable
ALTER TABLE "ConnectorJob" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "nextRetryAt" TIMESTAMP(3),
ADD COLUMN     "resultEvidenceId" UUID,
ADD COLUMN     "targetSummary" TEXT;

-- CreateTable
CREATE TABLE "ConnectorAttempt" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "succeeded" BOOLEAN,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "ConnectorAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorAttempt_jobId_attemptNumber_key" ON "ConnectorAttempt"("jobId", "attemptNumber");

-- CreateIndex
CREATE INDEX "ConnectorJob_caseId_queuedAt_idx" ON "ConnectorJob"("caseId", "queuedAt");

-- AddForeignKey
ALTER TABLE "ConnectorJob" ADD CONSTRAINT "ConnectorJob_resultEvidenceId_fkey" FOREIGN KEY ("resultEvidenceId") REFERENCES "EvidenceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorAttempt" ADD CONSTRAINT "ConnectorAttempt_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ConnectorJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
