import { describe, expect, it } from '@jest/globals';

const {
  WHATSAPP_FEEDBACK_BUTTON_IDS,
  WHATSAPP_FEEDBACK_REASON_IDS,
  getNormalizedWhatsAppFeedbackState,
  getWhatsAppNegativeFeedbackReasonPrompt,
  getWhatsAppFeedbackPrompt,
  getWhatsAppFeedbackThankYouMessage,
  isClosingWhatsAppFeedbackMessage,
  isMeaningfulWhatsAppFeedbackMessage,
  markWhatsAppFeedbackPromptSent,
  markWhatsAppFeedbackReasonPromptSent,
  markWhatsAppFeedbackSubmitted,
  parseWhatsAppFeedbackReasonSelection,
  parseWhatsAppFeedbackSelection,
  registerAssistantReplyForWhatsAppFeedback,
  registerUserMessageForWhatsAppFeedback,
  shouldPromptWhatsAppFeedback,
} = await import('../../src/services/whatsappFeedback.js');

describe('whatsappFeedback service', () => {
  it('increments assistant turn count and stores trace id', () => {
    const withMeaningfulUser = registerUserMessageForWhatsAppFeedback({}, 'Siparişim nerede?');
    const next = registerAssistantReplyForWhatsAppFeedback(withMeaningfulUser, { traceId: 'trace_123' });

    expect(getNormalizedWhatsAppFeedbackState(next)).toMatchObject({
      assistantTurns: 1,
      meaningfulUserTurns: 1,
      responseTraceId: 'trace_123',
      promptSentAt: null,
      submittedAt: null,
    });
  });

  it('prompts after the first meaningful tool-backed result and once more on closing if unanswered', () => {
    const base = registerUserMessageForWhatsAppFeedback({}, 'Siparişim nerede?');
    const oneTurn = registerAssistantReplyForWhatsAppFeedback(base, { traceId: 'trace_1' });
    expect(shouldPromptWhatsAppFeedback({ state: oneTurn, trigger: 'meaningful_result' })).toBe(true);

    const prompted = markWhatsAppFeedbackPromptSent(oneTurn, {
      traceId: 'trace_1',
      promptMessageId: 'feedback-prompt:sess_1:1',
      trigger: 'meaningful_result',
      now: '2026-04-05T12:00:00.000Z',
    });
    expect(shouldPromptWhatsAppFeedback({ state: prompted, trigger: 'meaningful_result' })).toBe(false);
    expect(shouldPromptWhatsAppFeedback({ state: prompted, trigger: 'closing' })).toBe(true);

    const promptedTwice = markWhatsAppFeedbackPromptSent(prompted, {
      traceId: 'trace_2',
      promptMessageId: 'feedback-prompt:sess_1:2',
      trigger: 'closing',
      now: '2026-04-05T12:01:00.000Z',
    });
    expect(shouldPromptWhatsAppFeedback({ state: promptedTwice, trigger: 'closing' })).toBe(false);
  });

  it('does not prompt while a live handoff or callback flow is active', () => {
    const base = registerAssistantReplyForWhatsAppFeedback(
      registerAssistantReplyForWhatsAppFeedback(
        registerAssistantReplyForWhatsAppFeedback(
          registerUserMessageForWhatsAppFeedback({}, 'Ürünümü iade etmek istiyorum'),
          { traceId: 'trace_1' }
        ),
        { traceId: 'trace_2' }
      ),
      { traceId: 'trace_2' }
    );

    expect(shouldPromptWhatsAppFeedback({ state: base, handoffMode: 'ACTIVE' })).toBe(false);
    expect(shouldPromptWhatsAppFeedback({ state: base, supportRoutingPending: true })).toBe(false);
    expect(shouldPromptWhatsAppFeedback({ state: base, callbackPending: true })).toBe(false);
  });

  it('parses positive and negative interactive button selections', () => {
    expect(parseWhatsAppFeedbackSelection({
      id: WHATSAPP_FEEDBACK_BUTTON_IDS.POSITIVE,
      title: 'Helpful',
    })).toMatchObject({ sentiment: 'positive' });

    expect(parseWhatsAppFeedbackSelection({
      id: WHATSAPP_FEEDBACK_BUTTON_IDS.NEGATIVE,
      title: 'Not helpful',
    })).toMatchObject({ sentiment: 'negative' });

    expect(parseWhatsAppFeedbackSelection({
      id: 'something_else',
      title: 'Ignore me',
    })).toBeNull();
  });

  it('parses negative reasons and returns localized prompt/thank-you copy', () => {
    const prompted = markWhatsAppFeedbackPromptSent(registerUserMessageForWhatsAppFeedback({}, 'Kargom nerede?'), {
      traceId: 'trace_9',
      promptMessageId: 'feedback-prompt:sess_2:3',
      now: '2026-04-05T12:00:00.000Z',
    });
    const promptedReason = markWhatsAppFeedbackReasonPromptSent(prompted, {
      reasonPromptMessageId: 'feedback-reason:sess_2:3',
      now: '2026-04-05T12:00:30.000Z',
    });
    const submitted = markWhatsAppFeedbackSubmitted(promptedReason, {
      sentiment: 'negative',
      reason: 'WRONG_ANSWER',
      messageId: 'wamid.feedback',
      now: '2026-04-05T12:01:00.000Z',
    });

    expect(getNormalizedWhatsAppFeedbackState(submitted)).toMatchObject({
      submittedAt: '2026-04-05T12:01:00.000Z',
      submittedMessageId: 'wamid.feedback',
      sentiment: 'negative',
      reason: 'WRONG_ANSWER',
    });

    expect(getWhatsAppFeedbackPrompt('TR').buttons).toHaveLength(2);
    expect(getWhatsAppNegativeFeedbackReasonPrompt('TR').sections[0].rows).toHaveLength(6);
    expect(getWhatsAppFeedbackThankYouMessage('EN', 'positive')).toContain('Thanks');
    expect(getWhatsAppFeedbackThankYouMessage('TR', 'negative')).toContain('teşekkür');
    expect(parseWhatsAppFeedbackReasonSelection({
      id: WHATSAPP_FEEDBACK_REASON_IDS.WRONG_ANSWER,
      title: 'Yanlış bilgi verdi',
    })).toMatchObject({ reason: 'WRONG_ANSWER' });
  });

  it('does not treat light chatter as meaningful context', () => {
    expect(isMeaningfulWhatsAppFeedbackMessage('selam')).toBe(false);
    expect(isMeaningfulWhatsAppFeedbackMessage('nasılsın')).toBe(false);
    expect(isMeaningfulWhatsAppFeedbackMessage('siparişim nerede')).toBe(true);
  });

  it('detects natural closing messages for final feedback reminder', () => {
    expect(isClosingWhatsAppFeedbackMessage('tamam teşekkürler')).toBe(true);
    expect(isClosingWhatsAppFeedbackMessage('iyi günler')).toBe(true);
    expect(isClosingWhatsAppFeedbackMessage('siparişim nerede')).toBe(false);
  });
});
