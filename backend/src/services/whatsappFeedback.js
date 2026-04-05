import { isFeatureEnabled } from '../config/feature-flags.js';

export const WHATSAPP_FEEDBACK_BUTTON_IDS = Object.freeze({
  POSITIVE: 'wa_feedback_positive',
  NEGATIVE: 'wa_feedback_negative',
});

export const WHATSAPP_FEEDBACK_REASON_IDS = Object.freeze({
  WRONG_ANSWER: 'wa_feedback_reason_wrong_answer',
  MISUNDERSTOOD: 'wa_feedback_reason_misunderstood',
  NOT_RESOLVED: 'wa_feedback_reason_not_resolved',
  NOT_SPECIFIC: 'wa_feedback_reason_not_specific',
  BLOCKED_PROGRESS: 'wa_feedback_reason_blocked_progress',
  OTHER: 'wa_feedback_reason_other',
});

const LIGHTWEIGHT_CHATTER_PATTERN = /^(selam|merhaba|nasılsın|naber|iyi misin|teşekkürler|teşekkür ederim|sağ ol|sağ olun|günaydın|iyi akşamlar|görüşürüz|bye|hi|hello|hey|how are you|thanks|thank you|good morning|good evening)[!.?, ]*$/i;
const CLOSING_MESSAGE_PATTERN = /^(tamam(dır)?(\s+(teşekkürler|teşekkür ederim|sağ ol|sağ olun))?|teşekkürler|teşekkür ederim|sağ ol|sağ olun|oldu|çözüldü|başka yok|yok teşekkürler|iyi günler|iyi akşamlar|görüşürüz|hoşçakal|hoscakal|bye|goodbye|thanks|thank you|all good|that'?s all|no thanks)[!.?, ]*$/i;
const MAX_FEEDBACK_PROMPTS = 2;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAssistantTurns(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
}

function normalizeMeaningfulTurns(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
}

function normalizePromptCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
}

export function isMeaningfulWhatsAppFeedbackMessage(message = '') {
  const normalized = String(message || '').trim();
  if (!normalized) return false;
  if (LIGHTWEIGHT_CHATTER_PATTERN.test(normalized)) return false;

  const hasDigits = /\d/.test(normalized);
  const hasQuestion = /[?？]/.test(normalized);
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  return hasDigits || hasQuestion || wordCount >= 2 || normalized.length >= 12;
}

export function isClosingWhatsAppFeedbackMessage(message = '') {
  const normalized = String(message || '').trim();
  if (!normalized) return false;
  return CLOSING_MESSAGE_PATTERN.test(normalized);
}

export function isWhatsAppFeedbackEnabled() {
  return isFeatureEnabled('WHATSAPP_FEEDBACK_V1') || isFeatureEnabled('WHATSAPP_LIVE_HANDOFF_V2');
}

export function getNormalizedWhatsAppFeedbackState(state = {}) {
  const feedback = isPlainObject(state?.whatsappFeedback) ? state.whatsappFeedback : {};

  return {
    assistantTurns: normalizeAssistantTurns(feedback.assistantTurns),
    meaningfulUserTurns: normalizeMeaningfulTurns(feedback.meaningfulUserTurns),
    promptCount: normalizePromptCount(feedback.promptCount),
    promptSentAt: feedback.promptSentAt || null,
    promptMessageId: feedback.promptMessageId || null,
    lastPromptTrigger: feedback.lastPromptTrigger || null,
    reasonPromptSentAt: feedback.reasonPromptSentAt || null,
    reasonPromptMessageId: feedback.reasonPromptMessageId || null,
    responseTraceId: feedback.responseTraceId || null,
    submittedAt: feedback.submittedAt || null,
    submittedMessageId: feedback.submittedMessageId || null,
    sentiment: feedback.sentiment || null,
    reason: feedback.reason || null,
  };
}

export function registerAssistantReplyForWhatsAppFeedback(state = {}, { traceId = null } = {}) {
  const current = getNormalizedWhatsAppFeedbackState(state);

  return {
    ...state,
    whatsappFeedback: {
      ...current,
      assistantTurns: current.assistantTurns + 1,
      responseTraceId: traceId || current.responseTraceId || null,
    },
  };
}

export function registerUserMessageForWhatsAppFeedback(state = {}, message = '') {
  const current = getNormalizedWhatsAppFeedbackState(state);
  const increment = isMeaningfulWhatsAppFeedbackMessage(message) ? 1 : 0;

  return {
    ...state,
    whatsappFeedback: {
      ...current,
      meaningfulUserTurns: current.meaningfulUserTurns + increment,
    },
  };
}

