# WhatsApp Pro Tier - Multi-Tenant Integration

## Overview

The WhatsApp Pro Tier feature enables businesses to connect their own WhatsApp Business API credentials, allowing AI-powered customer conversations through WhatsApp. This is a fully multi-tenant implementation where each business uses their own Meta API credentials.

## What Was Implemented

### 1. Database Schema Updates
**File:** `backend/prisma/schema.prisma`

Added the following fields to the `Business` model:
- `whatsappPhoneNumberId` - The phone number ID from Meta
- `whatsappAccessToken` - Encrypted access token
- `whatsappVerifyToken` - Token for webhook verification
- `whatsappWebhookUrl` - Auto-generated webhook URL

Added `WHATSAPP` to the `IntegrationType` enum.

**Migration:** See `backend/prisma/migrations/WHATSAPP_MIGRATION.md` for SQL migration instructions.

### 2. Encryption Utility
**File:** `backend/src/utils/encryption.js`

Secure encryption utility using AES-256-GCM:
- `encrypt(text)` - Encrypts sensitive data
- `decrypt(encryptedText)` - Decrypts data
- `validateEncryption()` - Tests encryption/decryption
- `generateSecureToken()` - Generates random tokens

**Configuration:** Set `ENCRYPTION_SECRET` in your `.env` file for production.

### 3. WhatsApp Integration API Endpoints
**File:** `backend/src/routes/integrations.js`

#### POST /api/integrations/whatsapp/connect
Connects WhatsApp Business API credentials.

**Request Body:**
```json
{
  "accessToken": "your-meta-access-token",
  "phoneNumberId": "your-phone-number-id",
  "verifyToken": "your-verify-token"
}
```

**Features:**
- Validates credentials with Meta API
- Encrypts access token before storage
- Generates webhook URL
- Returns connection status

**Response:**
```json
{
  "success": true,
  "message": "WhatsApp connected successfully",
  "webhookUrl": "https://your-domain.com/api/whatsapp/webhook",
  "phoneNumberId": "123456789"
}
```

#### POST /api/integrations/whatsapp/disconnect
Disconnects WhatsApp integration.

**Response:**
```json
{
  "success": true,
  "message": "WhatsApp disconnected successfully"
}
```

#### GET /api/integrations/whatsapp/status
Checks WhatsApp connection status.

**Response:**
```json
{
  "connected": true,
  "phoneNumberId": "123456789",
  "webhookUrl": "https://your-domain.com/api/whatsapp/webhook"
}
```

### 4. Multi-Tenant Webhook Route
**File:** `backend/src/routes/whatsapp.js`

#### GET /api/whatsapp/webhook
Webhook verification endpoint for Meta.
- Verifies against any business's verify token
- Required for initial webhook setup in Meta Business Suite

#### POST /api/whatsapp/webhook
Incoming message webhook (multi-tenant).

**How it works:**
1. Identifies business by `phoneNumberId` from webhook payload
2. Retrieves business-specific credentials from database
3. Decrypts access token
4. Generates AI response using business's assistant
5. Sends response using business's WhatsApp credentials

**Features:**
- Supports multiple businesses on same webhook endpoint
- Isolates conversation history per business
- Uses business-specific AI assistant configuration
- Language-aware error messages based on business language

### 5. Rate Limiting Middleware
**File:** `backend/src/middleware/rateLimiter.js`

Rate limiting to protect webhook endpoints:
- **Webhook endpoints:** 60 requests/minute
- **API endpoints:** 100 requests/minute
- **Auth endpoints:** 10 requests/minute

Includes rate limit headers:
- `X-RateLimit-Limit` - Maximum requests allowed
- `X-RateLimit-Remaining` - Requests remaining in window
- `X-RateLimit-Reset` - When the limit resets

### 6. Frontend Integration UI
**File:** `frontend/app/dashboard/integrations/page.jsx`

Professional WhatsApp connection interface:

**Features:**
- Connection modal with form fields
- Step-by-step setup instructions
- Password input for access token
- Auto-generated webhook URL with copy button
- Connection status indicator
- Disconnect functionality
- Loading states
- Error handling with clear messages

**UI Components:**
- Clean, minimal design (no emojis)
- Uses Lucide React icons
- Responsive layout
- Toast notifications for feedback

## Setup Instructions for Businesses

### Step 1: Get WhatsApp Business API Credentials

