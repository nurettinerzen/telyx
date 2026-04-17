-- Restore historical migration that still exists in production _prisma_migrations.
-- This must remain in source control so Prisma migration history stays consistent.

ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "concurrentLimit" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "activeCalls" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum
      WHERE enumlabel = 'STARTER'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SubscriptionPlan')
    ) THEN
        ALTER TYPE "SubscriptionPlan" ADD VALUE 'STARTER';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum
      WHERE enumlabel = 'PRO'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SubscriptionPlan')
    ) THEN
        ALTER TYPE "SubscriptionPlan" ADD VALUE 'PRO';
    END IF;
END $$;

UPDATE "Subscription" SET "concurrentLimit" = 0 WHERE "plan" = 'FREE';
UPDATE "Subscription" SET "concurrentLimit" = 1 WHERE "plan" IN ('STARTER', 'BASIC');
UPDATE "Subscription" SET "concurrentLimit" = 3 WHERE "plan" = 'PROFESSIONAL';
UPDATE "Subscription" SET "concurrentLimit" = 5 WHERE "plan" = 'PRO';
UPDATE "Subscription" SET "concurrentLimit" = 10 WHERE "plan" = 'ENTERPRISE';

UPDATE "Subscription" SET "activeCalls" = 0;