export function shouldPromptWhatsAppFeedback({
  state = {},
  handoffMode = 'AI',
  supportRoutingPending = false,
  callbackPending = false,
  trigger = 'meaningful_result',
}) {
  const feedback = getNormalizedWhatsAppFeedbackState(state);
  if (feedback.submittedAt) return false;
  if (feedback.promptCount >= MAX_FEEDBACK_PROMPTS) return false;
  if (feedback.reasonPromptSentAt && !feedback.submittedAt) return false;
  if (handoffMode !== 'AI') return false;
  if (supportRoutingPending || callbackPending) return false;

  if (trigger === 'meaningful_result') {
    return feedback.promptCount === 0 && feedback.meaningfulUserTurns >= 1;
  }

  if (trigger === 'closing') {
    return feedback.promptCount === 1 && feedback.meaningfulUserTurns >= 1;
  }

  return false;
}

export function markWhatsAppFeedbackPromptSent(
  state = {},
  { traceId = null, promptMessageId = null, trigger = 'meaningful_result', now = new Date().toISOString() } = {}
) {
  const current = getNormalizedWhatsAppFeedbackState(state);

  return {
    ...state,
    whatsappFeedback: {
      ...current,
      promptCount: current.promptCount + 1,
      promptSentAt: now,
      promptMessageId: promptMessageId || current.promptMessageId || null,
      lastPromptTrigger: trigger,
      reasonPromptSentAt: null,
      reasonPromptMessageId: null,
      responseTraceId: traceId || current.responseTraceId || null,
    },
  };
}

export function markWhatsAppFeedbackReasonPromptSent(
  state = {},
  { reasonPromptMessageId = null, now = new Date().toISOString() } = {}
) {
  const current = getNormalizedWhatsAppFeedbackState(state);

  return {
    ...state,
    whatsappFeedback: {
      ...current,
      reasonPromptSentAt: now,
      reasonPromptMessageId: reasonPromptMessageId || current.reasonPromptMessageId || null,
      sentiment: 'negative',
    },
  };
}

export function markWhatsAppFeedbackSubmitted(
  state = {},
  { sentiment = 'positive', reason = null, messageId = null, now = new Date().toISOString() } = {}
) {
  const current = getNormalizedWhatsAppFeedbackState(state);
  const normalizedSentiment = String(sentiment || '').toLowerCase() === 'negative'
    ? 'negative'
    : 'positive';

  return {
    ...state,
    whatsappFeedback: {
      ...current,
      submittedAt: now,
      submittedMessageId: messageId || current.submittedMessageId || null,
      sentiment: normalizedSentiment,
      reason: reason || current.reason || null,
    },
  };
}

export function getWhatsAppFeedbackPrompt(language = 'TR') {
  if (String(language || 'TR').toUpperCase() === 'EN') {
    return {
      bodyText: 'How was this conversation?',
      footerText: 'You can rate this conversation whenever you want.',
      buttons: [
        { id: WHATSAPP_FEEDBACK_BUTTON_IDS.POSITIVE, title: 'Helpful' },
        { id: WHATSAPP_FEEDBACK_BUTTON_IDS.NEGATIVE, title: 'Not helpful' },
      ],
    };
  }

  return {
    bodyText: 'Bu görüşme sizin için nasıldı?',
    footerText: 'Dilerseniz bu görüşmeyi istediğiniz zaman değerlendirebilirsiniz.',
    buttons: [
      { id: WHATSAPP_FEEDBACK_BUTTON_IDS.POSITIVE, title: 'Yardımcı oldu' },
      { id: WHATSAPP_FEEDBACK_BUTTON_IDS.NEGATIVE, title: 'Yardımcı olmadı' },
    ],
  };
}

