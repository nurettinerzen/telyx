-- ============================================================================
-- ResponseTrace + OperationalIncident tables for unified operational telemetry
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ResponseTrace" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "traceId" TEXT NOT NULL,
  "requestId" TEXT,
  "channel" TEXT NOT NULL,
  "businessId" INTEGER NOT NULL,
  "userId" TEXT,
  "sessionId" TEXT,
  "messageId" TEXT,
  "payload" JSONB NOT NULL,
  "latencyMs" INTEGER,
  "responseHash" TEXT,
  "responsePreview" TEXT,
  "toolOutcomeHash" TEXT,
  "responseSource" TEXT,
  "llmUsed" BOOLEAN NOT NULL DEFAULT false,
  "toolsCalledCount" INTEGER NOT NULL DEFAULT 0,
  "toolSuccess" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "ResponseTrace_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ResponseTrace_businessId_createdAt_idx" ON "ResponseTrace"("businessId", "createdAt");
CREATE INDEX IF NOT EXISTS "ResponseTrace_channel_createdAt_idx" ON "ResponseTrace"("channel", "createdAt");
CREATE INDEX IF NOT EXISTS "ResponseTrace_traceId_idx" ON "ResponseTrace"("traceId");

CREATE TABLE IF NOT EXISTS "OperationalIncident" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "severity" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "traceId" TEXT NOT NULL,
  "requestId" TEXT,
  "businessId" INTEGER NOT NULL,
  "userId" TEXT,
  "sessionId" TEXT,
  "messageId" TEXT,
  "summary" TEXT NOT NULL,
  "details" JSONB,
  "fingerprint" TEXT,
  "responseHash" TEXT,
  "toolOutcomeHash" TEXT,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "resolvedAt" TIMESTAMP(3),
  "resolvedBy" TEXT,
  CONSTRAINT "OperationalIncident_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OperationalIncident_category_createdAt_idx" ON "OperationalIncident"("category", "createdAt");
CREATE INDEX IF NOT EXISTS "OperationalIncident_businessId_createdAt_idx" ON "OperationalIncident"("businessId", "createdAt");
CREATE INDEX IF NOT EXISTS "OperationalIncident_channel_createdAt_idx" ON "OperationalIncident"("channel", "createdAt");
CREATE INDEX IF NOT EXISTS "OperationalIncident_traceId_idx" ON "OperationalIncident"("traceId");
CREATE INDEX IF NOT EXISTS "OperationalIncident_resolved_createdAt_idx" ON "OperationalIncident"("resolved", "createdAt");
