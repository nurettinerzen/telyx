import { describe, expect, it } from '@jest/globals';
import {
  getAddOnCatalog,
  getBillingPlanDefinition,
  isWrittenChannelEnabled
} from '../../src/config/billingCatalog.js';

describe('billingCatalog written/support configuration', () => {
  it('disables phone and enables written-only channels for starter', () => {
    const starter = getBillingPlanDefinition({ plan: 'STARTER', business: { country: 'TR' } });

    expect(starter.billingModel).toBe('recurring');
    expect(starter.includedWrittenInteractions).toBeGreaterThan(0);
    expect(starter.channels).toEqual({
      webchat: true,
      whatsapp: true,
      email: true,
      phone: false
    });
    expect(starter.concurrentCallLimit).toBe(0);
    expect(starter.allowAddOns).toEqual({
      written: true,
      voice: false
    });
  });

  it('keeps pro phone-enabled with concurrency 2', () => {
    const pro = getBillingPlanDefinition({ plan: 'PRO', business: { country: 'TR' } });

    expect(pro.channels.phone).toBe(true);
    expect(pro.concurrentCallLimit).toBe(2);
    expect(pro.allowAddOns).toEqual({
      written: true,
      voice: true
    });
  });

  it('applies enterprise written/concurrency overrides from the subscription record', () => {
    const enterprise = getBillingPlanDefinition({
      plan: 'ENTERPRISE',
      enterpriseSupportInteractions: 4200,
      enterpriseMinutes: 900,
      enterpriseConcurrent: 7,
      enterpriseAssistants: 18,
      business: { country: 'TR' }
    });

    expect(enterprise.includedWrittenInteractions).toBe(4200);
    expect(enterprise.includedVoiceMinutes).toBe(900);
    expect(enterprise.concurrentCallLimit).toBe(7);
    expect(enterprise.assistantLimit).toBe(18);
  });

  it('returns the correct written add-on catalog for supported plans', () => {
    const catalog = getAddOnCatalog('TR', { plan: 'STARTER', business: { country: 'TR' } });

    expect(catalog.written.map((pkg) => pkg.id)).toEqual(['written_500', 'written_2000']);
    expect(catalog.voice).toEqual([]);
  });

  it('maps written channel checks to chat, WhatsApp, and email only', () => {
    const starter = { plan: 'STARTER', business: { country: 'TR' } };

    expect(isWrittenChannelEnabled(starter, 'CHAT')).toBe(true);
    expect(isWrittenChannelEnabled(starter, 'WHATSAPP')).toBe(true);
    expect(isWrittenChannelEnabled(starter, 'EMAIL')).toBe(true);
    expect(isWrittenChannelEnabled(starter, 'PHONE')).toBe(false);
  });
});
