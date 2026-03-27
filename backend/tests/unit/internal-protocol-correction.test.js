import { applyGuardrails } from '../../src/core/orchestrator/steps/07_guardrails.js';

describe('INTERNAL_PROTOCOL_LEAK correction flow', () => {
  it('returns deterministic correction block for internal protocol leaks', async () => {
    const result = await applyGuardrails({
      responseText: 'Ben bir yapay zeka asistanıyım, bu bilgiye erişemiyorum.',
      hadToolSuccess: false,
      toolsCalled: [],
      toolOutputs: [],
      chat: null,
      language: 'TR',
      sessionId: 'test-session',
      channel: 'CHAT',
      metrics: {},
      userMessage: 'Neden yapamıyorsun?',
      verificationState: 'none',
      verifiedIdentity: null,
      intent: null,
      collectedData: {}
    });

    expect(result.action).toBe('BLOCK');
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBe('INTERNAL_PROTOCOL_LEAK');
    expect(result.needsCorrection).toBe(true);
    expect(typeof result.finalResponse).toBe('string');
    expect(result.finalResponse.length).toBeGreaterThan(0);
  });
});
