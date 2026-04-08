-- Add explicit routing flags for multi-number businesses
ALTER TABLE "PhoneNumber"
ADD COLUMN     "isDefaultInbound" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isDefaultOutbound" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPublicContact" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "PhoneNumber_businessId_isDefaultInbound_idx" ON "PhoneNumber"("businessId", "isDefaultInbound");
CREATE INDEX "PhoneNumber_businessId_isDefaultOutbound_idx" ON "PhoneNumber"("businessId", "isDefaultOutbound");
CREATE INDEX "PhoneNumber_businessId_isPublicContact_idx" ON "PhoneNumber"("businessId", "isPublicContact");
