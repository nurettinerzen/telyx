CREATE TABLE "BillingTrialClaim" (
    "id" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "emailDomain" TEXT,
    "firstBusinessId" INTEGER NOT NULL,
    "firstUserId" INTEGER,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "BillingTrialClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingCheckoutSession" (
    "id" TEXT NOT NULL,
    "businessId" INTEGER NOT NULL,
    "subscriptionId" INTEGER,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "checkoutType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "planId" TEXT,
    "addonKind" TEXT,
    "packageId" TEXT,
    "amount" DOUBLE PRECISION,
    "currency" TEXT,
    "checkoutUrl" TEXT,
    "successUrl" TEXT,
    "cancelUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "BillingCheckoutSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingTrialClaim_normalizedEmail_key" ON "BillingTrialClaim"("normalizedEmail");
CREATE INDEX "BillingTrialClaim_emailDomain_claimedAt_idx" ON "BillingTrialClaim"("emailDomain", "claimedAt");
CREATE INDEX "BillingTrialClaim_firstBusinessId_claimedAt_idx" ON "BillingTrialClaim"("firstBusinessId", "claimedAt");

CREATE UNIQUE INDEX "BillingCheckoutSession_stripeCheckoutSessionId_key" ON "BillingCheckoutSession"("stripeCheckoutSessionId");
CREATE INDEX "BillingCheckoutSession_businessId_checkoutType_createdAt_idx" ON "BillingCheckoutSession"("businessId", "checkoutType", "createdAt");
CREATE INDEX "BillingCheckoutSession_subscriptionId_createdAt_idx" ON "BillingCheckoutSession"("subscriptionId", "createdAt");
CREATE INDEX "BillingCheckoutSession_status_createdAt_idx" ON "BillingCheckoutSession"("status", "createdAt");
