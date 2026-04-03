ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'HEPSIBURADA';

CREATE TABLE IF NOT EXISTS "MarketplaceQuestion" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "productName" TEXT,
    "productBarcode" TEXT,
    "productUrl" TEXT,
    "productImageUrl" TEXT,
    "customerName" TEXT,
    "questionText" TEXT NOT NULL,
    "generatedAnswer" TEXT,
    "finalAnswer" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "answerMode" TEXT NOT NULL DEFAULT 'MANUAL',
    "rejectionReason" TEXT,
    "platformStatus" TEXT,
    "expiresAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceQuestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceQuestion_businessId_platform_externalId_key"
ON "MarketplaceQuestion"("businessId", "platform", "externalId");

CREATE INDEX IF NOT EXISTS "MarketplaceQuestion_businessId_status_idx"
ON "MarketplaceQuestion"("businessId", "status");

CREATE INDEX IF NOT EXISTS "MarketplaceQuestion_businessId_platform_idx"
ON "MarketplaceQuestion"("businessId", "platform");

CREATE INDEX IF NOT EXISTS "MarketplaceQuestion_status_idx"
ON "MarketplaceQuestion"("status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'MarketplaceQuestion_businessId_fkey'
  ) THEN
    ALTER TABLE "MarketplaceQuestion"
    ADD CONSTRAINT "MarketplaceQuestion_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
