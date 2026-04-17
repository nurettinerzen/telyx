-- Stripe-only cleanup: drop legacy iyzico billing columns.
-- This migration is intentionally narrow and idempotent.

ALTER TABLE "Subscription"
  DROP COLUMN IF EXISTS "iyzicoCustomerId",
  DROP COLUMN IF EXISTS "iyzicoSubscriptionId",
  DROP COLUMN IF EXISTS "iyzicoReferenceCode",
  DROP COLUMN IF EXISTS "iyzicoPricingPlanId",
  DROP COLUMN IF EXISTS "iyzicoCardToken",
  DROP COLUMN IF EXISTS "iyzicoPaymentId";

ALTER TABLE "BalanceTransaction"
  DROP COLUMN IF EXISTS "iyzicoPaymentId";

ALTER TABLE "CreditPurchase"
  DROP COLUMN IF EXISTS "paymentId";
