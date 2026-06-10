-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Case_organizationId_idempotencyKey_key" ON "Case"("organizationId", "idempotencyKey");

