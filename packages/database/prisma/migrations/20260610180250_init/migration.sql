-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "CaseRole" AS ENUM ('OWNER', 'ANALYST', 'REVIEWER', 'VIEWER');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "HandlingLevel" AS ENUM ('PUBLIC', 'INTERNAL', 'SENSITIVE', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('WEB_CAPTURE', 'FILE', 'MANUAL', 'CONNECTOR_RESULT');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('UNREVIEWED', 'VERIFIED', 'DISPUTED', 'STALE', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('PERSON', 'ORGANIZATION', 'ACCOUNT', 'DOMAIN', 'IP_ADDRESS', 'URL', 'EMAIL', 'PHONE_NUMBER', 'LOCATION', 'EVENT', 'DOCUMENT', 'IMAGE', 'CLAIM', 'ASSET', 'SOURCE', 'EVIDENCE_ITEM');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('OWNS', 'OPERATES', 'MENTIONED_IN', 'OBSERVED_AT', 'LINKED_TO', 'RESOLVED_TO', 'REGISTERED_BY', 'AFFILIATED_WITH', 'LOCATED_AT', 'CLAIMS', 'CONTRADICTS', 'SUPPORTS', 'DERIVED_FROM');

-- CreateEnum
CREATE TYPE "SuggestionType" AS ENUM ('ENTITY_EXTRACTION', 'DEDUPLICATION', 'LINK', 'TIMELINE_SUMMARY', 'SOURCE_RELIABILITY', 'CONTRADICTION', 'REPORT_DRAFT');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "OrganizationRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("organizationId","userId")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "prohibitedCollection" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "handlingLevel" "HandlingLevel" NOT NULL DEFAULT 'INTERNAL',
    "status" "CaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseMember" (
    "caseId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "CaseRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseMember_pkey" PRIMARY KEY ("caseId","userId")
);

-- CreateTable
CREATE TABLE "EvidenceBlob" (
    "id" UUID NOT NULL,
    "sha256" TEXT NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "immutable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceBlob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceItem" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "blobId" UUID,
    "createdById" UUID NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "handlingLevel" "HandlingLevel" NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "canonicalUrl" TEXT,
    "sourceMethod" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analystNotes" TEXT,
    "rawMetadata" JSONB NOT NULL,
    "connectorKey" TEXT,
    "connectorVersion" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorJob" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "connectorKey" TEXT NOT NULL,
    "connectorVersion" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "statusMessage" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ConnectorJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "type" "EntityType" NOT NULL,
    "label" TEXT NOT NULL,
    "normalizedKey" TEXT,
    "attributes" JSONB NOT NULL,
    "confidence" INTEGER NOT NULL,
    "handlingLevel" "HandlingLevel" NOT NULL,
    "reviewStatus" "ReviewDecision" NOT NULL DEFAULT 'PENDING',
    "mergedIntoId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntitySource" (
    "entityId" UUID NOT NULL,
    "evidenceId" UUID NOT NULL,
    "locator" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntitySource_pkey" PRIMARY KEY ("entityId","evidenceId")
);

-- CreateTable
CREATE TABLE "EntityRelation" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "sourceEntityId" UUID NOT NULL,
    "targetEntityId" UUID NOT NULL,
    "type" "RelationType" NOT NULL,
    "attributes" JSONB NOT NULL,
    "confidence" INTEGER NOT NULL,
    "handlingLevel" "HandlingLevel" NOT NULL,
    "reviewStatus" "ReviewDecision" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelationSource" (
    "relationId" UUID NOT NULL,
    "evidenceId" UUID NOT NULL,
    "locator" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelationSource_pkey" PRIMARY KEY ("relationId","evidenceId")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "handlingLevel" "HandlingLevel" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "estimativeLanguage" TEXT NOT NULL,
    "reviewStatus" "ReviewDecision" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Citation" (
    "id" UUID NOT NULL,
    "findingId" UUID,
    "evidenceId" UUID NOT NULL,
    "locator" TEXT,
    "quotedText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Citation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRun" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "workflow" "SuggestionType" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "contextManifest" JSONB NOT NULL,
    "parameters" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSuggestion" (
    "id" UUID NOT NULL,
    "aiRunId" UUID NOT NULL,
    "type" "SuggestionType" NOT NULL,
    "payload" JSONB NOT NULL,
    "citations" JSONB NOT NULL,
    "decision" "ReviewDecision" NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "reviewStatus" "ReviewDecision" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportExport" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "format" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "objectKey" TEXT,
    "manifest" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ReportExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "caseId" UUID,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "outcome" TEXT NOT NULL,
    "requestId" TEXT,
    "ipHash" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Case_organizationId_status_updatedAt_idx" ON "Case"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceBlob_objectKey_key" ON "EvidenceBlob"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceBlob_sha256_byteSize_key" ON "EvidenceBlob"("sha256", "byteSize");

-- CreateIndex
CREATE INDEX "EvidenceItem_caseId_status_collectedAt_idx" ON "EvidenceItem"("caseId", "status", "collectedAt");

-- CreateIndex
CREATE INDEX "EvidenceItem_caseId_sourceUrl_idx" ON "EvidenceItem"("caseId", "sourceUrl");

-- CreateIndex
CREATE INDEX "ConnectorJob_status_queuedAt_idx" ON "ConnectorJob"("status", "queuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorJob_caseId_idempotencyKey_key" ON "ConnectorJob"("caseId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Entity_caseId_type_label_idx" ON "Entity"("caseId", "type", "label");

-- CreateIndex
CREATE INDEX "Entity_caseId_normalizedKey_idx" ON "Entity"("caseId", "normalizedKey");

-- CreateIndex
CREATE INDEX "EntityRelation_caseId_type_idx" ON "EntityRelation"("caseId", "type");

-- CreateIndex
CREATE INDEX "EntityRelation_sourceEntityId_targetEntityId_idx" ON "EntityRelation"("sourceEntityId", "targetEntityId");

-- CreateIndex
CREATE INDEX "AiRun_caseId_createdAt_idx" ON "AiRun"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_caseId_createdAt_idx" ON "AuditEvent"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_publishedAt_createdAt_idx" ON "OutboxEvent"("publishedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseMember" ADD CONSTRAINT "CaseMember_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseMember" ADD CONSTRAINT "CaseMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_blobId_fkey" FOREIGN KEY ("blobId") REFERENCES "EvidenceBlob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorJob" ADD CONSTRAINT "ConnectorJob_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntitySource" ADD CONSTRAINT "EntitySource_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntitySource" ADD CONSTRAINT "EntitySource_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "EvidenceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityRelation" ADD CONSTRAINT "EntityRelation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityRelation" ADD CONSTRAINT "EntityRelation_sourceEntityId_fkey" FOREIGN KEY ("sourceEntityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityRelation" ADD CONSTRAINT "EntityRelation_targetEntityId_fkey" FOREIGN KEY ("targetEntityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationSource" ADD CONSTRAINT "RelationSource_relationId_fkey" FOREIGN KEY ("relationId") REFERENCES "EntityRelation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationSource" ADD CONSTRAINT "RelationSource_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "EvidenceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "EvidenceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSuggestion" ADD CONSTRAINT "AiSuggestion_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportExport" ADD CONSTRAINT "ReportExport_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
