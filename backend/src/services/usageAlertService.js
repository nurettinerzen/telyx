import { getPricePerMinute } from '../config/plans.js';

const WARNING_THRESHOLD_PERCENT = 80;
const LOW_BALANCE_MINUTES_THRESHOLD = 2;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundPercentage(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.round(value), 999);
}

function pushAlert(list, alert) {
  list.push({
    severity: 'warning',
    scope: 'general',
    ...alert
  });
}

function sortAlerts(alerts = []) {
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  return [...alerts].sort((left, right) => {
    const leftSeverity = severityOrder[left.severity] ?? 99;
    const rightSeverity = severityOrder[right.severity] ?? 99;
    if (leftSeverity !== rightSeverity) {
      return leftSeverity - rightSeverity;
    }

    return (right.percentage || 0) - (left.percentage || 0);
  });
}

export function buildUsageAlerts({
  subscription,
  billingPlan,
  supportUsage,
  effectiveMinutesLimit,
  country = null
}) {
  if (!subscription) return [];

  const alerts = [];
  const normalizedCountry = country || subscription.business?.country || 'TR';
  const normalizedPlan = String(subscription.plan || '').toUpperCase();

  const voiceLimit = Math.max(toNumber(effectiveMinutesLimit, 0), 0);
  const voiceUsed = Math.max(toNumber(subscription.includedMinutesUsed, 0), 0);
  const voiceOverage = Math.max(toNumber(subscription.overageMinutes, 0), 0);
  const voiceOverageLimit = Math.max(toNumber(subscription.overageLimit, 0), 0);

  if (voiceLimit > 0) {
    const percentage = roundPercentage((voiceUsed / voiceLimit) * 100);

    if (voiceUsed >= voiceLimit) {
      pushAlert(alerts, {
        code: 'VOICE_INCLUDED_EXHAUSTED',
        severity: 'warning',
        scope: 'voice',
        used: voiceUsed,
        limit: voiceLimit,
        percentage
      });
    } else if (percentage >= WARNING_THRESHOLD_PERCENT) {
      pushAlert(alerts, {
        code: 'VOICE_INCLUDED_80',
        severity: 'warning',
        scope: 'voice',
        used: voiceUsed,
        limit: voiceLimit,
        percentage
      });
    }
  }

  if (voiceOverageLimit > 0 && (Boolean(subscription.overageLimitReached) || voiceOverage >= voiceOverageLimit)) {
    pushAlert(alerts, {
      code: 'VOICE_OVERAGE_LIMIT_REACHED',
      severity: 'critical',
      scope: 'voice',
      used: voiceOverage,
      limit: voiceOverageLimit,
      percentage: roundPercentage((voiceOverage / voiceOverageLimit) * 100)
    });
  }

  if (normalizedPlan === 'PAYG') {
    const pricePerMinute = Number(
      billingPlan?.voiceMinuteUnitPrice
      || getPricePerMinute('PAYG', normalizedCountry)
      || 0
    );
    const remainingMinutes = pricePerMinute > 0
      ? Number(subscription.balance || 0) / pricePerMinute
      : 0;

    if (remainingMinutes < LOW_BALANCE_MINUTES_THRESHOLD) {
      pushAlert(alerts, {
        code: 'PAYG_LOW_BALANCE',
        severity: 'warning',
        scope: 'wallet',
        remainingMinutes,
        threshold: LOW_BALANCE_MINUTES_THRESHOLD
      });
    }
  }

  const writtenLimit = Math.max(toNumber(supportUsage?.total, 0), 0);
  const writtenUsed = Math.max(toNumber(supportUsage?.used, 0), 0);
  const writtenOverage = Math.max(toNumber(supportUsage?.overage, 0), 0);
  const writtenOverageAllowed = Boolean(billingPlan?.overageAllowed?.written);

  if (writtenLimit > 0) {
    const percentage = roundPercentage((writtenUsed / writtenLimit) * 100);

    if (!writtenOverageAllowed && writtenUsed >= writtenLimit) {
      pushAlert(alerts, {
        code: 'WRITTEN_LIMIT_REACHED',
        severity: 'critical',
        scope: 'written',
        used: writtenUsed,
        limit: writtenLimit,
        percentage
      });
    } else if (writtenUsed >= writtenLimit) {
      pushAlert(alerts, {
        code: writtenOverage > 0 ? 'WRITTEN_OVERAGE_ACTIVE' : 'WRITTEN_INCLUDED_EXHAUSTED',
        severity: writtenOverage > 0 ? 'warning' : 'info',
        scope: 'written',
        used: writtenUsed,
        limit: writtenLimit,
        overage: writtenOverage,
        percentage
      });
    } else if (percentage >= WARNING_THRESHOLD_PERCENT) {
      pushAlert(alerts, {
        code: 'WRITTEN_INCLUDED_80',
        severity: 'warning',
        scope: 'written',
        used: writtenUsed,
        limit: writtenLimit,
        percentage
      });
    }
  }

  return sortAlerts(alerts);
}

export default {
  buildUsageAlerts
};
