-- Add cycle-bounded add-on balances and written usage billing support
ALTER TABLE "Subscription"
ADD COLUMN "voiceAddOnMinutesBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "writtenInteractionAddOnBalance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "writtenOverageBilledAt" TIMESTAMP(3);

CREATE TABLE "WrittenUsageEvent" (
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

CREATE TABLE "AddOnPurchase" (
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

CREATE UNIQUE INDEX "WrittenUsageEvent_idempotencyKey_key" ON "WrittenUsageEvent"("idempotencyKey");
CREATE INDEX "WrittenUsageEvent_subscriptionId_channel_createdAt_idx" ON "WrittenUsageEvent"("subscriptionId", "channel", "createdAt");
CREATE INDEX "WrittenUsageEvent_subscriptionId_chargeType_createdAt_idx" ON "WrittenUsageEvent"("subscriptionId", "chargeType", "createdAt");
CREATE INDEX "WrittenUsageEvent_status_createdAt_idx" ON "WrittenUsageEvent"("status", "createdAt");

CREATE UNIQUE INDEX "AddOnPurchase_stripePaymentIntentId_key" ON "AddOnPurchase"("stripePaymentIntentId");
CREATE UNIQUE INDEX "AddOnPurchase_stripeSessionId_key" ON "AddOnPurchase"("stripeSessionId");
CREATE INDEX "AddOnPurchase_subscriptionId_kind_createdAt_idx" ON "AddOnPurchase"("subscriptionId", "kind", "createdAt");
CREATE INDEX "AddOnPurchase_businessId_kind_createdAt_idx" ON "AddOnPurchase"("businessId", "kind", "createdAt");
CREATE INDEX "AddOnPurchase_status_createdAt_idx" ON "AddOnPurchase"("status", "createdAt");

ALTER TABLE "WrittenUsageEvent"
ADD CONSTRAINT "WrittenUsageEvent_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AddOnPurchase"
ADD CONSTRAINT "AddOnPurchase_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
