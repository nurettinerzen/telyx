import { isPhoneInboundForceDisabled } from './phoneInboundGate.js';

const PHONE_ENABLED_PLANS = new Set([
  'TRIAL',
  'PAYG',
  'PRO',
  'ENTERPRISE'
]);

export const ENTITLEMENT_REASONS = Object.freeze({
  PLAN_DISABLED: 'PLAN_DISABLED',
  PLAN_UPGRADE_REQUIRED: 'PLAN_UPGRADE_REQUIRED',
  V1_OUTBOUND_ONLY: 'V1_OUTBOUND_ONLY',
  BUSINESS_DISABLED: 'BUSINESS_DISABLED'
});

const PLAN_ALIASES = Object.freeze({
  ENT: 'ENTERPRISE'
});

function toPlanCode(planName) {
  const raw = String(planName || 'FREE').trim().toUpperCase();
  return PLAN_ALIASES[raw] || raw || 'FREE';
}

export function isPlanPhoneEnabled(planName) {
  const plan = toPlanCode(planName);
  return PHONE_ENABLED_PLANS.has(plan);
}

function resolveInboundDirectionAllowed(options = {}) {
  if (typeof options.inboundDirectionAllowed === 'boolean') {
    return options.inboundDirectionAllowed;
  }

  if (typeof options.inboundEnabled === 'boolean') {
    return options.inboundEnabled;
  }

  return false;
}

function resolveOutboundDirectionAllowed(options = {}) {
  if (typeof options.outboundDirectionAllowed === 'boolean') {
    return options.outboundDirectionAllowed;
  }

  return true;
}

function getInboundDisabledReason() {
  return isPhoneInboundForceDisabled()
    ? ENTITLEMENT_REASONS.V1_OUTBOUND_ONLY
    : ENTITLEMENT_REASONS.BUSINESS_DISABLED;
}

function buildOutboundEntitlement({ enabled, reason, requiredPlan }) {
  return {
    enabled,
    reason,
    requiredPlan,
    testCall: {
      enabled,
      reason,
      requiredPlan
    },
    campaigns: {
      enabled,
      reason,
      requiredPlan,
      mode: 'OUTBOUND_UNIFIED'
    }
  };
}

export function getInboundEntitlementForPlan({
  planName,
  inboundEnabled,
  inboundDirectionAllowed
} = {}) {
  const plan = toPlanCode(planName);
  const planPhoneEnabled = isPlanPhoneEnabled(plan);
  const inboundDirection = resolveInboundDirectionAllowed({
    inboundEnabled,
    inboundDirectionAllowed
  });

  if (!planPhoneEnabled) {
    return {
      enabled: false,
      reason: ENTITLEMENT_REASONS.PLAN_DISABLED,
      requiredPlan: 'TRIAL'
    };
  }

  if (!inboundDirection) {
    return {
      enabled: false,
      reason: getInboundDisabledReason(),
      requiredPlan: null
    };
  }

  return {
    enabled: true,
    reason: null,
    requiredPlan: null
  };
}

export function getCampaignEntitlementForPlan(planName, options = {}) {
  const outbound = getOutboundEntitlementForPlan(planName, options);
  return outbound.campaigns;
}

export function getOutboundEntitlementForPlan(planName, options = {}) {
  const plan = toPlanCode(planName);
  const planPhoneEnabled = isPlanPhoneEnabled(plan);
  const outboundDirectionAllowed = resolveOutboundDirectionAllowed(options);

  if (!planPhoneEnabled) {
    return buildOutboundEntitlement({
      enabled: false,
      reason: ENTITLEMENT_REASONS.PLAN_DISABLED,
      requiredPlan: 'TRIAL'
    });
  }

  if (!outboundDirectionAllowed) {
    return buildOutboundEntitlement({
      enabled: false,
      reason: ENTITLEMENT_REASONS.BUSINESS_DISABLED,
      requiredPlan: null
    });
  }

  return buildOutboundEntitlement({
    enabled: true,
    reason: null,
    requiredPlan: null
  });
}

export function buildPhoneEntitlements({
  plan,
  inboundEnabled,
  inboundDirectionAllowed,
  outboundDirectionAllowed
} = {}) {
  const normalizedPlan = toPlanCode(plan);
  const planPhoneEnabled = isPlanPhoneEnabled(normalizedPlan);
  const inboundDirection = resolveInboundDirectionAllowed({
    inboundEnabled,
    inboundDirectionAllowed
  });
  const outboundDirection = resolveOutboundDirectionAllowed({
    outboundDirectionAllowed
  });

  const inbound = getInboundEntitlementForPlan({
    planName: normalizedPlan,
    inboundDirectionAllowed: inboundDirection
  });
  const outbound = getOutboundEntitlementForPlan(normalizedPlan, {
    outboundDirectionAllowed: outboundDirection
  });

  return {
    planPhoneEnabled,
    inboundDirectionAllowed: inboundDirection,
    outboundDirectionAllowed: outboundDirection,
    inboundEnabledEffective: planPhoneEnabled && inboundDirection,
    outboundEnabledEffective: planPhoneEnabled && outboundDirection,
    phoneInboundEnabled: inbound.enabled,
    phoneOutboundEnabled: outbound.enabled,
    inbound,
    outbound,
    customerData: {
      enabled: outbound.enabled,
      reason: outbound.enabled ? null : outbound.reason
    },
    rollout: {
      outboundOnlyV1: isPhoneInboundForceDisabled()
    }
  };
}

export default {
  ENTITLEMENT_REASONS,
  isPlanPhoneEnabled,
  getInboundEntitlementForPlan,
  getCampaignEntitlementForPlan,
  getOutboundEntitlementForPlan,
  buildPhoneEntitlements
};
