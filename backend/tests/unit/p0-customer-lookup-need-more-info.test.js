import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ToolOutcome } from '../../src/tools/toolResult.js';

const prismaMock = {
  crmOrder: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn()
  },
  crmTicket: {
    findFirst: jest.fn(),
    findUnique: jest.fn()
  },
  customerData: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn()
  }
};

jest.unstable_mockModule('../../src/prismaClient.js', () => ({
  default: prismaMock
}));

let executeLookup;

beforeAll(async () => {
  const module = await import('../../src/tools/handlers/customer-data-lookup.js');
  executeLookup = module.execute;
});

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.crmOrder.findMany.mockResolvedValue([]);
  prismaMock.crmOrder.findFirst.mockResolvedValue(null);
  prismaMock.crmTicket.findFirst.mockResolvedValue(null);
  prismaMock.customerData.findMany.mockResolvedValue([]);
  prismaMock.customerData.findFirst.mockResolvedValue(null);
  prismaMock.crmOrder.findUnique.mockResolvedValue(null);
  prismaMock.crmTicket.findUnique.mockResolvedValue(null);
  prismaMock.customerData.findUnique.mockResolvedValue(null);
});

describe('P0 customer_data_lookup deterministic outcomes', () => {
  const business = { id: 1, language: 'TR' };

  it('B0: debt query without identifier should return NEED_MORE_INFO (not NOT_FOUND)', async () => {
    const result = await executeLookup(
      {
        query_type: 'muhasebe'
      },
      business,
      {
        state: { verification: { status: 'none' } },
        sessionId: 'test-b0'
      }
    );

    expect(result.outcome).toBe(ToolOutcome.NEED_MORE_INFO);
    expect(result.field).toBe('vkn_or_tc_or_phone');
    expect(result.message.toLowerCase()).toContain('vkn');
    expect(prismaMock.crmOrder.findMany).not.toHaveBeenCalled();
    expect(prismaMock.customerData.findFirst).not.toHaveBeenCalled();
  });

  it('B1: existing order without last4 should request verification (phone_last4)', async () => {
    prismaMock.crmOrder.findMany.mockResolvedValueOnce([{
      id: 'crm-order-1',
      businessId: 1,
      orderNumber: 'ORD-9837459',
      customerName: 'Ahmet Yılmaz',
      customerPhone: '+905551234567',
      customerEmail: 'ahmet@example.com',
      status: 'Hazırlanıyor'
    }]);

    const result = await executeLookup(
      {
        query_type: 'siparis',
        order_number: 'ORD-9837459'
      },
      business,
      {
        state: { verification: { status: 'none' } },
        sessionId: 'test-b1'
      }
    );

    expect(result.outcome).toBe(ToolOutcome.VERIFICATION_REQUIRED);
    expect(result.data?.askFor).toBe('phone_last4');
    expect(result.message.toLowerCase()).toContain('son 4');
    expect(prismaMock.crmOrder.findMany).toHaveBeenCalled();
  });

  it('B3: order + last4 provided but record missing should return NOT_FOUND (not NEED_MORE_INFO)', async () => {
    const result = await executeLookup(
      {
        query_type: 'siparis',
        order_number: 'ORD-9837459',
        verification_input: '1234'
      },
      business,
      {
        state: { verification: { status: 'none' } },
        sessionId: 'test-b3'
      }
    );

    expect(prismaMock.crmOrder.findMany).toHaveBeenCalled();
    expect(result.outcome).toBe(ToolOutcome.NOT_FOUND);
    expect(result.outcome).not.toBe(ToolOutcome.NEED_MORE_INFO);
  });

  it('B4: numeric order input should fallback to phone lookup before returning NOT_FOUND', async () => {
    prismaMock.crmOrder.findMany.mockResolvedValueOnce([]);
    prismaMock.crmOrder.findFirst.mockResolvedValueOnce({
      id: 'crm-order-phone-1',
      businessId: 1,
      orderNumber: 'ORD-424527',
      customerName: 'Ahmet Yılmaz',
      customerPhone: '4245275089',
      customerEmail: 'ahmet@example.com',
      status: 'Hazırlanıyor'
    });

    prismaMock.customerData.findMany.mockResolvedValue([]);
    prismaMock.customerData.findFirst.mockResolvedValue(null);

    const result = await executeLookup(
      {
        query_type: 'siparis',
        order_number: '4245275089'
      },
      business,
      {
        state: { verification: { status: 'none' } },
        sessionId: 'test-b4'
      }
    );

    expect(result.outcome).not.toBe(ToolOutcome.NOT_FOUND);
    expect(prismaMock.crmOrder.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.crmOrder.findFirst).toHaveBeenCalled();
    expect(prismaMock.crmOrder.findFirst.mock.calls[0][0]?.where?.OR?.[0]).toHaveProperty('customerPhone');
  });

  it('B4.1: pending verification without input should re-request verification, not run lookup', async () => {
    const result = await executeLookup(
      {
        query_type: 'muhasebe'
      },
      business,
      {
        state: {
          verification: {
            status: 'pending',
            anchor: {
              id: 'cust-1',
              name: 'Ahmet Yılmaz',
              phone: '+905551234567',
              anchorType: 'phone',
              anchorValue: '5551234567',
              sourceTable: 'CustomerData'
            }
          }
        },
        sessionId: 'test-b4-1'
      }
    );

    expect(result.outcome).toBe(ToolOutcome.VERIFICATION_REQUIRED);
    expect(result.data?.askFor).toBe('phone_last4');
    expect(prismaMock.crmOrder.findMany).not.toHaveBeenCalled();
    expect(prismaMock.customerData.findFirst).not.toHaveBeenCalled();
  });

  it('B5: verified session with switched anchor should force fresh verification', async () => {
    prismaMock.crmOrder.findMany.mockResolvedValueOnce([{
      id: 'crm-order-verified-1',
      businessId: 1,
      orderNumber: 'ORD-777777',
      customerName: 'Nurettin Erzen',
      customerPhone: '+14245275089',
      customerEmail: 'nurettin@example.com',
      status: 'kargoda',
      trackingNumber: 'TRK123456',
      carrier: 'Yurtici Kargo',
      estimatedDelivery: '2026-02-28'
    }]);
    prismaMock.customerData.findMany.mockResolvedValue([]);

    const result = await executeLookup(
      {
        query_type: 'siparis',
        order_number: 'ORD-777777'
      },
      business,
      {
        sessionId: 'test-b5',
        state: {
          verification: {
            status: 'verified',
            anchor: { id: 'prev-anchor-id' }
          }
        }
      }
    );

    expect(result.outcome).toBe(ToolOutcome.VERIFICATION_REQUIRED);
    expect(result.data?.askFor).toBe('phone_last4');
  });

  it('B6: verified session should bypass re-verification only within same customer scope', async () => {
    prismaMock.crmOrder.findMany.mockResolvedValueOnce([{
      id: 'crm-order-verified-2',
      businessId: 1,
      orderNumber: 'ORD-888888',
      customerName: 'Nurettin Erzen',
      customerPhone: '+14245275089',
      customerEmail: 'nurettin@example.com',
      status: 'kargoda',
      trackingNumber: 'TRK999888',
      carrier: 'Yurtici Kargo',
      estimatedDelivery: '2026-02-28'
    }]);
    prismaMock.customerData.findMany.mockResolvedValueOnce([{ id: 'cust-42' }]);

    const result = await executeLookup(
      {
        query_type: 'siparis',
        order_number: 'ORD-888888'
      },
      business,
      {
        sessionId: 'test-b6',
        state: {
          verification: {
            status: 'verified',
            anchor: { id: 'prev-anchor-id', customerId: 'cust-42' }
          }
        }
      }
    );

    expect(result.outcome).toBe(ToolOutcome.OK);
    expect(result.message.toLowerCase()).toContain('kargoda');
    expect(result.data?.order?.status).toBe('kargoda');
  });

  it('B7: pending phone_last4 verification should reject plain name-only response', async () => {
    const result = await executeLookup(
      {
        query_type: 'siparis',
        customer_name: 'Ahmet Yılmaz'
      },
      business,
      {
        state: {
          verification: {
            status: 'pending',
            pendingField: 'phone_last4',
            anchor: {
              id: 'cust-2',
              customerId: 'cust-2',
              name: 'Ahmet Yılmaz',
              phone: '+905551234567',
              anchorType: 'order',
              anchorValue: 'ORD-111111',
              sourceTable: 'CustomerData'
            }
          }
        },
        sessionId: 'test-b7'
      }
    );

    expect(result.outcome).toBe(ToolOutcome.VERIFICATION_REQUIRED);
    expect(result.data?.askFor).toBe('phone_last4');
    expect(result.message.toLowerCase()).toContain('son 4');
  });

  it('B8: pending verification on CrmTicket should fetch from crmTicket table and pass', async () => {
    prismaMock.crmTicket.findUnique.mockResolvedValueOnce({
      id: 'ticket-1',
      businessId: 1,
      ticketNumber: 'TKT-2024-0008',
      customerName: 'Servis Müşteri 8',
      customerPhone: '+905551112233',
      product: 'Laptop',
      issue: 'Açılmıyor',
      status: 'İnceleniyor'
    });

    const result = await executeLookup(
      {
        query_type: 'servis',
        verification_input: '2233'
      },
      business,
      {
        state: {
          verification: {
            status: 'pending',
            pendingField: 'phone_last4',
            anchor: {
              id: 'ticket-1',
              customerId: 'cust-8',
              name: 'Servis Müşteri 8',
              phone: '+905551112233',
              anchorType: 'ticket',
              anchorValue: 'TKT-2024-0008',
              sourceTable: 'CrmTicket'
            }
          }
        },
        sessionId: 'test-b8'
      }
    );

    expect(result.outcome).toBe(ToolOutcome.OK);
    expect(prismaMock.crmTicket.findUnique).toHaveBeenCalledWith({ where: { id: 'ticket-1' } });
  });

  it('B9: query_type=genel + ticket lookup should still require verification', async () => {
    prismaMock.crmTicket.findFirst.mockResolvedValueOnce({
      id: 'ticket-9',
      businessId: 1,
      ticketNumber: 'TKT-2024-0009',
      customerName: 'Servis Müşteri 9',
      customerPhone: '+905559998877',
      status: 'Beklemede'
    });

    const result = await executeLookup(
      {
        query_type: 'genel',
        ticket_number: 'TKT-2024-0009'
      },
      business,
      {
        state: { verification: { status: 'none' } },
        sessionId: 'test-b9'
      }
    );

    expect(result.outcome).toBe(ToolOutcome.VERIFICATION_REQUIRED);
    expect(result.data?.askFor).toBe('phone_last4');
  });

  it('B10: query_type=genel + order lookup should still require verification', async () => {
    prismaMock.crmOrder.findMany.mockResolvedValueOnce([{
      id: 'crm-order-10',
      businessId: 1,
      orderNumber: 'ORD-2024-0010',
      customerName: 'Ahmet Yılmaz',
      customerPhone: '+905550001010',
      status: 'Hazırlanıyor'
    }]);

    const result = await executeLookup(
      {
        query_type: 'genel',
        order_number: 'ORD-2024-0010'
      },
      business,
      {
        state: { verification: { status: 'none' } },
        sessionId: 'test-b10'
      }
    );

    expect(result.outcome).toBe(ToolOutcome.VERIFICATION_REQUIRED);
    expect(result.data?.askFor).toBe('phone_last4');
  });
});
