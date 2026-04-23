import { describe, expect, it } from '@jest/globals';
import { getEffectivePlanConfig } from '../../src/services/planConfig.js';

describe('getEffectivePlanConfig manual overrides', () => {
  it('prefers stored subscription limits over plan defaults for direct admin edits', () => {
    const config = getEffectivePlanConfig({
      plan: 'PRO',
      minutesLimit: 740,
      concurrentLimit: 4,
      assistantsLimit: 12,
      enterpriseSupportInteractions: 3100,
      business: { country: 'TR' }
    });

    expect(config.includedMinutes).toBe(740);
    expect(config.concurrentLimit).toBe(4);
    expect(config.assistantsLimit).toBe(12);
    expect(config.features.phone).toBe(true);
  });
});
