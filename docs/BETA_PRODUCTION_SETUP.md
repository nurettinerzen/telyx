# Beta / Production Setup

This repo is now prepared for a two-environment rollout:

- `main` branch -> beta
- `production` branch -> live production

The application code now reads `APP_ENV` and `NEXT_PUBLIC_APP_ENV` so beta can run with `NODE_ENV=production` without behaving like live production.

## Recommended topology

### Frontend

- Create `telyx-frontend-beta` on Vercel
  - Branch: `main`
  - Domain: `beta.telyx.ai`
- Create `telyx-frontend-production` on Vercel
  - Branch: `production`
  - Domain: `telyx.ai`

### Backend

- Create `telyx-backend-beta` on Render
  - Branch: `main`
  - Domain: `beta-api.telyx.ai`
  - Database: separate beta Postgres
- Create `telyx-backend-production` on Render
  - Branch: `production`
  - Domain: `api.telyx.ai`
  - Database: separate production Postgres

Do not share the production database, Redis instance, webhook secrets, or Stripe keys with beta.

## Environment variables

Use these example files as the source of truth:

- `backend/.env.beta.example`
- `backend/.env.production.example`
- `frontend/.env.beta.example`
- `frontend/.env.production.example`

Minimum environment split:

### Backend beta

- `NODE_ENV=production`
- `APP_ENV=beta`
- `FRONTEND_URL=https://beta.telyx.ai`
- `SITE_URL=https://beta.telyx.ai`
- `BACKEND_URL=https://beta-api.telyx.ai`
- `ALLOWED_ORIGINS=https://beta.telyx.ai,https://beta-api.telyx.ai`
- `DATABASE_URL=<beta database>`
- `STRIPE_SECRET_KEY=<test key>`
- `STRIPE_WEBHOOK_SECRET=<test webhook secret>`
- `STRIPE_*_PRICE_ID*=<test prices>`
- `AMAZON_SP_API_APP_ID=<amazon seller app id>`
- `AMAZON_SP_API_CLIENT_ID=<amazon lwa client id>`
- `AMAZON_SP_API_CLIENT_SECRET=<amazon lwa client secret>`
- `AMAZON_SP_API_DEFAULT_MARKETPLACE_ID=A33AVAJ2PDY3EV`
- `AMAZON_SP_API_SELLER_CENTRAL_URL=https://sellercentral.amazon.com.tr`
- `AMAZON_SP_API_USE_DRAFT_AUTH=true`
- `AMAZON_SP_API_USE_SANDBOX=false`

If the beta database is a brand-new Supabase project, run a one-time schema bootstrap after the first deploy:

1. Open the Render shell for the beta backend service.
2. Run `cd /opt/render/project/src/backend`
3. Run `npm run db:push`
4. Restart or redeploy the beta backend service.

This repo's Prisma migration history does not contain a full initial baseline for an empty database, so `db push` is the fastest way to create the beta tables the app expects. Do not use this shortcut for the live production database.

### Backend production

- `NODE_ENV=production`
- `APP_ENV=production`
- `FRONTEND_URL=https://telyx.ai`
- `SITE_URL=https://telyx.ai`
- `BACKEND_URL=https://api.telyx.ai`
- `ALLOWED_ORIGINS=https://telyx.ai,https://api.telyx.ai`
- `DATABASE_URL=<production database>`
- `STRIPE_SECRET_KEY=<live key>`
- `STRIPE_WEBHOOK_SECRET=<live webhook secret>`
- `STRIPE_*_PRICE_ID*=<live prices>`
- `AMAZON_SP_API_APP_ID=<amazon seller app id>`
- `AMAZON_SP_API_CLIENT_ID=<amazon lwa client id>`
- `AMAZON_SP_API_CLIENT_SECRET=<amazon lwa client secret>`
- `AMAZON_SP_API_DEFAULT_MARKETPLACE_ID=A33AVAJ2PDY3EV`
- `AMAZON_SP_API_SELLER_CENTRAL_URL=https://sellercentral.amazon.com.tr`
- `AMAZON_SP_API_USE_DRAFT_AUTH=false`
- `AMAZON_SP_API_USE_SANDBOX=false`

### Frontend beta

- `NEXT_PUBLIC_APP_ENV=beta`
- `NEXT_PUBLIC_SITE_URL=https://beta.telyx.ai`
- `NEXT_PUBLIC_API_URL=https://beta-api.telyx.ai`
- `NEXTAUTH_URL=https://beta.telyx.ai`
- `NEXT_PUBLIC_LANDING_CHAT_EMBED_KEY=<beta embed key, optional>`

### Frontend production

- `NEXT_PUBLIC_APP_ENV=production`
- `NEXT_PUBLIC_SITE_URL=https://telyx.ai`
- `NEXT_PUBLIC_API_URL=https://api.telyx.ai`
- `NEXTAUTH_URL=https://telyx.ai`
- `NEXT_PUBLIC_LANDING_CHAT_EMBED_KEY=<production embed key, optional>`

## Stripe setup

Beta and production must be completely separate in Stripe:

- Beta uses Stripe test mode only.
- Production uses Stripe live mode only.
- Create a beta webhook endpoint that points to `https://beta-api.telyx.ai/api/subscription/webhook`.
- Create a production webhook endpoint that points to `https://api.telyx.ai/api/subscription/webhook`.
- Create separate beta and production Price IDs for every plan/add-on.
- Update backend environment variables with the correct set of price IDs per environment.

If you use customer portal, payment links, or enterprise payment links, validate both environments independently because redirect URLs now follow the configured frontend domain.

## Other providers to split

Create separate beta vs production credentials or callback URLs for any provider that stores redirect or webhook URLs:

- Google OAuth
- Microsoft OAuth
- Amazon SP-API seller app
- Meta / WhatsApp
- ElevenLabs webhooks
- Shopify / other e-commerce apps
- Resend sender domain setup if you want beta mail to be isolated

## Deployment flow

1. Merge day-to-day work into `main`.
2. `main` auto-deploys to beta.
3. Test on `beta.telyx.ai` and `beta-api.telyx.ai`.
4. When beta is approved, run the GitHub workflow `Promote Production`.
5. The workflow fast-forwards `production` to the approved source branch.
6. Vercel and Render production services deploy from `production`.

## GitHub protection settings

Recommended GitHub settings:

- Protect `production` branch.
- Require pull request or required reviewers before production promotion.
- Add a GitHub Environment named `production` and require approval for the `Promote Production` workflow.

## What changed in code

- Backend URLs, site URLs, and Stripe mode warnings are now environment-aware.
- Stripe redirect URLs and 11Labs webhook URLs no longer silently fall back to production domains.
- Beta frontend adds `noindex` protections and a visible beta banner.
- Homepage widget can now use a beta-specific embed key instead of reusing production by accident.
