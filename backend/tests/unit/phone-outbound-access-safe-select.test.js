import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const prismaMock = {
  subscription: {
    findUnique: jest.fn()
  }
};

jest.unstable_mockModule('../../src/prismaClient.js', () => ({
  default: prismaMock
}));

jest.unstable_mockModule('../../src/services/phoneInboundGate.js', () => ({
  isPhoneInboundEnabledForBusinessRecord: jest.fn((business) => Boolean(business?.phoneInboundEnabled)),
  isPhoneInboundForceDisabled: jest.fn(() => false)
}));

describe('Phone outbound access safe select', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 45,
      businessId: 21,
      plan: 'ENTERPRISE',
      status: 'ACTIVE',
      business: {
        phoneInboundEnabled: true
      }
    });
  });

  it('checks outbound access without selecting billing v2-only subscription columns', async () => {
    const { resolvePhoneOutboundAccessForBusinessId } = await import('../../src/services/phoneOutboundAccess.js');

    const access = await resolvePhoneOutboundAccessForBusinessId(21);

    expect(access.hasAccess).toBe(true);
    const query = prismaMock.subscription.findUnique.mock.calls[0][0];
    expect(query.select.plan).toBe(true);
    expect(query.select.status).toBe(true);
    expect(query.select.voiceAddOnMinutesBalance).toBeUndefined();
    expect(query.select.writtenInteractionAddOnBalance).toBeUndefined();
    expect(query.select.business.select.phoneInboundEnabled).toBe(true);
  });
});
