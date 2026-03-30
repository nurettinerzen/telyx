import { describe, expect, it } from '@jest/globals';
import { calculateChargeWithBalance } from '../../src/services/chargeCalculator.js';

describe('calculateChargeWithBalance consumption order', () => {
  it('uses voice add-on minutes before wallet on PAYG', async () => {
    const charge = await calculateChargeWithBalance({
      plan: 'PAYG',
      balance: 500,
      voiceAddOnMinutesBalance: 3
    }, 5, 'TR');

    expect(charge.chargeType).toBe('ADDON_BALANCE');
    expect(charge.breakdown.fromAddOn).toBe(3);
    expect(charge.breakdown.fromBalance).toBe(2);
    expect(charge.totalCharge).toBeGreaterThan(0);
  });

  it('uses included minutes before voice add-on and only then tracks overage on recurring plans', async () => {
    const charge = await calculateChargeWithBalance({
      plan: 'PRO',
      includedMinutesUsed: 498,
      voiceAddOnMinutesBalance: 4
    }, 10, 'TR');

    expect(charge.chargeType).toBe('INCLUDED_ADDON_OVERAGE');
    expect(charge.breakdown.fromIncluded).toBe(2);
    expect(charge.breakdown.fromAddOn).toBe(4);
    expect(charge.breakdown.overageMinutes).toBe(4);
    expect(charge.breakdown.fromBalance).toBe(0);
  });

  it('blocks PAYG calls when add-on and wallet are both insufficient', async () => {
    await expect(
      calculateChargeWithBalance({
        plan: 'PAYG',
        balance: 10,
        voiceAddOnMinutesBalance: 0
      }, 1, 'TR')
    ).rejects.toThrow('INSUFFICIENT_BALANCE');
  });
});
