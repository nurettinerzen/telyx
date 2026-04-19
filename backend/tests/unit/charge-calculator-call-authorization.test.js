import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const prismaMock = {
  subscription: {
    findUnique: jest.fn()
  }
};

jest.unstable_mockModule('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prismaMock)
}));

let canMakeCallWithBalance;

beforeAll(async () => {
  ({ canMakeCallWithBalance } = await import('../../src/services/chargeCalculator.js'));
});

describe('canMakeCallWithBalance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks recurring-plan calls when overage limit is already reached', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      businessId: 11,
      plan: 'PRO',
      status: 'ACTIVE',
      activeCalls: 0,
      includedMinutesUsed: 500,
      voiceAddOnMinutesBalance: 0,
      overageMinutes: 200,
      overageLimit: 200,
      concurrentLimit: 2,
      business: { country: 'TR' }
    });

    const result = await canMakeCallWithBalance(11);

    expect(result).toEqual(
      expect.objectContaining({
        canMakeCall: false,
        reason: 'OVERAGE_LIMIT_REACHED'
      })
    );
  });

  it('allows recurring-plan calls when included minutes are still available', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      businessId: 11,
      plan: 'PRO',
      status: 'ACTIVE',
      activeCalls: 0,
      includedMinutesUsed: 120,
      voiceAddOnMinutesBalance: 0,
      overageMinutes: 0,
      overageLimit: 200,
      concurrentLimit: 2,
      business: { country: 'TR' }
    });

    const result = await canMakeCallWithBalance(11);

    expect(result).toEqual(
      expect.objectContaining({
        canMakeCall: true,
        reason: 'INCLUDED_MINUTES_AVAILABLE'
      })
    );
  });
});
