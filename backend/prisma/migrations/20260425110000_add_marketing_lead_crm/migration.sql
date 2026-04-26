CREATE TYPE "LeadSource" AS ENUM (
  'META_INSTANT_FORM',
  'WEBSITE_CONTACT',
  'WEBSITE_DEMO',
  'WEBSITE_WAITLIST',
  'MANUAL'
);

CREATE TYPE "LeadStatus" AS ENUM (
  'NEW',
  'EMAILED',
  'POSITIVE',
  'NOT_NOW',
  'CALL_QUEUED',
  'CALLED',
  'WON',
  'LOST'
);

CREATE TYPE "LeadTemperature" AS ENUM (
  'COLD',
  'WARM',
  'HOT'
);

CREATE TYPE "LeadCtaResponse" AS ENUM (
  'YES',
  'NO'
);

CREATE TYPE "LeadActivityType" AS ENUM (
  'LEAD_CREATED',
  'INTERNAL_NOTIFICATION_SENT',
  'INTERNAL_NOTIFICATION_FAILED',
  'INITIAL_EMAIL_SENT',
  'INITIAL_EMAIL_FAILED',
  'CTA_YES',
  'CTA_NO',
  'STATUS_CHANGED',
  'NOTE_UPDATED',
  'CALLBACK_QUEUED',
  'CALLBACK_QUEUE_FAILED',
  'DEMO_CALL_INITIATED',
  'DEMO_CALL_FAILED'
);

CREATE TABLE "Lead" (
  "id" TEXT NOT NULL,
  "businessId" INTEGER,
  "source" "LeadSource" NOT NULL,
  "externalSourceId" TEXT,
  "campaignName" TEXT,
  "adsetName" TEXT,
  "adName" TEXT,
  "formName" TEXT,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "company" TEXT,
  "businessType" TEXT,
  "message" TEXT,
  "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
  "temperature" "LeadTemperature" NOT NULL DEFAULT 'COLD',
  "ctaResponse" "LeadCtaResponse",
  "responseToken" TEXT NOT NULL,
  "notes" TEXT,
  "sourceSubmittedAt" TIMESTAMP(3),
  "receivedAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notificationSentAt" TIMESTAMP(3),
  "firstEmailedAt" TIMESTAMP(3),
  "lastContactedAt" TIMESTAMP(3),
  "nextFollowUpAt" TIMESTAMP(3),
  "ctaRespondedAt" TIMESTAMP(3),
  "rawPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeadActivity" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "type" "LeadActivityType" NOT NULL,
  "actorType" TEXT,
  "actorId" TEXT,
  "actorLabel" TEXT,
  "message" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CallbackRequest"
ADD COLUMN "leadId" TEXT;

ALTER TABLE "Lead"
ADD CONSTRAINT "Lead_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeadActivity"
ADD CONSTRAINT "LeadActivity_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CallbackRequest"
ADD CONSTRAINT "CallbackRequest_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Lead_responseToken_key" ON "Lead"("responseToken");
CREATE UNIQUE INDEX "Lead_source_externalSourceId_key" ON "Lead"("source", "externalSourceId");
CREATE INDEX "Lead_businessId_idx" ON "Lead"("businessId");
CREATE INDEX "Lead_status_idx" ON "Lead"("status");
CREATE INDEX "Lead_temperature_idx" ON "Lead"("temperature");
CREATE INDEX "Lead_source_idx" ON "Lead"("source");
CREATE INDEX "Lead_receivedAtUtc_idx" ON "Lead"("receivedAtUtc");
CREATE INDEX "Lead_email_idx" ON "Lead"("email");
CREATE INDEX "Lead_phone_idx" ON "Lead"("phone");
CREATE INDEX "LeadActivity_leadId_createdAt_idx" ON "LeadActivity"("leadId", "createdAt");
CREATE INDEX "LeadActivity_type_idx" ON "LeadActivity"("type");
CREATE INDEX "CallbackRequest_leadId_idx" ON "CallbackRequest"("leadId");
