import { getPricePerMinute } from './plans.js';

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parsePositiveFloat(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

const DEFAULT_WRITTEN_LIMITS = {
  TRIAL: parsePositiveInt(process.env.TRIAL_WRITTEN_INTERACTIONS, 50),
  PAYG: 0,
  STARTER: parsePositiveInt(process.env.STARTER_WRITTEN_INTERACTIONS, 500),
  PRO: parsePositiveInt(process.env.PRO_WRITTEN_INTERACTIONS, 2000),
  ENTERPRISE: parsePositiveInt(process.env.ENTERPRISE_WRITTEN_INTERACTIONS, 10000)
};

const DEFAULT_WRITTEN_PRICES = {
  TR: parsePositiveFloat(process.env.WRITTEN_INTERACTION_PRICE_TRY, 2.5),
  BR: parsePositiveFloat(process.env.WRITTEN_INTERACTION_PRICE_BRL, 0.5),
  US: parsePositiveFloat(process.env.WRITTEN_INTERACTION_PRICE_USD, 0.06)
};

const WRITTEN_ADDON_PACKAGES = Object.freeze([
  { id: 'written_500', kind: 'WRITTEN', quantity: 500 },
  { id: 'written_2000', kind: 'WRITTEN', quantity: 2000 }
]);

const VOICE_ADDON_PACKAGES = Object.freeze([
  { id: 'voice_100', kind: 'VOICE', quantity: 100 },
  { id: 'voice_300', kind: 'VOICE', quantity: 300 }
]);

function normalizeCountry(country) {
  return String(country || 'TR').trim().toUpperCase() || 'TR';
}

function getWrittenUnitPrice(country = 'TR') {
  const normalizedCountry = normalizeCountry(country);
  return DEFAULT_WRITTEN_PRICES[normalizedCountry] ?? DEFAULT_WRITTEN_PRICES.US;
}

function getBasePlanDefinition(planName, country = 'TR') {
  const normalizedPlan = String(planName || 'FREE').trim().toUpperCase();

  const catalog = {
    FREE: {
      plan: 'FREE',
      billingModel: 'free',
      includedWrittenInteractions: 0,
      includedVoiceMinutes: 0,
      concurrentCallLimit: 0,
      assistantLimit: 0,
      channels: { webchat: false, whatsapp: false, email: false, phone: false },
      allowAddOns: { written: false, voice: false },
      overageAllowed: { written: false, voice: false },
      walletEnabled: false
    },
    TRIAL: {
      plan: 'TRIAL',
      billingModel: 'trial',
      includedWrittenInteractions: DEFAULT_WRITTEN_LIMITS.TRIAL,
      includedVoiceMinutes: 15,
      concurrentCallLimit: 1,
      assistantLimit: 1,
      channels: { webchat: true, whatsapp: true, email: true, phone: true },
      allowAddOns: { written: false, voice: false },
      overageAllowed: { written: false, voice: false },
      walletEnabled: false
    },
    PAYG: {
      plan: 'PAYG',
      billingModel: 'payg',
      includedWrittenInteractions: 0,
      includedVoiceMinutes: 0,
      concurrentCallLimit: 1,
      assistantLimit: 5,
      channels: { webchat: true, whatsapp: true, email: true, phone: true },
      allowAddOns: { written: true, voice: true },
      overageAllowed: { written: false, voice: false },
      walletEnabled: true
    },
    STARTER: {
      plan: 'STARTER',
      billingModel: 'recurring',
      includedWrittenInteractions: DEFAULT_WRITTEN_LIMITS.STARTER,
      includedVoiceMinutes: 0,
      concurrentCallLimit: 0,
      assistantLimit: 5,
      channels: { webchat: true, whatsapp: true, email: true, phone: false },
      allowAddOns: { written: true, voice: false },
      overageAllowed: { written: true, voice: false },
      walletEnabled: false
    },
    BASIC: {
      plan: 'STARTER',
      billingModel: 'recurring',
      includedWrittenInteractions: DEFAULT_WRITTEN_LIMITS.STARTER,
      includedVoiceMinutes: 0,
      concurrentCallLimit: 0,
      assistantLimit: 5,
      channels: { webchat: true, whatsapp: true, email: true, phone: false },
      allowAddOns: { written: true, voice: false },
      overageAllowed: { written: true, voice: false },
      walletEnabled: false
    },
    PRO: {
      plan: 'PRO',
      billingModel: 'recurring',
      includedWrittenInteractions: DEFAULT_WRITTEN_LIMITS.PRO,
      includedVoiceMinutes: 500,
      concurrentCallLimit: 2,
      assistantLimit: 10,
      channels: { webchat: true, whatsapp: true, email: true, phone: true },
      allowAddOns: { written: true, voice: true },
      overageAllowed: { written: true, voice: true },
      walletEnabled: false
    },
    ENTERPRISE: {
      plan: 'ENTERPRISE',
      billingModel: 'enterprise',
      includedWrittenInteractions: DEFAULT_WRITTEN_LIMITS.ENTERPRISE,
      includedVoiceMinutes: null,
      concurrentCallLimit: 5,
      assistantLimit: 25,
      channels: { webchat: true, whatsapp: true, email: true, phone: true },
      allowAddOns: { written: true, voice: true },
      overageAllowed: { written: true, voice: true },
      walletEnabled: false
    }
  };

  const plan = catalog[normalizedPlan] || catalog.FREE;
  const voiceMinuteUnitPrice = getPricePerMinute('PAYG', country);

  return {
    ...plan,
    writtenInteractionUnitPrice: getWrittenUnitPrice(country),
    voiceMinuteUnitPrice
  };
}

export function getBillingPlanDefinition(subscriptionOrPlan, country = null) {
  const planName = typeof subscriptionOrPlan === 'string'
    ? subscriptionOrPlan
    : subscriptionOrPlan?.plan;
  const resolvedCountry = country
    || subscriptionOrPlan?.business?.country
    || 'TR';

  const base = getBasePlanDefinition(planName, resolvedCountry);

  if (!subscriptionOrPlan || typeof subscriptionOrPlan === 'string' || base.plan !== 'ENTERPRISE') {
    return base;
  }

  const customWritten = Number.isFinite(subscriptionOrPlan.enterpriseSupportInteractions)
    ? Math.max(Number(subscriptionOrPlan.enterpriseSupportInteractions), 0)
    : null;
  const customVoice = Number.isFinite(subscriptionOrPlan.enterpriseMinutes)
    ? Math.max(Number(subscriptionOrPlan.enterpriseMinutes), 0)
    : null;
  const customConcurrent = Number.isFinite(subscriptionOrPlan.enterpriseConcurrent)
    ? Math.max(Number(subscriptionOrPlan.enterpriseConcurrent), 0)
    : base.concurrentCallLimit;
  const customAssistants = Number.isFinite(subscriptionOrPlan.enterpriseAssistants)
    ? Math.max(Number(subscriptionOrPlan.enterpriseAssistants), 0)
    : base.assistantLimit;

  return {
    ...base,
    includedWrittenInteractions: customWritten ?? base.includedWrittenInteractions,
    includedVoiceMinutes: customVoice,
    concurrentCallLimit: customConcurrent,
    assistantLimit: customAssistants,
    customConfigured: customWritten !== null || customVoice !== null
  };
}

export function getAddOnCatalog(country = 'TR', subscriptionOrPlan = null) {
  const billingPlan = getBillingPlanDefinition(subscriptionOrPlan || 'FREE', country);
  const writtenUnitPrice = billingPlan.writtenInteractionUnitPrice;
  const voiceUnitPrice = billingPlan.voiceMinuteUnitPrice;

  return {
    written: billingPlan.allowAddOns.written
      ? WRITTEN_ADDON_PACKAGES.map((pkg) => ({
        ...pkg,
        unitPrice: writtenUnitPrice,
        amount: +(pkg.quantity * writtenUnitPrice).toFixed(2)
      }))
      : [],
    voice: billingPlan.allowAddOns.voice
      ? VOICE_ADDON_PACKAGES.map((pkg) => ({
        ...pkg,
        unitPrice: voiceUnitPrice,
        amount: +(pkg.quantity * voiceUnitPrice).toFixed(2)
      }))
      : []
  };
}

export function getAddOnPackage(kind, packageId, country = 'TR', subscriptionOrPlan = null) {
  const catalog = getAddOnCatalog(country, subscriptionOrPlan);
  const pool = String(kind || '').toUpperCase() === 'VOICE' ? catalog.voice : catalog.written;
  return pool.find((pkg) => pkg.id === packageId) || null;
}

export function getWrittenChannelFlags(subscriptionOrPlan, country = null) {
  const plan = getBillingPlanDefinition(subscriptionOrPlan, country);
  return {
    webchat: Boolean(plan.channels.webchat),
    whatsapp: Boolean(plan.channels.whatsapp),
    email: Boolean(plan.channels.email)
  };
}

export function isWrittenChannelEnabled(subscriptionOrPlan, channel, country = null) {
  const flags = getWrittenChannelFlags(subscriptionOrPlan, country);
  const normalizedChannel = String(channel || '').trim().toUpperCase();
  if (normalizedChannel === 'CHAT') return flags.webchat;
  if (normalizedChannel === 'WHATSAPP') return flags.whatsapp;
  if (normalizedChannel === 'EMAIL') return flags.email;
  return false;
}

export default {
  getBillingPlanDefinition,
  getAddOnCatalog,
  getAddOnPackage,
  getWrittenChannelFlags,
  getWrittenUnitPrice,
  isWrittenChannelEnabled
};
