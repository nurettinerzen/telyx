import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const findUniqueMock = jest.fn();
const upsertMock = jest.fn();
const deleteMock = jest.fn();
const deleteManyMock = jest.fn();
const countMock = jest.fn();
const findFirstMock = jest.fn();

jest.useFakeTimers();

jest.unstable_mockModule('../../src/config/database.js', () => ({
  default: {
    toolExecution: {
      findUnique: findUniqueMock,
      upsert: upsertMock,
      delete: deleteMock,
      deleteMany: deleteManyMock,
      count: countMock,
      findFirst: findFirstMock
    }
  }
}));

let getToolExecutionResult;
let setToolExecutionResult;

beforeAll(async () => {
  ({ getToolExecutionResult, setToolExecutionResult } = await import('../../src/services/tool-idempotency-db.js'));
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  jest.clearAllMocks();
  findUniqueMock.mockResolvedValue(null);
  upsertMock.mockResolvedValue({});
  deleteMock.mockResolvedValue({});
  deleteManyMock.mockResolvedValue({ count: 0 });
  countMock.mockResolvedValue(0);
  findFirstMock.mockResolvedValue(null);
});

const CACHE_KEY = {
  businessId: 42,
  channel: 'EMAIL',
  messageId: 'msg-123',
  toolName: 'check_stock_crm'
};

describe('tool-idempotency-db', () => {
  it('stores the full tool result contract inside the JSON cache payload', async () => {
    await setToolExecutionResult(CACHE_KEY, {
      success: true,
      outcome: 'OK',
      message: '3 urun stokta mevcut',
      data: {
        items: [{ sku: '11UG-478XTR', in_stock: true }]
      },
      stateEvents: [{ type: 'stock_checked' }],
      _identityContext: { askFor: 'phone_last4' }
    });

    const upsertArg = upsertMock.mock.calls[0][0];
    const packedUpdate = upsertArg.update.data;
    const packedCreate = upsertArg.create.data;

    expect(packedUpdate.__toolResultCache).toBe(1);
    expect(packedCreate.__toolResultCache).toBe(1);
    expect(packedUpdate.result).toMatchObject({
      success: true,
      outcome: 'OK',
      message: '3 urun stokta mevcut',
      data: {
        items: [{ sku: '11UG-478XTR', in_stock: true }]
      },
      stateEvents: [{ type: 'stock_checked' }],
      _identityContext: { askFor: 'phone_last4' }
    });
  });

  it('restores packed cache rows with outcome and message intact', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'cache-1',
      success: true,
      error: null,
      expiresAt: new Date(Date.now() + 60_000),
      data: {
        __toolResultCache: 1,
        result: {
          success: true,
          outcome: 'OK',
          message: 'Stok bilgisi bulundu',
          data: {
            items: [{ sku: 'AKAK0VEN0036', in_stock: true }]
          },
          stateEvents: [{ type: 'stock_checked' }]
        }
      }
    });

    const cached = await getToolExecutionResult(CACHE_KEY);

    expect(cached).toEqual({
      success: true,
      outcome: 'OK',
      message: 'Stok bilgisi bulundu',
      data: {
        items: [{ sku: 'AKAK0VEN0036', in_stock: true }]
      },
      error: null,
      stateEvents: [{ type: 'stock_checked' }]
    });
  });

  it('keeps legacy cache rows readable for backward compatibility', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'cache-legacy',
      success: true,
      error: null,
      expiresAt: new Date(Date.now() + 60_000),
      data: {
        items: [{ sku: 'VX00UGR04', in_stock: true }]
      }
    });

    const cached = await getToolExecutionResult(CACHE_KEY);

    expect(cached).toEqual({
      success: true,
      data: {
        items: [{ sku: 'VX00UGR04', in_stock: true }]
      },
      error: null
    });
  });
});
