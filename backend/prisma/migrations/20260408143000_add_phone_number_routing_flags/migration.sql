-- Add explicit routing flags for multi-number businesses
ALTER TABLE "PhoneNumber"
ADD COLUMN IF NOT EXISTS "isDefaultInbound" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "isDefaultOutbound" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "isPublicContact" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "PhoneNumber_businessId_isDefaultInbound_idx" ON "PhoneNumber"("businessId", "isDefaultInbound");
CREATE INDEX IF NOT EXISTS "PhoneNumber_businessId_isDefaultOutbound_idx" ON "PhoneNumber"("businessId", "isDefaultOutbound");
CREATE INDEX IF NOT EXISTS "PhoneNumber_businessId_isPublicContact_idx" ON "PhoneNumber"("businessId", "isPublicContact");
