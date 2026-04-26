CREATE TYPE "LeadPreviewSessionStatus" AS ENUM ('READY', 'CONNECTING', 'ACTIVE', 'ENDED', 'EXPIRED');

CREATE TABLE "LeadPreviewSession" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "assistantId" TEXT,
    "status" "LeadPreviewSessionStatus" NOT NULL DEFAULT 'READY',
    "pageLoadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "credentialIssuedAt" TIMESTAMP(3),
    "credentialIssueCount" INTEGER NOT NULL DEFAULT 0,
    "connectedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "conversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadPreviewSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadPreviewSession_leadId_key" ON "LeadPreviewSession"("leadId");
CREATE UNIQUE INDEX "LeadPreviewSession_conversationId_key" ON "LeadPreviewSession"("conversationId");
CREATE INDEX "LeadPreviewSession_assistantId_idx" ON "LeadPreviewSession"("assistantId");
CREATE INDEX "LeadPreviewSession_status_expiresAt_idx" ON "LeadPreviewSession"("status", "expiresAt");

ALTER TABLE "LeadPreviewSession"
ADD CONSTRAINT "LeadPreviewSession_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "LeadPreviewSession"
ADD CONSTRAINT "LeadPreviewSession_assistantId_fkey"
FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
