ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'SIKAYETVAR';

CREATE TABLE IF NOT EXISTS "ComplaintThread" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalAnswerId" TEXT,
    "title" TEXT NOT NULL,
    "complaintText" TEXT NOT NULL,
    "generatedReply" TEXT,
    "finalReply" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvalMode" TEXT NOT NULL DEFAULT 'MANUAL',
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "customerCity" TEXT,
    "complaintUrl" TEXT,
    "platformStatus" TEXT,
    "sourceCreatedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "published" BOOLEAN,
    "errorMessage" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintThread_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ComplaintThread_businessId_platform_externalId_key"
ON "ComplaintThread"("businessId", "platform", "externalId");

CREATE INDEX IF NOT EXISTS "ComplaintThread_businessId_status_idx"
ON "ComplaintThread"("businessId", "status");

CREATE INDEX IF NOT EXISTS "ComplaintThread_businessId_platform_idx"
ON "ComplaintThread"("businessId", "platform");

CREATE INDEX IF NOT EXISTS "ComplaintThread_status_idx"
ON "ComplaintThread"("status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ComplaintThread_businessId_fkey'
  ) THEN
    ALTER TABLE "ComplaintThread"
    ADD CONSTRAINT "ComplaintThread_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
