import { describe, expect, it } from '@jest/globals';
import { buildUsageAlerts } from '../../src/services/usageAlertService.js';

describe('usageAlertService', () => {
  it('returns written threshold alerts once written usage reaches 80 percent', () => {
    const alerts = buildUsageAlerts({
      subscription: {
        plan: 'ENTERPRISE',
        includedMinutesUsed: 0,
        overageMinutes: 0,
        overageLimit: 200,
        balance: 0
      },
      billingPlan: {
        overageAllowed: { written: false },
        voiceMinuteUnitPrice: 23
      },
      supportUsage: {
        total: 10000,
        used: 8000,
        overage: 0
      },
      effectiveMinutesLimit: 0,
      country: 'TR'
    });

    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'WRITTEN_INCLUDED_80',
          scope: 'written',
          severity: 'warning',
          percentage: 80
        })
      ])
    );
  });

  it('returns a critical alert when written limit is exhausted on non-overage plans', () => {
    const alerts = buildUsageAlerts({
      subscription: {
        plan: 'STARTER',
        includedMinutesUsed: 0,
        overageMinutes: 0,
        overageLimit: 200,
        balance: 0
      },
      billingPlan: {
        overageAllowed: { written: false },
        voiceMinuteUnitPrice: 23
      },
      supportUsage: {
        total: 500,
        used: 500,
        overage: 0
      },
      effectiveMinutesLimit: 0,
      country: 'TR'
    });

    expect(alerts[0]).toEqual(
      expect.objectContaining({
        code: 'WRITTEN_LIMIT_REACHED',
        scope: 'written',
        severity: 'critical'
      })
    );
  });

  it('returns low balance alerts for PAYG voice usage', () => {
    const alerts = buildUsageAlerts({
      subscription: {
        plan: 'PAYG',
        balance: 20,
        includedMinutesUsed: 0,
        overageMinutes: 0,
        overageLimit: 200
      },
      billingPlan: {
        voiceMinuteUnitPrice: 23,
        overageAllowed: { written: false }
      },
      supportUsage: {
        total: 0,
        used: 0,
        overage: 0
      },
      effectiveMinutesLimit: 0,
      country: 'TR'
    });

    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PAYG_LOW_BALANCE',
          scope: 'wallet',
          severity: 'warning'
        })
      ])
    );
  });
});
