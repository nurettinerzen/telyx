import { describe, it, expect } from '@jest/globals';
import { applyGuardrails } from '../../src/core/orchestrator/steps/07_guardrails.js';

describe('P0 guardrails callback workflow bypass', () => {
  const baseParams = {
    hadToolSuccess: false,
    toolsCalled: [],
    toolOutputs: [],
    chat: null,
    language: 'TR',
    sessionId: 'callback-workflow-bypass-test',
    channel: 'CHAT',
    metrics: {},
    userMessage: 'yoneticinizle gorusmek istiyorum',
    verificationState: 'none',
    verifiedIdentity: null,
    intent: 'callback_request',
    collectedData: {},
    callbackPending: true,
    activeFlow: 'CALLBACK_REQUEST'
  };

  it('does not block callback data-collection prompt when no tool has been called yet', async () => {
    const result = await applyGuardrails({
      ...baseParams,
      responseText: 'Yoneticimizle gorusme talebinizi iletebilirim. Geri arama kaydi icin ad-soyad ve telefon numaranizi paylasir misiniz?'
    });

    expect(result.blocked).not.toBe(true);
    expect(result.blockReason).not.toBe('TOOL_ONLY_DATA_LEAK_DETECTED');
    expect(result.finalResponse.toLowerCase()).toContain('geri arama');
  });
});
