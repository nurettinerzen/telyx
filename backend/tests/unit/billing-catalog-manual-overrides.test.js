import { describe, expect, it } from '@jest/globals';
import { getBillingPlanDefinition } from '../../src/config/billingCatalog.js';

describe('billingCatalog manual override fallbacks', () => {
  it('keeps plan defaults when admin override fields are null', () => {
    const pro = getBillingPlanDefinition({
      plan: 'PRO',
      minutesLimit: null,
      concurrentLimit: null,
      assistantsLimit: null,
      enterpriseSupportInteractions: null,
      business: { country: 'TR' }
    });

    expect(pro.includedVoiceMinutes).toBe(500);
    expect(pro.includedWrittenInteractions).toBe(2000);
    expect(pro.concurrentCallLimit).toBe(2);
    expect(pro.assistantLimit).toBe(10);
  });
});
