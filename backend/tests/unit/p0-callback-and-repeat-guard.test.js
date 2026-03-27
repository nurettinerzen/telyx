import { describe, it, expect } from '@jest/globals';
import { makeRoutingDecision } from '../../src/core/orchestrator/steps/04_routerDecision.js';
import createCallbackHandler from '../../src/tools/handlers/create-callback.js';
import { shouldBlockRepeatedToolCall } from '../../src/core/orchestrator/steps/06_toolLoop.js';
import { applyLeakFilter } from '../../src/guardrails/securityGateway.js';
import { applyGuardrails } from '../../src/core/orchestrator/steps/07_guardrails.js';
import { ToolOutcome } from '../../src/tools/toolResult.js';
import crypto from 'crypto';

function hashArgs(args) {
  const sorted = Object.keys(args).sort().reduce((acc, key) => {
    const value = args[key];
    acc[key] = typeof value === 'string' ? value.trim().toLowerCase() : value;
    return acc;
  }, {});
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex').substring(0, 16);
}

describe('P0 Callback deterministic flow', () => {
  it('A1: callback intent should activate callback flow with only name/phone missing fields', async () => {
    const state = {};

    const result = await makeRoutingDecision({
      classification: { type: 'NEW_INTENT', confidence: 0.9, triggerRule: null, suggestedFlow: 'CALLBACK_REQUEST' },
      state,
      userMessage: 'yetkili biriyle görüşmek istiyorum',
      conversationHistory: [],
      language: 'TR',
      business: { id: 1, language: 'TR' },
      sessionId: 'test-a1',
      channel: 'CHAT',
      hasKBMatch: false
    });

    expect(result.directResponse).toBe(false);
    expect(result.callbackRequest).toBe(true);
    expect(result.metadata?.missingFields).toEqual(['customer_name', 'phone']);
    expect(state.callbackFlow?.pending).toBe(true);
    expect(state.activeFlow).toBe('CALLBACK_REQUEST');
  });

  it('A2: create_callback should reject missing/placeholder identity data deterministically', async () => {
    const business = { id: 1, language: 'TR' };

    const nameOnly = await createCallbackHandler.execute(
      { customerName: 'Ahmet Yılmaz' },
      business,
      {}
    );
    expect(nameOnly.outcome).toBe(ToolOutcome.VALIDATION_ERROR);
    expect(nameOnly.askFor).toContain('phone');

    const phoneOnly = await createCallbackHandler.execute(
      { customerPhone: '905551112233' },
      business,
      {}
    );
    expect(phoneOnly.outcome).toBe(ToolOutcome.VALIDATION_ERROR);
    expect(phoneOnly.askFor).toContain('customer_name');

    const placeholderName = await createCallbackHandler.execute(
      { customerName: 'customer', customerPhone: '905551112233' },
      business,
      {}
    );
    expect(placeholderName.outcome).toBe(ToolOutcome.VALIDATION_ERROR);
    expect(placeholderName.askFor).toContain('customer_name');
  });

  it('A2: callback pending flow should track only the missing slot (name vs phone)', async () => {
    const stateNeedsPhone = {
      callbackFlow: { pending: true }
    };

    const phonePrompt = await makeRoutingDecision({
      classification: { type: 'NEW_INTENT', confidence: 0.9, triggerRule: null, suggestedFlow: null },
      state: stateNeedsPhone,
      userMessage: 'Ahmet Yılmaz',
      conversationHistory: [],
      language: 'TR',
      business: { id: 1, language: 'TR' },
      sessionId: 'test-a2-phone',
      channel: 'CHAT',
      hasKBMatch: false
    });
    expect(phonePrompt.directResponse).toBe(false);
    expect(phonePrompt.callbackRequest).toBe(true);
    expect(phonePrompt.metadata?.missingFields).toEqual(['phone']);
    expect(stateNeedsPhone.callbackFlow?.customerName).toBe('Ahmet Yılmaz');

    const stateNeedsName = {
      callbackFlow: { pending: true }
    };

    const namePrompt = await makeRoutingDecision({
      classification: { type: 'NEW_INTENT', confidence: 0.9, triggerRule: null, suggestedFlow: null },
      state: stateNeedsName,
      userMessage: '0555 111 22 33',
      conversationHistory: [],
      language: 'TR',
      business: { id: 1, language: 'TR' },
      sessionId: 'test-a2-name',
      channel: 'CHAT',
      hasKBMatch: false
    });
    expect(namePrompt.directResponse).toBe(false);
    expect(namePrompt.callbackRequest).toBe(true);
    expect(namePrompt.metadata?.missingFields).toEqual(['customer_name']);
    expect(stateNeedsName.callbackFlow?.customerPhone).toBe('05551112233');
  });

  it('2.3: callback context should not trigger leak-filter verification prompts on generic text', () => {
    const leakResult = applyLeakFilter(
      'Takip numaranız TR123456789TR olarak görünüyor.',
      'none',
      'TR',
      {},
      { callbackPending: true, activeFlow: 'CALLBACK_REQUEST' }
    );

    expect(leakResult.safe).toBe(true);
    expect(leakResult.action).toBe('PASS');
    expect(leakResult.needsVerification).not.toBe(true);
  });

  it('2.4: successful create_callback output should not be reclassified as order verification', async () => {
    const result = await applyGuardrails({
      responseText: 'Geri arama kaydı oluşturuldu. Ahmet Yılmaz en kısa sürede aranacak.',
      hadToolSuccess: true,
      toolsCalled: ['create_callback'],
      toolOutputs: [{
        name: 'create_callback',
        success: true,
        outcome: ToolOutcome.OK,
        output: {
          data: {
            callbackId: 'cb_123',
            status: 'PENDING'
          }
        }
      }],
      chat: { businessId: 1 },
      language: 'TR',
      sessionId: 'callback-tool-output-test',
      channel: 'CHAT',
      metrics: {},
      userMessage: 'evet olur',
      verificationState: 'none',
      verifiedIdentity: null,
      intent: 'callback_request',
      collectedData: {},
      callbackPending: true,
      activeFlow: 'CALLBACK_REQUEST'
    });

    expect(result.action).toBe('PASS');
    expect(result.blockReason).toBeUndefined();
    expect(result.finalResponse.toLowerCase()).toContain('geri arama kaydı oluşturuldu');
  });
});

describe('P0 Loop breaker helper', () => {
  it('B2: same tool + same args after NEED_MORE_INFO should be blocked and ask only missing field', () => {
    const argsHash = hashArgs({ query_type: 'siparis', order_number: 'ORD-9837459' });

    const state = {
      extractedSlots: { order_number: 'ORD-9837459' },
      _previousExtractedSlots: { order_number: 'ORD-9837459' },
      lastToolAttempt: {
        tool: 'customer_data_lookup',
        argsHash,
        outcome: ToolOutcome.NEED_MORE_INFO,
        askFor: ['phone_last4'],
        count: 1,
        at: new Date().toISOString()
      }
    };

    const guard = shouldBlockRepeatedToolCall({
      state,
      toolName: 'customer_data_lookup',
      argsHash,
      language: 'TR'
    });

    expect(guard.blocked).toBe(true);
    expect(guard.outcome).toBe(ToolOutcome.NEED_MORE_INFO);
    expect(guard.message.toLowerCase()).toContain('son 4');
  });
});
