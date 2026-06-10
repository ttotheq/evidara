-- CreateEnum
CREATE TYPE "CollectionCompleteness" AS ENUM ('COMPLETE', 'TRUNCATED', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "BlobRetention" AS ENUM ('ACTIVE', 'PENDING_DELETION', 'DELETED');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "EvidenceBlob" ADD COLUMN     "bucket" TEXT NOT NULL,
ADD COLUMN     "etag" TEXT,
ADD COLUMN     "retention" "BlobRetention" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "storageProvider" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "EvidenceItem" ADD COLUMN     "collectionCompleteness" "CollectionCompleteness" NOT NULL DEFAULT 'COMPLETE',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "originalFilename" TEXT,
ADD COLUMN     "provenance" JSONB;

-- CreateTable
CREATE TABLE "Upload" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
    "tempObjectKey" TEXT NOT NULL,
    "expectedBytes" BIGINT,
    "observedBytes" BIGINT,
    "idempotencyKey" TEXT,
    "errorCode" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Upload_tempObjectKey_key" ON "Upload"("tempObjectKey");

-- CreateIndex
CREATE INDEX "Upload_status_expiresAt_idx" ON "Upload"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "EvidenceItem_caseId_kind_collectedAt_idx" ON "EvidenceItem"("caseId", "kind", "collectedAt");

-- CreateIndex
CREATE INDEX "EvidenceItem_caseId_collectedAt_idx" ON "EvidenceItem"("caseId", "collectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceItem_caseId_idempotencyKey_key" ON "EvidenceItem"("caseId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

