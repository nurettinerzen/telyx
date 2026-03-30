ALTER TABLE "Subscription"
ADD COLUMN IF NOT EXISTS "voiceAddOnMinutesBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "writtenInteractionAddOnBalance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "writtenOverageBilledAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "WrittenUsageEvent" (
    "id" TEXT NOT NULL,
    "subscriptionId" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "chargeType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "assistantId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WrittenUsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AddOnPurchase" (
    "id" TEXT NOT NULL,
    "subscriptionId" INTEGER NOT NULL,
    "businessId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "stripePaymentIntentId" TEXT,
    "stripeSessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AddOnPurchase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WrittenUsageEvent_idempotencyKey_key" ON "WrittenUsageEvent"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "WrittenUsageEvent_subscriptionId_channel_createdAt_idx" ON "WrittenUsageEvent"("subscriptionId", "channel", "createdAt");
CREATE INDEX IF NOT EXISTS "WrittenUsageEvent_subscriptionId_chargeType_createdAt_idx" ON "WrittenUsageEvent"("subscriptionId", "chargeType", "createdAt");
CREATE INDEX IF NOT EXISTS "WrittenUsageEvent_status_createdAt_idx" ON "WrittenUsageEvent"("status", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "AddOnPurchase_stripePaymentIntentId_key" ON "AddOnPurchase"("stripePaymentIntentId");
CREATE UNIQUE INDEX IF NOT EXISTS "AddOnPurchase_stripeSessionId_key" ON "AddOnPurchase"("stripeSessionId");
CREATE INDEX IF NOT EXISTS "AddOnPurchase_subscriptionId_kind_createdAt_idx" ON "AddOnPurchase"("subscriptionId", "kind", "createdAt");
CREATE INDEX IF NOT EXISTS "AddOnPurchase_businessId_kind_createdAt_idx" ON "AddOnPurchase"("businessId", "kind", "createdAt");
CREATE INDEX IF NOT EXISTS "AddOnPurchase_status_createdAt_idx" ON "AddOnPurchase"("status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'WrittenUsageEvent_subscriptionId_fkey'
  ) THEN
    ALTER TABLE "WrittenUsageEvent"
    ADD CONSTRAINT "WrittenUsageEvent_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AddOnPurchase_subscriptionId_fkey'
  ) THEN
    ALTER TABLE "AddOnPurchase"
    ADD CONSTRAINT "AddOnPurchase_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
