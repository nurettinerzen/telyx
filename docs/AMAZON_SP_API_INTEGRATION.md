# Amazon SP-API Integration

## Scope

This repo now includes initial Amazon SP-API infrastructure for:

- OAuth authorization flow
- Refresh token storage
- Connection status + validation
- Seller marketplace participation test
- Dashboard connection card

Important:

- This is **not** the same surface as Trendyol / Hepsiburada product Q&A feeds.
- Amazon SP-API supports **Buyer Messaging** and order-linked messaging flows.
- Public product detail page question feeds are not exposed here as a direct equivalent.

## Environment Variables

Add these backend environment variables:

```env
AMAZON_SP_API_APP_ID=
AMAZON_SP_API_CLIENT_ID=
AMAZON_SP_API_CLIENT_SECRET=
AMAZON_SP_API_DEFAULT_MARKETPLACE_ID=A33AVAJ2PDY3EV
AMAZON_SP_API_SELLER_CENTRAL_URL=https://sellercentral.amazon.com.tr
AMAZON_SP_API_USE_DRAFT_AUTH=true
AMAZON_SP_API_USE_SANDBOX=false
```

## Amazon App Setup

Register the following URIs in the Amazon SP-API application:

- Login URI: `https://<your-backend>/api/integrations/amazon/login`
- Redirect URI: `https://<your-backend>/api/integrations/amazon/callback`

For beta on this repo, use:

- Login URI: `https://beta-api.telyx.ai/api/integrations/amazon/login`
- Redirect URI: `https://beta-api.telyx.ai/api/integrations/amazon/callback`

Recommended roles for validation:

- `Selling Partner Insights`
- or `Product Listing`

If only Buyer Messaging is configured, OAuth can still complete, but the deep validation step that calls `getMarketplaceParticipations` may return a role error.

## What the Merchant Must Provide

For a real merchant connection:

- An active Amazon seller account
- Authorization through the Amazon connect button in the dashboard

For real messaging workflows after connection:

- At least one valid Amazon order context
- The specific message type allowed by Amazon for that order

## Sandbox / Demo

Amazon SP-API has sandbox endpoints, including the EU sandbox used for Turkey-region marketplace infrastructure.

Notes:

- Sandbox helps validate app wiring and API call shape.
- Sandbox does **not** replace a real merchant for end-to-end buyer messaging verification.
- For production-like QA, use a real seller authorization and ideally a non-critical test order.

## Beta Test Checklist

To test the current integration on beta:

1. Add the Amazon SP-API env vars to the beta backend service.
2. Register the beta Login URI and Redirect URI in the Amazon app.
3. Run the Prisma migration on beta if the environment has not picked it up yet.
4. Open `beta.telyx.ai/dashboard/integrations` and connect Amazon from a real seller account.
5. Use the connection test to confirm OAuth + marketplace participation validation.

## Current Limitation

The existing `/dashboard/marketplace-qa` page is still specific to Trendyol and Hepsiburada style product-question workflows.

Amazon is currently connected as:

- OAuth + token layer
- account validation layer
- future Buyer Messaging foundation
