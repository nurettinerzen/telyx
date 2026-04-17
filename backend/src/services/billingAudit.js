import prisma from '../prismaClient.js';

const BILLING_AUDIT_MODEL_TOKENS = [
  'BillingCheckoutSession',
  'BillingTrialClaim',
  'billingCheckoutSession',
  'billingTrialClaim'
];

function hasDelegate(modelName, methodName) {
  return typeof prisma?.[modelName]?.[methodName] === 'function';
}

export function isBillingAuditSchemaError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '');

  if (code === 'P2021' || code === 'P2022') {
    return true;
  }

  return BILLING_AUDIT_MODEL_TOKENS.some((token) => message.includes(token));
}

async function runBillingAuditOperation(operation, fallbackValue) {
  try {
    return await operation();
  } catch (error) {
    if (!isBillingAuditSchemaError(error)) {
      throw error;
    }

    return fallbackValue;
  }
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }

  return metadata;
}

export function normalizeBillingEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function extractBillingEmailDomain(email) {
  const normalized = normalizeBillingEmail(email);
  const atIndex = normalized.indexOf('@');
  if (atIndex === -1) {
    return null;
  }

  return normalized.slice(atIndex + 1) || null;
}

export async function resolveBillingTrialEligibility({ businessId, email }) {
  const normalizedEmail = normalizeBillingEmail(email);

  if (!normalizedEmail || !hasDelegate('billingTrialClaim', 'findUnique')) {
    return {
      allowed: true,
      normalizedEmail,
      existingClaim: null
    };
  }

  const existingClaim = await runBillingAuditOperation(
    () => prisma.billingTrialClaim.findUnique({
      where: { normalizedEmail }
    }),
    null
  );

  if (existingClaim && existingClaim.firstBusinessId !== businessId) {
    return {
      allowed: false,
      normalizedEmail,
      existingClaim
    };
  }

  return {
    allowed: true,
    normalizedEmail,
    existingClaim
  };
}

export async function registerBillingTrialClaim({ businessId, userId = null, email, metadata = {} }) {
  const normalizedEmail = normalizeBillingEmail(email);
  if (!normalizedEmail || !hasDelegate('billingTrialClaim', 'upsert')) {
    return null;
  }

  const payload = sanitizeMetadata(metadata);

  return runBillingAuditOperation(
    () => prisma.billingTrialClaim.upsert({
      where: { normalizedEmail },
      create: {
        normalizedEmail,
        emailDomain: extractBillingEmailDomain(normalizedEmail),
        firstBusinessId: businessId,
        firstUserId: userId,
        metadata: payload
      },
      update: {
        lastSeenAt: new Date(),
        metadata: payload
      }
    }),
    null
  );
}

export async function recordBillingCheckoutSession(input) {
  if (!hasDelegate('billingCheckoutSession', 'create')) {
    return null;
  }

  const data = {
    businessId: input.businessId,
    subscriptionId: input.subscriptionId ?? null,
    provider: input.provider || 'stripe',
    checkoutType: input.checkoutType,
    status: input.status || 'OPEN',
    stripeCheckoutSessionId: input.stripeCheckoutSessionId || null,
    stripePaymentIntentId: input.stripePaymentIntentId || null,
    stripeCustomerId: input.stripeCustomerId || null,
    stripeSubscriptionId: input.stripeSubscriptionId || null,
    planId: input.planId || null,
    addonKind: input.addonKind || null,
    packageId: input.packageId || null,
    amount: input.amount ?? null,
    currency: input.currency || null,
    checkoutUrl: input.checkoutUrl || null,
    successUrl: input.successUrl || null,
    cancelUrl: input.cancelUrl || null,
    metadata: sanitizeMetadata(input.metadata),
    completedAt: input.completedAt || null,
    expiresAt: input.expiresAt || null
  };

  if (data.stripeCheckoutSessionId && hasDelegate('billingCheckoutSession', 'upsert')) {
    return runBillingAuditOperation(
      () => prisma.billingCheckoutSession.upsert({
        where: { stripeCheckoutSessionId: data.stripeCheckoutSessionId },
        create: data,
        update: {
          subscriptionId: data.subscriptionId,
          provider: data.provider,
          checkoutType: data.checkoutType,
          status: data.status,
          stripePaymentIntentId: data.stripePaymentIntentId,
          stripeCustomerId: data.stripeCustomerId,
          stripeSubscriptionId: data.stripeSubscriptionId,
          planId: data.planId,
          addonKind: data.addonKind,
          packageId: data.packageId,
          amount: data.amount,
          currency: data.currency,
          checkoutUrl: data.checkoutUrl,
          successUrl: data.successUrl,
          cancelUrl: data.cancelUrl,
          metadata: data.metadata,
          completedAt: data.completedAt,
          expiresAt: data.expiresAt
        }
      }),
      null
    );
  }

  return runBillingAuditOperation(
    () => prisma.billingCheckoutSession.create({ data }),
    null
  );
}

export async function updateBillingCheckoutSessionByStripeId(stripeCheckoutSessionId, data) {
  if (!stripeCheckoutSessionId || !hasDelegate('billingCheckoutSession', 'updateMany')) {
    return false;
  }

  const updateData = {
    ...data,
    metadata: sanitizeMetadata(data?.metadata)
  };

  const result = await runBillingAuditOperation(
    () => prisma.billingCheckoutSession.updateMany({
      where: { stripeCheckoutSessionId },
      data: updateData
    }),
    { count: 0 }
  );

  return Boolean(result?.count);
}

export async function markBillingCheckoutSessionCompleted(stripeCheckoutSessionId, data = {}) {
  return updateBillingCheckoutSessionByStripeId(stripeCheckoutSessionId, {
    status: 'COMPLETED',
    completedAt: data.completedAt || new Date(),
    stripePaymentIntentId: data.stripePaymentIntentId || null,
    stripeSubscriptionId: data.stripeSubscriptionId || null,
    stripeCustomerId: data.stripeCustomerId || null,
    metadata: data.metadata
  });
}

export async function markBillingCheckoutSessionExpired(stripeCheckoutSessionId, data = {}) {
  return updateBillingCheckoutSessionByStripeId(stripeCheckoutSessionId, {
    status: data.status || 'EXPIRED',
    metadata: data.metadata
  });
}

export async function listOpenBillingCheckoutSessions(businessId, checkoutTypes = [], take = 5) {
  if (!businessId || !hasDelegate('billingCheckoutSession', 'findMany')) {
    return [];
  }

  const where = {
    businessId,
    status: 'OPEN',
    stripeCheckoutSessionId: { not: null }
  };

  if (Array.isArray(checkoutTypes) && checkoutTypes.length > 0) {
    where.checkoutType = { in: checkoutTypes };
  }

  return runBillingAuditOperation(
    () => prisma.billingCheckoutSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take
    }),
    []
  );
}
