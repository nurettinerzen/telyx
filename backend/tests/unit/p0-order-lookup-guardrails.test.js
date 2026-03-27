import { describe, expect, it } from 'vitest';
import { ToolOutcome } from '../../src/tools/toolResult.js';
import { applyGuardrails } from '../../src/core/orchestrator/steps/07_guardrails.js';

describe('P0 order lookup guardrail contracts', () => {
  const baseParams = {
    hadToolSuccess: false,
    toolsCalled: [],
    toolOutputs: [],
    chat: null,
    language: 'TR',
    sessionId: 'order-guardrail-test',
    channel: 'CHAT',
    metrics: {},
    userMessage: '',
    verificationState: 'none',
    verifiedIdentity: null,
    intent: null,
    collectedData: {}
  };

  it('enforces single-field clarification when order intent is detected but no tool was called', async () => {
    const result = await applyGuardrails({
      ...baseParams,
      userMessage: 'siparisim nerde kaldi',
      responseText: 'Siparişinizi kontrol etmem için sipariş numarası veya telefon numarası ve isim/soyisim paylaşır mısınız?'
    });

    expect(result.action).toBe('NEED_MIN_INFO_FOR_TOOL');
    expect(result.blockReason).toBe('TOOL_REQUIRED_NOT_CALLED');
    expect(result.finalResponse).toContain('sipariş numaranızı');
    expect(result.finalResponse.toLowerCase()).not.toContain('telefon');
    expect(result.finalResponse.toLowerCase()).not.toContain('isim');
  });

  it('keeps ambiguous NOT_FOUND responses in LLM-first passthrough mode', async () => {
    const result = await applyGuardrails({
      ...baseParams,
      hadToolSuccess: true,
      toolsCalled: ['customer_data_lookup'],
      toolOutputs: [
        {
          name: 'customer_data_lookup',
          success: true,
          outcome: ToolOutcome.NOT_FOUND,
          output: null
        }
      ],
      userMessage: '4245275089',
      responseText: 'Bu bilgilerle eşleşen kayıt bulunamadı.'
    });

    expect(result.action).toBe('PASS');
    expect(result.blockReason).toBeUndefined();
    expect(result.finalResponse).toBe('Bu bilgilerle eşleşen kayıt bulunamadı.');
  });

  it('asks debt identity fields when debt intent is detected but tool was not called', async () => {
    const result = await applyGuardrails({
      ...baseParams,
      intent: 'debt_inquiry',
      userMessage: 'borcum ne kadar',
      responseText: 'Borcunuzu hemen kontrol ediyorum.'
    });

    expect(result.action).toBe('NEED_MIN_INFO_FOR_TOOL');
    expect(result.blockReason).toBe('TOOL_REQUIRED_NOT_CALLED');
    expect(result.finalResponse).toContain('VKN');
    expect(result.finalResponse).toContain('TC');
    expect(result.finalResponse.toLowerCase()).toContain('telefon');
    expect(result.finalResponse.toLowerCase()).not.toContain('sipariş');
  });

  it('keeps debt NOT_FOUND responses in LLM-first passthrough mode', async () => {
    const result = await applyGuardrails({
      ...baseParams,
      hadToolSuccess: true,
      toolsCalled: ['customer_data_lookup'],
      toolOutputs: [
        {
          name: 'customer_data_lookup',
          success: true,
          outcome: ToolOutcome.NOT_FOUND,
          output: null
        }
      ],
      userMessage: 'borcum var mı',
      responseText: 'Bu bilgilerle eşleşen kayıt bulunamadı.'
    });

    expect(result.action).toBe('PASS');
    expect(result.blockReason).toBeUndefined();
    expect(result.finalResponse).toBe('Bu bilgilerle eşleşen kayıt bulunamadı.');
  });

  it('keeps debt NOT_FOUND passthrough even when the user message is a TC number', async () => {
    const result = await applyGuardrails({
      ...baseParams,
      intent: 'debt_inquiry',
      hadToolSuccess: true,
      toolsCalled: ['customer_data_lookup'],
      toolOutputs: [
        {
          name: 'customer_data_lookup',
          success: true,
          outcome: ToolOutcome.NOT_FOUND,
          output: null
        }
      ],
      userMessage: '57106594322',
      responseText: 'Bu bilgilerle eşleşen kayıt bulunamadı.'
    });

    expect(result.action).toBe('PASS');
    expect(result.blockReason).toBeUndefined();
    expect(result.finalResponse).toBe('Bu bilgilerle eşleşen kayıt bulunamadı.');
  });
});
