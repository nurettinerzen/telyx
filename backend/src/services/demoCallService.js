import prisma from '../prismaClient.js';

const DEMO_CONFIG = {
  agentId: process.env.ELEVENLABS_DEMO_AGENT_ID,
  phoneNumberId: process.env.ELEVENLABS_DEMO_PHONE_NUMBER_ID
};

const DEMO_BUSINESS_ID = 999999;

export function normalizeTurkishLeadPhone(phoneNumber) {
  if (!phoneNumber) return null;

  let cleanPhone = String(phoneNumber).replace(/\D/g, '');
  if (!cleanPhone) return null;

  if (cleanPhone.startsWith('0')) {
    cleanPhone = '90' + cleanPhone.substring(1);
  }
  if (!cleanPhone.startsWith('90') && cleanPhone.length === 10) {
    cleanPhone = '90' + cleanPhone;
  }
  if (!cleanPhone.startsWith('90')) {
    return null;
  }

  return `+${cleanPhone}`;
}

export function isDemoCallConfigured() {
  return Boolean(DEMO_CONFIG.agentId && DEMO_CONFIG.phoneNumberId);
}

async function ensureDemoBusinessContext() {
  await prisma.business.upsert({
    where: { id: DEMO_BUSINESS_ID },
    update: {},
    create: {
      id: DEMO_BUSINESS_ID,
      name: 'DEMO_CALLS',
      language: 'TR',
      country: 'TR'
    }
  });

  await prisma.subscription.upsert({
    where: { businessId: DEMO_BUSINESS_ID },
    update: {},
    create: {
      businessId: DEMO_BUSINESS_ID,
      plan: 'ENTERPRISE',
      status: 'ACTIVE',
      concurrentLimit: 999
    }
  });
}

export async function initiateDemoCall({ phoneNumber, language = 'TR', name }) {
  const normalizedPhone = normalizeTurkishLeadPhone(phoneNumber);
  if (!normalizedPhone) {
    return {
      success: false,
      reason: 'invalid_phone'
    };
  }

  if (!isDemoCallConfigured()) {
    return {
      success: false,
      reason: 'not_configured'
    };
  }

  await ensureDemoBusinessContext();

  const { initiateOutboundCallSafe } = await import('./safeCallInitiator.js');

  const result = await initiateOutboundCallSafe({
    businessId: DEMO_BUSINESS_ID,
    agentId: DEMO_CONFIG.agentId,
    phoneNumberId: DEMO_CONFIG.phoneNumberId,
    toNumber: normalizedPhone,
    clientData: {
      caller_name: name || 'Demo Lead',
      language,
      demo: true
    }
  });

  if (!result.success) {
    return {
      success: false,
      reason: 'capacity',
      retryAfter: result.retryAfter || null
    };
  }

  return {
    success: true,
    call: result.call,
    callId: result.call?.call_sid || result.call?.conversation_id || null,
    normalizedPhone
  };
}

