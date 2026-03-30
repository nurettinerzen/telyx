import prisma from '../prismaClient.js';
import { isPhoneInboundEnabledForBusinessRecord } from './phoneInboundGate.js';
import { buildPhoneEntitlements, ENTITLEMENT_REASONS } from './phonePlanEntitlements.js';

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['ACTIVE', 'TRIAL']);

const PLAN_ALIASES = Object.freeze({
  ENT: 'ENTERPRISE'
});

const PHONE_OUTBOUND_SUBSCRIPTION_SELECT = {
  id: true,
  businessId: true,
  plan: true,
  status: true,
  business: {
    select: {
      phoneInboundEnabled: true
    }
  }
};

export const PHONE_OUTBOUND_ENTRYPOINTS = Object.freeze({
  ASSISTANTS_TEST_CALL: '/api/assistants/test-call',
  BATCH_CALLS_PARSE: '/api/batch-calls/parse',
  BATCH_CALLS_CREATE: '/api/batch-calls',
  PHONE_NUMBER_TEST_CALL: '/api/phone-numbers/:id/test-call'
});

function normalizePlan(planName) {
  const rawPlan = String(planName || 'FREE').trim().toUpperCase();
  return PLAN_ALIASES[rawPlan] || rawPlan || 'FREE';
}

function normalizeStatus(status) {
  const rawStatus = String(status || '').trim().toUpperCase();
  return rawStatus || 'NONE';
}

function resolveRequiredPlan(outboundEntitlement) {
  if (outboundEntitlement?.campaigns?.requiredPlan) {
    return outboundEntitlement.campaigns.requiredPlan;
  }

  if (outboundEntitlement?.requiredPlan) {
    return outboundEntitlement.requiredPlan;
  }

  if (outboundEntitlement?.reason === ENTITLEMENT_REASONS.PLAN_DISABLED) {
    return 'TRIAL';
  }

  return null;
}

export function resolvePhoneOutboundAccessFromSubscription(subscription, options = {}) {
  const normalizedPlan = normalizePlan(subscription?.plan);
  const normalizedStatus = normalizeStatus(subscription?.status);
  const hasSubscription = Boolean(subscription);

  const inboundDirectionAllowed = typeof options.inboundDirectionAllowedOverride === 'boolean'
    ? options.inboundDirectionAllowedOverride
    : (typeof options.inboundEnabledOverride === 'boolean'
      ? options.inboundEnabledOverride
      : isPhoneInboundEnabledForBusinessRecord(subscription?.business));

  const outboundDirectionAllowed = typeof options.outboundDirectionAllowedOverride === 'boolean'
    ? options.outboundDirectionAllowedOverride
    : true;

  const entitlements = buildPhoneEntitlements({
    plan: normalizedPlan,
    inboundDirectionAllowed,
    outboundDirectionAllowed
  });

  const outbound = entitlements?.outbound || {
    enabled: false,
    reason: ENTITLEMENT_REASONS.PLAN_DISABLED
  };

  const requiredPlan = resolveRequiredPlan(outbound);

  if (!hasSubscription) {
    return {
      hasAccess: false,
      hasSubscription: false,
      plan: normalizedPlan,
      status: 'NONE',
      reasonCode: 'NO_SUBSCRIPTION',
      requiredPlan,
      outboundEnabled: false,
      outboundTestCallEnabled: false,
      entitlements
    };
  }

  if (!ACTIVE_SUBSCRIPTION_STATUSES.has(normalizedStatus)) {
    return {
      hasAccess: false,
      hasSubscription: true,
      plan: normalizedPlan,
      status: normalizedStatus,
      reasonCode: 'SUBSCRIPTION_INACTIVE',
      requiredPlan,
      outboundEnabled: false,
      outboundTestCallEnabled: false,
      entitlements
    };
  }

  if (!outbound.enabled) {
    return {
      hasAccess: false,
      hasSubscription: true,
      plan: normalizedPlan,
      status: normalizedStatus,
      reasonCode: outbound.reason || ENTITLEMENT_REASONS.PLAN_DISABLED,
      requiredPlan,
      outboundEnabled: false,
      outboundTestCallEnabled: false,
      entitlements
    };
  }

  return {
    hasAccess: true,
    hasSubscription: true,
    plan: normalizedPlan,
    status: normalizedStatus,
    reasonCode: null,
    requiredPlan: null,
    outboundEnabled: true,
    outboundTestCallEnabled: true,
    entitlements
  };
}

export async function resolvePhoneOutboundAccessForBusinessId(businessId, options = {}) {
  const parsedBusinessId = Number.parseInt(String(businessId), 10);

  if (!Number.isFinite(parsedBusinessId)) {
    return resolvePhoneOutboundAccessFromSubscription(null, options);
  }

  const subscription = await prisma.subscription.findUnique({
    where: { businessId: parsedBusinessId },
    select: PHONE_OUTBOUND_SUBSCRIPTION_SELECT
  });

  return resolvePhoneOutboundAccessFromSubscription(subscription, options);
}

export function evaluateOutboundEntrypoints(access) {
  return Object.values(PHONE_OUTBOUND_ENTRYPOINTS).map((entrypoint) => ({
    entrypoint,
    allowed: Boolean(access?.hasAccess),
    reasonCode: access?.reasonCode || null,
    requiredPlan: access?.requiredPlan || null
  }));
}

export default {
  PHONE_OUTBOUND_ENTRYPOINTS,
  resolvePhoneOutboundAccessFromSubscription,
  resolvePhoneOutboundAccessForBusinessId,
  evaluateOutboundEntrypoints
};