1. Go to [Meta Business Suite](https://business.facebook.com)
2. Navigate to your WhatsApp Business Account settings
3. Go to "API Setup" section
4. Create a **permanent access token** (not a temporary one)
5. Copy your **Phone Number ID**
6. Create a **Verify Token** (any secure random string - you'll use this in both platforms)

### Step 2: Connect in Your Dashboard

1. Go to Dashboard → Integrations
2. Find "WhatsApp Business" card
3. Click "Connect"
4. Fill in the form:
   - **Access Token:** Paste your Meta access token
   - **Phone Number ID:** Paste your phone number ID
   - **Verify Token:** Enter a secure random string (e.g., `whatsapp_verify_abc123xyz`)
   - **Webhook URL:** Auto-generated, copy this for next step
5. Click "Connect WhatsApp"

### Step 3: Configure Webhook in Meta

1. Return to [Meta Business Suite](https://business.facebook.com)
2. Go to WhatsApp → Configuration → Webhook
3. Click "Edit"
4. Paste your webhook URL (copied from step 2)
5. Enter the **same Verify Token** you used in step 2
6. Subscribe to "messages" webhook field
7. Click "Verify and Save"

### Step 4: Test Your Integration

1. Send a test message to your WhatsApp Business number
2. You should receive an AI-powered response
3. Check the conversation in your dashboard

## Security Features

### Encryption
- All access tokens encrypted with AES-256-GCM
- Unique salt and IV for each encryption
- PBKDF2 key derivation with 100,000 iterations
- Authenticated encryption with auth tags

### Validation
- Meta API validation before storing credentials
- Input sanitization on all endpoints
- Rate limiting on webhook endpoints
- Secure token verification

### Rate Limiting
- Prevents abuse of webhook endpoints
- 60 requests per minute per IP
- Automatic cleanup of old rate limit data
- Clear error messages with retry-after information

## Environment Variables

Add these to your `.env` file:

```bash
# Required for encryption
ENCRYPTION_SECRET=your-secure-random-secret-min-32-chars

# Your backend URL (for webhook generation)
BACKEND_URL=https://your-domain.com

# Optional: OpenAI API key for AI responses
OPENAI_API_KEY=your-openai-key
```

## API Flow Diagram

```
User sends WhatsApp message
    ↓
Meta sends webhook to /api/whatsapp/webhook
    ↓
Identify business by phoneNumberId
    ↓
Load business & decrypt access token
    ↓
Generate AI response using business's assistant
    ↓
Send response via WhatsApp API with business's token
    ↓
User receives AI-powered response
```

## Database Migration

To apply the schema changes, run:

```bash
cd backend
npx prisma migrate dev --name add_whatsapp_fields
# OR
npx prisma db push
```

Alternatively, apply the SQL manually:
```sql
ALTER TABLE "Business" ADD COLUMN "whatsappPhoneNumberId" TEXT;
ALTER TABLE "Business" ADD COLUMN "whatsappAccessToken" TEXT;
ALTER TABLE "Business" ADD COLUMN "whatsappVerifyToken" TEXT;
ALTER TABLE "Business" ADD COLUMN "whatsappWebhookUrl" TEXT;

ALTER TYPE "IntegrationType" ADD VALUE 'WHATSAPP';
```

## Testing

### Test Connection
1. Connect WhatsApp in your dashboard
2. Check connection status in integrations page
3. Verify phone number ID is displayed

### Test Messaging
1. Send a message to your WhatsApp Business number
2. Check backend logs for webhook receipt
3. Verify AI response is received
4. Check conversation history in dashboard

### Test Disconnection
1. Click "Disconnect" on WhatsApp card
2. Verify credentials are removed
3. Confirm webhook no longer processes messages

## Troubleshooting

### "Failed to validate credentials with Meta"
- Double-check your access token is valid
- Ensure phone number ID is correct
- Verify token has proper permissions

### "No business found for phone number ID"
- Webhook payload may be incorrect
- Phone number ID in database doesn't match Meta
- Check backend logs for phoneNumberId value

### "Too many requests"
- Rate limit exceeded (60/min)
- Wait for rate limit window to reset
- Check X-RateLimit-Reset header

### Webhook not receiving messages
- Verify webhook URL is configured in Meta
- Check verify token matches in both systems
- Ensure webhook is subscribed to "messages" field
- Check backend logs for errors

## Architecture Decisions

### Why encrypt access tokens?
WhatsApp access tokens are permanent and grant full API access. Encrypting them protects against database breaches.

### Why use Business model instead of Integration model only?
Direct fields in Business model enable faster lookups for webhook processing, while Integration model maintains consistency with other integrations.

### Why in-memory rate limiting?
Suitable for MVP and small-scale deployments. For production at scale, migrate to Redis-based rate limiting for distributed environments.

### Why conversation history in memory?
Temporary solution for MVP. Recommended to migrate to database storage for persistence and analytics.

## Production Recommendations

1. **Database Migration:** Apply Prisma migration in production database
2. **Environment Variables:** Set strong ENCRYPTION_SECRET (min 32 chars)
3. **Rate Limiting:** Consider Redis-based rate limiting for multi-server setups
4. **Monitoring:** Add logging/monitoring for webhook errors
5. **Conversation History:** Migrate to database storage
6. **Backup:** Regular backups of Business table (contains encrypted tokens)

## Files Modified/Created

### Backend
- ✅ `backend/prisma/schema.prisma` - Schema updates
- ✅ `backend/src/utils/encryption.js` - New encryption utility
- ✅ `backend/src/middleware/rateLimiter.js` - New rate limiter
- ✅ `backend/src/routes/integrations.js` - Updated integration endpoints
- ✅ `backend/src/routes/whatsapp.js` - Updated webhook for multi-tenant
- ✅ `backend/prisma/migrations/WHATSAPP_MIGRATION.md` - Migration docs

### Frontend
- ✅ `frontend/app/dashboard/integrations/page.jsx` - Updated with WhatsApp UI

## Next Steps

1. Apply database migration
2. Set ENCRYPTION_SECRET in environment
3. Test the integration flow
4. Deploy to production
5. Document for your users
6. Monitor webhook logs

## Support

For issues or questions:
- Check backend logs for detailed error messages
- Verify Meta Business Suite configuration
- Review this README for troubleshooting steps
- Check rate limit headers if receiving 429 errors

---

**Implementation Date:** December 2025
**Status:** ✅ Complete and Ready for Review
**Branch:** `claude/whatsapp-pro-tier-01L5oDSith71ubA3NsNhEKvW`