export function getWhatsAppNegativeFeedbackReasonPrompt(language = 'TR') {
  if (String(language || 'TR').toUpperCase() === 'EN') {
    return {
      bodyText: 'What went wrong?',
      footerText: 'Choose the closest reason.',
      buttonText: 'Select reason',
      sections: [
        {
          title: 'Feedback reasons',
          rows: [
            { id: WHATSAPP_FEEDBACK_REASON_IDS.WRONG_ANSWER, title: 'Incorrect information' },
            { id: WHATSAPP_FEEDBACK_REASON_IDS.MISUNDERSTOOD, title: "Didn't understand me" },
            { id: WHATSAPP_FEEDBACK_REASON_IDS.NOT_RESOLVED, title: "Didn't solve my issue" },
            { id: WHATSAPP_FEEDBACK_REASON_IDS.NOT_SPECIFIC, title: 'Was not clear enough' },
            { id: WHATSAPP_FEEDBACK_REASON_IDS.BLOCKED_PROGRESS, title: 'Stopped the flow unnecessarily' },
            { id: WHATSAPP_FEEDBACK_REASON_IDS.OTHER, title: 'Other' },
          ]
        }
      ]
    };
  }

  return {
    bodyText: 'Sorun neydi?',
    footerText: 'Size en yakın nedeni seçin.',
    buttonText: 'Neden seç',
    sections: [
      {
        title: 'Geri bildirim nedenleri',
        rows: [
          { id: WHATSAPP_FEEDBACK_REASON_IDS.WRONG_ANSWER, title: 'Yanlış bilgi verdi' },
          { id: WHATSAPP_FEEDBACK_REASON_IDS.MISUNDERSTOOD, title: 'Ne demek istediğimi anlamadı' },
          { id: WHATSAPP_FEEDBACK_REASON_IDS.NOT_RESOLVED, title: 'Sorunumu çözmedi' },
          { id: WHATSAPP_FEEDBACK_REASON_IDS.NOT_SPECIFIC, title: 'Soruma net cevap vermedi' },
          { id: WHATSAPP_FEEDBACK_REASON_IDS.BLOCKED_PROGRESS, title: 'Gereksiz yere durdurdu' },
          { id: WHATSAPP_FEEDBACK_REASON_IDS.OTHER, title: 'Diğer' },
        ]
      }
    ]
  };
}

export function getWhatsAppFeedbackThankYouMessage(language = 'TR', sentiment = 'positive') {
  const negative = String(sentiment || '').toLowerCase() === 'negative';

  if (String(language || 'TR').toUpperCase() === 'EN') {
    return negative
      ? 'Thanks for the feedback. We will use it to improve the experience.'
      : 'Thanks for the feedback. We are glad this conversation was helpful.';
  }

  return negative
    ? 'Geri bildiriminiz için teşekkürler. Deneyimi geliştirmek için bunu değerlendireceğiz.'
    : 'Geri bildiriminiz için teşekkürler. Bu görüşmenin yardımcı olmasına sevindik.';
}

export function parseWhatsAppFeedbackSelection(interactiveReply = null) {
  const reply = isPlainObject(interactiveReply) ? interactiveReply : {};
  const id = String(reply.id || '').trim();
  const title = String(reply.title || '').trim() || null;

  if (!id) return null;
  if (id === WHATSAPP_FEEDBACK_BUTTON_IDS.POSITIVE) {
    return { sentiment: 'positive', id, title };
  }
  if (id === WHATSAPP_FEEDBACK_BUTTON_IDS.NEGATIVE) {
    return { sentiment: 'negative', id, title };
  }
  return null;
}

export function parseWhatsAppFeedbackReasonSelection(interactiveReply = null) {
  const reply = isPlainObject(interactiveReply) ? interactiveReply : {};
  const id = String(reply.id || '').trim();
  const title = String(reply.title || '').trim() || null;
  if (!id) return null;

  const mapping = {
    [WHATSAPP_FEEDBACK_REASON_IDS.WRONG_ANSWER]: 'WRONG_ANSWER',
    [WHATSAPP_FEEDBACK_REASON_IDS.MISUNDERSTOOD]: 'MISUNDERSTOOD',
    [WHATSAPP_FEEDBACK_REASON_IDS.NOT_RESOLVED]: 'NOT_RESOLVED',
    [WHATSAPP_FEEDBACK_REASON_IDS.NOT_SPECIFIC]: 'NOT_SPECIFIC',
    [WHATSAPP_FEEDBACK_REASON_IDS.BLOCKED_PROGRESS]: 'BLOCKED_PROGRESS',
    [WHATSAPP_FEEDBACK_REASON_IDS.OTHER]: 'OTHER',
  };

  if (!mapping[id]) return null;
  return {
    id,
    title,
    reason: mapping[id],
  };
}

export default {
  WHATSAPP_FEEDBACK_BUTTON_IDS,
  WHATSAPP_FEEDBACK_REASON_IDS,
  getNormalizedWhatsAppFeedbackState,
  getWhatsAppNegativeFeedbackReasonPrompt,
  getWhatsAppFeedbackPrompt,
  getWhatsAppFeedbackThankYouMessage,
  isClosingWhatsAppFeedbackMessage,
  isMeaningfulWhatsAppFeedbackMessage,
  isWhatsAppFeedbackEnabled,
  markWhatsAppFeedbackPromptSent,
  markWhatsAppFeedbackReasonPromptSent,
  markWhatsAppFeedbackSubmitted,
  parseWhatsAppFeedbackSelection,
  parseWhatsAppFeedbackReasonSelection,
  registerAssistantReplyForWhatsAppFeedback,
  registerUserMessageForWhatsAppFeedback,
  shouldPromptWhatsAppFeedback,
};
