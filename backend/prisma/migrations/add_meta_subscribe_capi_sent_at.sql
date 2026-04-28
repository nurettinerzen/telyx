-- Add metaSubscribeCapiSentAt to Subscription
-- Idempotency marker for Meta Conversions API "Subscribe" event firing.
-- Set the first time invoice.payment_succeeded fires for a paid invoice; used to
-- prevent re-firing on recurring monthly invoices.

ALTER TABLE "Subscription" ADD COLUMN "metaSubscribeCapiSentAt" TIMESTAMP(3);
