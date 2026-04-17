/**
 * Centralized Configuration
 * All environment variables are validated and exported from here
 */

import runtimeConfig from './runtime.js';

// Required environment variables - will throw if not defined
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'FRONTEND_URL',
  'BACKEND_URL',
  'ALLOWED_ORIGINS'
];

// Validate required environment variables
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }
}

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',
  isProd: process.env.NODE_ENV === 'production',
  appEnv: runtimeConfig.appEnv,
  isBetaApp: runtimeConfig.isBetaApp,
  isProductionApp: runtimeConfig.isProductionApp,

  // URLs
  frontendUrl: runtimeConfig.frontendUrl,
  backendUrl: runtimeConfig.backendUrl,
  siteUrl: runtimeConfig.siteUrl,
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',').map(origin => origin.trim()) || [],

  // Database
  databaseUrl: process.env.DATABASE_URL,

  // Authentication
  jwtSecret: process.env.JWT_SECRET,
  nextAuthSecret: process.env.NEXTAUTH_SECRET,

  // External Services
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    starterPriceId: process.env.STRIPE_STARTER_PRICE_ID,
    proPriceId: process.env.STRIPE_PRO_PRICE_ID,
    enterprisePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.EMAIL_FROM || 'Telyx.AI <info@telyx.ai>',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    tenantId: process.env.MICROSOFT_TENANT_ID,
  },
  shopify: {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecret: process.env.SHOPIFY_API_SECRET,
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },
  netgsm: {
    username: process.env.NETGSM_USERNAME,
    password: process.env.NETGSM_PASSWORD,
  },
};

export default config;
