import { describe, it, expect } from 'vitest';
import { applyGuardrails } from '../../src/core/orchestrator/steps/07_guardrails.js';

describe('Non-security guardrail clarification contracts', () => {
  const baseParams = {
    hadToolSuccess: false,
    toolsCalled: [],
    toolOutputs: [],
    chat: null,
    language: 'TR',
    sessionId: 'non-security-hardblock-test',
    channel: 'CHAT',
    metrics: {},
    userMessage: '',
    verificationState: 'none',
    verifiedIdentity: null,
    intent: null,
    collectedData: {}
  };

  it('missing stock lookup should become deterministic need-more-info', async () => {
    const result = await applyGuardrails({
      ...baseParams,
      userMessage: 'Stok var mı?',
      responseText: 'Bu ürün stokta var.'
    });

    expect(result.action).toBe('NEED_MIN_INFO_FOR_TOOL');
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBe('TOOL_REQUIRED_NOT_CALLED');
    expect(result.finalResponse).toContain('?');
  });

  it('unverified protected order output should require verification clarification', async () => {
    const result = await applyGuardrails({
      ...baseParams,
      hadToolSuccess: true,
      toolsCalled: ['check_order_status'],
      toolOutputs: [
        {
          name: 'check_order_status',
          success: true,
          outcome: 'OK',
          output: {
            order: { status: 'hazırlanıyor' }
          }
        }
      ],
      userMessage: 'Siparişim nerede?',
      responseText: 'Siparişiniz teslim edildi.'
    });

    expect(result.action).toBe('NEED_MIN_INFO_FOR_TOOL');
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBe('VERIFICATION_REQUIRED');
    expect(result.finalResponse).toContain('?');
  });
});
