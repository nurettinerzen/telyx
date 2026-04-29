/**
 * Core Orchestrator: handleIncomingMessage
 *
 * GOLDEN RULE: This function NEVER calls send().
 * It returns { reply, shouldEndSession, forceEnd, state, metrics, debug }
 * Channel adapters handle sending.
 *
 * Step-by-step pipeline:
 * 01. Load Context (session, state, termination check)
 * 02. Prepare Context (system prompt, history from ChatLog, tools)
 * 03. Classify Message (Gemini Flash classifier with timeout)
 * 04. Router Decision (slot processing, dispute handling, intent routing)
 * 05. Build LLM Request (tool gating, Gemini setup)
 * 06. Tool Loop (execution with retry, idempotency, fail policy)
 * 07. Guardrails (action claim validation)
 * 08. Persist and Metrics (state save, ChatLog append, metrics emission)
 */

import { loadContext } from './orchestrator/steps/01_loadContext.js';
import { prepareContext } from './orchestrator/steps/02_prepareContext.js';
import { classifyMessage } from './orchestrator/steps/03_classify.js';
import { makeRoutingDecision } from './orchestrator/steps/04_routerDecision.js';
import { buildLLMRequest } from './orchestrator/steps/05_buildLLMRequest.js';
import { executeToolLoop } from './orchestrator/steps/06_toolLoop.js';
import { applyGuardrails } from './orchestrator/steps/07_guardrails.js';
import { persistAndEmitMetrics } from './orchestrator/steps/08_persistAndMetrics.js';
import { isFeatureEnabled } from '../config/feature-flags.js';
import prisma from '../config/database.js';
import { sanitizeResponse } from '../utils/response-firewall.js';
import {
  containsChildSafetyViolation,
  getBlockedContentMessage,
  logContentSafetyViolation
} from '../utils/content-safety.js';
import {
  detectPromptInjection,
  detectUserRisks,
  getPIIWarningMessages
} from '../services/user-risk-detector.js';
import {
  checkEnumerationAttempt,
  resetEnumerationCounter,
  getLockMessage,
  ENUMERATION_LIMITS,
  lockSession
} from '../services/session-lock.js';
import { OutcomeEventType } from '../security/outcomePolicy.js';
import { ToolOutcome, normalizeOutcome } from '../tools/toolResult.js';
import { getMessageVariant } from '../messages/messageCatalog.js';
import { checkSessionThrottle } from '../services/sessionThrottle.js';
import { ensurePolicyGuidance } from '../services/tool-fail-handler.js';
import { buildBusinessIdentity } from '../services/businessIdentity.js';
import { getEntityHint, getEntityMatchType, resolveMentionedEntity } from '../services/entityTopicResolver.js';
import { buildChatterResponse, isPureChatter } from '../services/chatter-response.js';
import {
  determineResponseGrounding,
  RESPONSE_GROUNDING,
  isBusinessClaimCategory
} from '../services/responseGrounding.js';
import { logEntityResolver } from '../services/entityResolverTelemetry.js';
import { validateFieldGrounding } from '../guardrails/antiConfabulationGuard.js';
import { buildTrace } from '../services/trace/traceBuilder.js';
import { updateState } from '../services/state-manager.js';
import { getActiveLlmProvider } from '../config/llm.js';

const LLM_CALL_REASONS = new Set(['CHAT', 'WHATSAPP', 'EMAIL']);
const RESPONSE_ORIGIN = Object.freeze({
  LLM: 'LLM',
  HARDCODED: 'HARDCODED',
  TEMPLATE: 'TEMPLATE',
  FALLBACK: 'FALLBACK',
  GUARDRAIL_OVERRIDE: 'GUARDRAIL_OVERRIDE'
});
const LLM_BYPASS_REASON = Object.freeze({
  CHILD_SAFETY: 'BYPASS_CHILD_SAFETY',
  SESSION_THROTTLE: 'BYPASS_SESSION_THROTTLE',
  PROMPT_INJECTION: 'BYPASS_PROMPT_INJECTION',
  SESSION_LOCK: 'BYPASS_SESSION_LOCK',
  SESSION_TERMINATED: 'BYPASS_SESSION_TERMINATED',
  LLM_PROVIDER_ERROR: 'BYPASS_LLM_PROVIDER_ERROR',
  ORCHESTRATOR_FATAL: 'BYPASS_ORCHESTRATOR_FATAL'
});
const RETRYABLE_LLM_ERROR_PATTERN = /(timeout|timed out|rate limit|429|overload|temporar|unavailable|503|econnreset|socket hang up|upstream|try again)/i;

function normalizeLlmCallReason(channel = 'UNKNOWN') {
  const normalized = String(channel || 'UNKNOWN').toUpperCase();
  if (LLM_CALL_REASONS.has(normalized)) return normalized;
  return normalized || 'UNKNOWN';
}

function inferLlmStatusFromError(error) {
  const message = String(error?.message || '');
  return /timeout|timed out/i.test(message) ? 'timeout' : 'error';
}

function isRetryableLlmError(error) {
  return RETRYABLE_LLM_ERROR_PATTERN.test(String(error?.message || ''));
}

function markLlmBypass(metrics = {}, { reasonCode, retryable = false, retryAfterMs = null } = {}) {
  metrics.llm_bypass_reason = reasonCode || null;
  metrics.llm_bypass_retryable = retryable === true;
  metrics.llm_bypass_retry_after_ms = Number.isFinite(retryAfterMs) && retryAfterMs > 0
    ? Math.max(0, Math.round(retryAfterMs))
    : null;
}

function buildReasonCodedFallbackMessage(
  baseMessage,
  {
    language = 'TR',
    reasonCode = 'UNKNOWN',
    retryAfterMs = null
  } = {}
) {
  const retrySeconds = Number.isFinite(retryAfterMs) && retryAfterMs > 0
    ? Math.max(1, Math.ceil(retryAfterMs / 1000))
    : null;
  const retryHint = retrySeconds
    ? (
      String(language || 'TR').toUpperCase() === 'TR'
        ? ` Lütfen ${retrySeconds} saniye sonra tekrar deneyin.`
        : ` Please retry in ${retrySeconds} seconds.`
    )
    : '';
  const shouldExposeReasonCode = String(process.env.EXPOSE_PUBLIC_REASON_CODES || '').toLowerCase() === 'true';
  const reasonSuffix = shouldExposeReasonCode && reasonCode
    ? ` [${reasonCode}]`
    : '';

  return `${String(baseMessage || '').trim()}${retryHint}${reasonSuffix}`.trim();
}

function setResponseOrigin(metrics = {}, origin = RESPONSE_ORIGIN.FALLBACK, originId = 'unknown') {
  metrics.response_origin = origin;
  metrics.origin_id = originId;
}

function hasBlockingConversationTask(state = {}) {
  const flowStatus = String(state?.flowStatus || '').toLowerCase();
  const verificationStatus = String(state?.verification?.status || '').toLowerCase();

  if (verificationStatus === 'pending' || state?.verificationContext) return true;
  if (state?.expectedSlot) return true;
  if (flowStatus === 'in_progress' || flowStatus === 'validation_error') return true;
  if (state?.activeFlow && !['idle', 'resolved', 'post_result'].includes(flowStatus)) return true;

  return false;
}

function recordChatterVariant(state = {}, variant = {}) {
  const messageKey = variant.messageKey || null;
  const variantIndex = Number.isInteger(variant.variantIndex) ? variant.variantIndex : null;
  const previousRecent = Array.isArray(state?.chatter?.recent) ? state.chatter.recent : [];

  state.chatter = {
    lastMessageKey: messageKey,
    lastVariantIndex: variantIndex,
    lastAt: new Date().toISOString(),
    recent: [
      ...previousRecent,
      { messageKey, variantIndex }
    ]
      .filter(item => item.messageKey)
      .slice(-2)
  };
}

function appendPolicyBlock(metrics = {}, blockId = null) {
  if (!blockId) return;
  const list = Array.isArray(metrics.policy_blocks) ? metrics.policy_blocks : [];
  if (!list.includes(blockId)) {
    list.push(blockId);
  }
  metrics.policy_blocks = list;
}

const PUBLIC_EMAIL_PATTERN = /\b[a-zA-Z0-9._%+-]{3,}@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;

function collectPublicContactEmails(business = {}) {
  const emails = new Set();

  const addEmailsFromValue = (value) => {
    if (typeof value !== 'string') return;
    const matches = value.match(PUBLIC_EMAIL_PATTERN) || [];
    for (const match of matches) {
      emails.add(match.trim().toLowerCase());
    }
  };

  const visit = (value) => {
    if (!value) return;
    if (typeof value === 'string') {
      addEmailsFromValue(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value === 'object') {
      for (const nested of Object.values(value)) visit(nested);
    }
  };

  addEmailsFromValue(business?.emailIntegration?.email);
  visit(business?.helpLinks);

  return [...emails];
}

function isRouterPassthroughEnabled() {
  return String(process.env.ROUTER_PASSTHROUGH || '').toLowerCase() === 'true';
}

function getContractEnforceMode() {
  const mode = String(process.env.CONTRACT_ENFORCE_MODE || 'enforce').toLowerCase().trim();
  return mode === 'disabled' ? 'disabled' : 'enforce';
}

function cloneStateForRouterDecision(state = {}) {
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(state);
    }
  } catch {
    // Fall through to JSON clone.
  }

  try {
    return JSON.parse(JSON.stringify(state || {}));
  } catch {
    return { ...(state || {}) };
  }
}

function mapAssistantMessageType({
  guardrailAction = 'PASS',
  responseGrounding = RESPONSE_GROUNDING.GROUNDED,
  needsCallbackInfo = false
} = {}) {
  if (guardrailAction === 'BLOCK') return 'system_barrier';
  if (guardrailAction === 'SANITIZE') return 'sanitized_assistant';
  if (guardrailAction === 'NEED_MIN_INFO_FOR_TOOL' || needsCallbackInfo) return 'clarification';
  if (responseGrounding === RESPONSE_GROUNDING.CLARIFICATION) return 'clarification';
  return 'assistant_claim';
}

function resolveOrderNumberCandidate({ classification = null, state = {} } = {}) {
  const candidates = [
    classification?.extractedSlots?.order_number,
    state?.extractedSlots?.order_number,
    state?.collectedSlots?.order_number,
    state?.verification?.anchor?.value,
    state?.anchor?.order_number
  ];

  const raw = candidates.find(value => typeof value === 'string' && value.trim());
  return raw ? normalizeOrderNo(raw) : null;
}

function getInternalProtocolSafeFallback(language = 'TR') {
  return String(language || '').toUpperCase() === 'EN'
    ? 'I am doing well, thanks. How can I help you today?'
    : 'İyiyim, teşekkürler. Sana nasıl yardımcı olayım?';
}

function finalizeResponseText({
  reply = '',
  language = 'TR',
  channel = 'CHAT',
  sessionId = '',
  intent = null,
  publicContactEmails = []
} = {}) {
  const fallback = getInternalProtocolSafeFallback(language);
  const text = typeof reply === 'string' ? reply.trim() : '';

  if (!text) {
    return fallback;
  }

  if (!isFeatureEnabled('UNIFIED_RESPONSE_SANITIZER')) {
    return text;
  }

  const firewall = sanitizeResponse(text, language, {
    sessionId,
    channel,
    intent,
    allowedEmails: publicContactEmails
  });

  if (!firewall.safe) {
    return fallback;
  }

  return typeof firewall.sanitized === 'string' && firewall.sanitized.trim()
    ? firewall.sanitized.trim()
    : text;
}

function extractModelResponseText(result) {
  const directText = result?.response?.text?.();
  if (typeof directText === 'string' && directText.trim()) {
    return directText.trim();
  }

  const candidates = result?.response?.candidates;
  if (!Array.isArray(candidates)) {
    return '';
  }

  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) {
      continue;
    }
    const joined = parts
      .map(part => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();
    if (joined) {
      return joined;
    }
  }

  return '';
}

function summarizeToolPayloadForCorrection(toolOutputs = []) {
  if (!Array.isArray(toolOutputs) || toolOutputs.length === 0) {
    return '[]';
  }

  const compact = toolOutputs.slice(-3).map(output => ({
    tool: output?.name || null,
    outcome: output?.outcome || null,
    data: output?.output || null
  }));

  try {
    const json = JSON.stringify(
      compact,
      (_key, value) => (typeof value === 'string' && value.length > 240 ? `${value.substring(0, 240)}...` : value),
      2
    );
    return json.length > 7000 ? `${json.substring(0, 7000)}...` : json;
  } catch {
    return '[]';
  }
}

export function extractLatestOrderPayload(toolOutputs = []) {
  if (!Array.isArray(toolOutputs)) return null;

  for (let i = toolOutputs.length - 1; i >= 0; i--) {
    const output = toolOutputs[i]?.output;
    if (!output || typeof output !== 'object') continue;

    const order = output?.order && typeof output.order === 'object' ? output.order : output;
    const hasOrderShape = Boolean(
      order?.status ||
      order?.trackingNumber ||
      order?.carrier ||
      order?.estimatedDelivery ||
      order?.items ||
      order?.totalAmount
    );

    if (!hasOrderShape) continue;

    return {
      orderNumber: order.orderNumber || null,
      status: order.status || null,
      trackingNumber: order.trackingNumber || null,
      carrier: order.carrier || null,
      estimatedDelivery: order.estimatedDelivery || null,
      items: order.items || null,
      totalAmount: order.totalAmount || null
    };
  }

  return null;
}

function normalizeGroundingText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function containsTrackingNumber(responseText = '', trackingNumber = '') {
  const response = String(responseText || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const tracking = String(trackingNumber || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (!tracking || tracking.length < 5) return true;
  return response.includes(tracking);
}

function containsStatus(responseText = '', status = '') {
  const normalizedResponse = normalizeGroundingText(responseText);
  const statusTokens = normalizeGroundingText(status).split(/\s+/).filter(token => token.length > 2);
  if (statusTokens.length === 0) return true;
  return statusTokens.some(token => normalizedResponse.includes(token));
}

function containsCarrier(responseText = '', carrier = '') {
  const normalizedResponse = normalizeGroundingText(responseText);
  const carrierTokens = normalizeGroundingText(carrier).split(/\s+/).filter(token => token.length > 2);
  if (carrierTokens.length === 0) return true;
  const matchedCount = carrierTokens.filter(token => normalizedResponse.includes(token)).length;
  const threshold = Math.max(1, Math.ceil(carrierTokens.length / 2));
  return matchedCount >= threshold;
}

export function isFieldGroundingResponseComplete(responseText, orderPayload, _previousResponse = '') {
  if (!orderPayload) return true;

  // Critical fields only; do not enforce rigid formatting/style.
  if (orderPayload.status && !containsStatus(responseText, orderPayload.status)) {
    return false;
  }
  if (orderPayload.trackingNumber && !containsTrackingNumber(responseText, orderPayload.trackingNumber)) {
    return false;
  }
  if (orderPayload.carrier && !containsCarrier(responseText, orderPayload.carrier)) {
    return false;
  }

  return true;
}

export function buildDeterministicOrderResponse(orderPayload, language = 'TR') {
  const isTR = String(language || '').toUpperCase() !== 'EN';
  const status = orderPayload?.status || (isTR ? 'bilinmiyor' : 'unknown');
  const trackingNumber = orderPayload?.trackingNumber || (isTR ? 'bulunmuyor' : 'not available');
  const carrier = orderPayload?.carrier || (isTR ? 'bilinmiyor' : 'unknown');
  const estimatedDelivery = orderPayload?.estimatedDelivery ? String(orderPayload.estimatedDelivery) : null;
  const items = orderPayload?.items;
  const totalAmount = orderPayload?.totalAmount;

  const itemText = Array.isArray(items)
    ? items.map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return item.name || item.title || JSON.stringify(item);
      return String(item);
    }).join(', ')
    : (items ? String(items) : null);

  if (isTR) {
    let response = `Siparişinizin durumu: ${status}. Kargo takip numarası: ${trackingNumber}, kargo firması: ${carrier}`;
    if (estimatedDelivery) response += `, tahmini teslimat tarihi: ${estimatedDelivery}`;
    response += '.';
    if (itemText) response += ` Ürünler: ${itemText}.`;
    if (totalAmount !== null && totalAmount !== undefined && String(totalAmount).trim() !== '') {
      response += ` Toplam tutar: ${totalAmount} TL.`;
    }
    return response;
  }

  let response = `Your order status: ${status}. Tracking number: ${trackingNumber}, carrier: ${carrier}`;
  if (estimatedDelivery) response += `, estimated delivery: ${estimatedDelivery}`;
  response += '.';
  if (itemText) response += ` Items: ${itemText}.`;
  if (totalAmount !== null && totalAmount !== undefined && String(totalAmount).trim() !== '') {
    response += ` Total amount: ${totalAmount}.`;
  }
  return response;
}

/**
 * Regenerate LLM response with guidance
 * Used when guardrails detect issues (verification needed, confabulation, etc.)
 *
 * @param {string} guidanceType - 'VERIFICATION' | 'CONFABULATION'
 * @param {any} guidanceData - Type-specific data (missingFields or correctionConstraint)
 * @param {string} userMessage - Original user message
 * @param {string} language - 'TR' | 'EN'
 * @param {Object} options - Optional context for correction quality
 * @returns {Promise<string>} Regenerated response
 */
async function regenerateWithGuidance(guidanceType, guidanceData, userMessage, language, options = {}) {
  try {
    const { getGeminiModel } = await import('../services/gemini-utils.js');

    const model = getGeminiModel({
      model: 'gemini-2.5-flash',
      temperature: 0.7,
      maxOutputTokens: 400
    });

    let guidance;

    const toolOutputs = Array.isArray(options.toolOutputs) ? options.toolOutputs : [];
    const previousResponse = typeof options.previousResponse === 'string' ? options.previousResponse : '';

    if (guidanceType === 'VERIFICATION') {
      const callbackFields = new Set(['customer_name', 'phone']);
      const missingSet = new Set(Array.isArray(guidanceData) ? guidanceData : []);
      const isCallbackInfoRequest = [...missingSet].every(field => callbackFields.has(field));
      if (isCallbackInfoRequest && missingSet.size > 0) {
        guidance = language === 'TR'
          ? 'Kullanıcı geri arama istiyor. Kimlik doğrulama veya sipariş bilgisi isteme. Sadece ad-soyad ve telefon numarası iste.'
          : 'The user requested a callback. Do not ask for identity verification or order details. Ask only for full name and phone number.';
      } else {
      const missingFieldsText = guidanceData.map(f => {
        if (f === 'order_number') return language === 'TR' ? 'sipariş numarası' : 'order number';
        if (f === 'phone_last4') return language === 'TR' ? 'telefon numarasının son 4 hanesi' : 'last 4 digits of phone number';
        return f;
      }).join(language === 'TR' ? ' ve ' : ' and ');

      guidance = language === 'TR'
        ? `Kullanıcının sipariş bilgilerine erişmek için kimlik doğrulaması gerekiyor. Kullanıcıdan ${missingFieldsText} bilgisini iste. Doğal ve kibar bir şekilde sor. Şablon cümle KULLANMA.`
        : `Identity verification is required to access order information. Ask the user for their ${missingFieldsText}. Ask naturally and politely. Do NOT use template sentences.`;
      }

    } else if (guidanceType === 'CONFABULATION') {
      guidance = language === 'TR'
        ? `Sen bir müşteri hizmetleri asistanısın. Kullanıcının sorusuna yanıt ver ama KESİN BİLGİ VERME. Sistemi sorgulamadan "bulundu", "hazır", "kargoda" gibi şeyler SÖYLEME. Bilmediğini kabul et ve sipariş numarası ile doğrulama iste.`
        : `You are a customer service assistant. Answer the user's question but DO NOT make definitive claims. Do NOT say "found", "ready", "shipped" without querying the system. Admit uncertainty and ask for order number and verification.`;

    } else if (guidanceType === 'TOOL_ONLY_DATA_LEAK') {
      guidance = language === 'TR'
        ? `Sen bir müşteri hizmetleri asistanısın. ${guidanceData} Kullanıcının sorusuna yanıt ver ama sipariş durumu, adres, telefon, takip numarası gibi kişisel veya sipariş bilgilerini KESINLIKLE paylaşma. Bu bilgilere erişmek için sipariş numarası ve doğrulama gerektiğini belirt.`
        : `You are a customer service assistant. ${guidanceData} Answer the user's question but NEVER share order status, address, phone, tracking number or any personal data. Explain that order number and verification are needed to access this information.`;

    } else if (guidanceType === 'FIELD_GROUNDING') {
      const toolPayloadJson = summarizeToolPayloadForCorrection(toolOutputs);
      guidance = language === 'TR'
        ? `Sen bir müşteri hizmetleri asistanısın. ${guidanceData}
FIELD_GROUNDING DÜZELTME KURALLARI:
1) SADECE hatalı alanı düzelt, doğru alanları KORU.
2) TOOL_PAYLOAD_JSON içindeki tüm mevcut alanları yanıtında koru.
3) TOOL_PAYLOAD_JSON'da status/trackingNumber/carrier/estimatedDelivery varsa, yanıtında bu alanları da açıkça yaz.
4) Tool verisi zenginse, yanıtı kısaltma veya "sadece kargoda" gibi minimal bırakma.
5) Tool çıktısı gerçeğin tek kaynağıdır.

TOOL_PAYLOAD_JSON:
${toolPayloadJson}`
        : `You are a customer service assistant. ${guidanceData}
FIELD_GROUNDING CORRECTION RULES:
1) Correct ONLY the incorrect field and preserve correct fields.
2) Preserve all available fields from TOOL_PAYLOAD_JSON.
3) If TOOL_PAYLOAD_JSON has status/trackingNumber/carrier/estimatedDelivery, include those fields explicitly.
4) Do not shorten a rich response to a minimal one.
5) Tool output is the source of truth.

TOOL_PAYLOAD_JSON:
${toolPayloadJson}`;

    } else if (guidanceType === 'FIREWALL_RECOVERY') {
      // P1b-FIX: Firewall false-positive recovery.
      // The original response was blocked because it accidentally matched
      // internal patterns. Re-generate with strict anti-disclosure guidance.
      guidance = language === 'TR'
        ? `Sen bir müşteri hizmetleri asistanısın. Kullanıcının sorusuna doğal ve kısa yanıt ver. KRİTİK KURALLAR: Teknik terimler (tool, function, api, endpoint, webhook, mutation, middleware, gemini, prisma, session, query) KULLANMA. Kod veya JSON yazma. Sistem iç yapısından bahsetme. Sadece müşteriye yardımcı ol.`
        : `You are a customer service assistant. Answer the user's question naturally and briefly. CRITICAL: Do NOT use technical terms (tool, function, api, endpoint, webhook, mutation, middleware, gemini, prisma, session, query). Do NOT output code or JSON. Do NOT mention system internals. Just help the customer.`;

    } else if (guidanceType === 'INTERNAL_PROTOCOL_LEAK') {
      guidance = language === 'TR'
        ? `Yanıtında iç sistem/protokol ifşası tespit edildi. ${guidanceData}
Ek kurallar:
- "Ben bir yapay zeka", "asistanım", "sistem gereği", "politika gereği", "erişimim yok", "yetkim yok" gibi ifadeleri KULLANMA.
- Doğrudan kullanıcıya yardımcı olacak kısa ve doğal bir yanıt ver.
- Eğer bilgi veremiyorsan iç kural anlatmadan alternatif yardım öner.
- Cevap en fazla 2 cümle olsun.`
        : `Internal protocol disclosure was detected in your response. ${guidanceData}
Extra rules:
- Do NOT use phrases like "I am an AI", "as an assistant", "system policy", "I don't have access", "I'm not authorized".
- Give a short, natural customer-facing response.
- If you cannot provide details, offer an alternative help path without mentioning internal rules.
- Keep the answer within 2 sentences.`;
    }

    const prompt = `${guidance}\n\nKullanıcı mesajı: "${userMessage}"\n\nÖnceki yanıt (düzeltilecek): "${previousResponse}"\n\nYanıtın:`;

    const result = await model.generateContent(prompt);
    const response = extractModelResponseText(result);

    if (!response) {
      throw new Error('EMPTY_CORRECTION_RESPONSE');
    }

    console.log(`✅ [Orchestrator] LLM regenerated (${guidanceType}):`, response.substring(0, 100));
    return response;

  } catch (error) {
    console.error('❌ [Orchestrator] LLM regeneration failed:', error.message);

    if (guidanceType === 'INTERNAL_PROTOCOL_LEAK') {
      return getInternalProtocolSafeFallback(language);
    }

    // Minimal fallback - only for error cases
    if (guidanceType === 'VERIFICATION') {
      return getMessageVariant('VERIFICATION_REGEN_ORDER_AND_PHONE', {
        language,
        directiveType: 'ASK_VERIFICATION',
        severity: 'warning',
        seedHint: Array.isArray(guidanceData) ? guidanceData.join(',') : ''
      }).text;
    } else {
      return getMessageVariant('VERIFICATION_REGEN_ORDER_ONLY', {
        language,
        directiveType: 'CLARIFY',
        severity: 'info'
      }).text;
    }
  }
}

/**
 * Normalize order number to consistent format
 * - Trim whitespace
 * - Uppercase
 * - Remove extra spaces
 */
function normalizeOrderNo(orderNo) {
  if (!orderNo) return null;
  return orderNo.toString().trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Conservative verification attempt signal for enumeration fallback.
 * Uses already-classified/stateful context instead of inferring fresh intent from raw text.
 */
function isLikelyVerificationAttempt({ userMessage, classification = null, pendingField = null }) {
  if (!userMessage) return false;

  const trimmed = String(userMessage).trim();
  if (!trimmed) return false;

  const normalizedPendingField = String(pendingField || '').toLowerCase();

  if (normalizedPendingField === 'phone_last4') {
    return /^\d{4}$/.test(trimmed);
  }

  if (normalizedPendingField === 'phone') {
    const compact = trimmed.replace(/[\s\-()]/g, '');
    return /^\+?\d{10,13}$/.test(compact);
  }

  if (normalizedPendingField === 'name' || normalizedPendingField === 'customer_name') {
    return classification?.type === 'SLOT_ANSWER' &&
      Boolean(classification?.extractedSlots?.customer_name || classification?.extractedSlots?.name);
  }

  return false;
}

export function determineTurnOutcome({
  toolLoopResult,
  guardrailResult,
  hadToolFailure = false
}) {
  if (hadToolFailure) {
    return ToolOutcome.INFRA_ERROR;
  }

  const normalizedTerminal = normalizeOutcome(toolLoopResult?._terminalState);

  // Preserve terminal NOT_FOUND contract even if guardrails rewrite text into
  // a clarification prompt for UX purposes.
  if (normalizedTerminal === ToolOutcome.NOT_FOUND) {
    return ToolOutcome.NOT_FOUND;
  }

  if (guardrailResult?.action === 'NEED_MIN_INFO_FOR_TOOL') {
    return ToolOutcome.NEED_MORE_INFO;
  }

  if (guardrailResult?.needsVerification || guardrailResult?.blockReason === 'VERIFICATION_REQUIRED') {
    return ToolOutcome.VERIFICATION_REQUIRED;
  }

  if (guardrailResult?.needsCallbackInfo || guardrailResult?.blockReason === 'CALLBACK_INFO_REQUIRED') {
    return ToolOutcome.NEED_MORE_INFO;
  }

  if (guardrailResult?.action === 'BLOCK') {
    return ToolOutcome.DENIED;
  }

  if (guardrailResult?.blockReason === 'IDENTITY_MISMATCH' || guardrailResult?.blockReason === 'POLICY_DENIED') {
    return ToolOutcome.DENIED;
  }

  if (normalizedTerminal) {
    return normalizedTerminal;
  }

  const toolOutcomes = Array.isArray(toolLoopResult?.toolResults)
    ? toolLoopResult.toolResults.map(r => normalizeOutcome(r?.outcome)).filter(Boolean)
    : [];

  if (toolOutcomes.includes(ToolOutcome.VERIFICATION_REQUIRED)) {
    return ToolOutcome.VERIFICATION_REQUIRED;
  }
  if (toolOutcomes.includes(ToolOutcome.NOT_FOUND)) {
    return ToolOutcome.NOT_FOUND;
  }
  if (toolOutcomes.includes(ToolOutcome.VALIDATION_ERROR)) {
    return ToolOutcome.VALIDATION_ERROR;
  }
  if (toolOutcomes.includes(ToolOutcome.NEED_MORE_INFO)) {
    return ToolOutcome.NEED_MORE_INFO;
  }

  return ToolOutcome.OK;
}

/**
 * Handle incoming message (channel-agnostic)
 *
 * @param {Object} params
 * @param {string} params.channel - 'CHAT' | 'WHATSAPP' | 'PHONE'
 * @param {Object} params.business - Business object with integrations
 * @param {Object} params.assistant - Assistant configuration
 * @param {string} params.channelUserId - Channel-specific user ID (phoneNumber, userId, etc.)
 * @param {string} params.sessionId - OPTIONAL: Universal session ID (if provided, NEVER create new session)
 * @param {string} params.messageId - Unique message ID (for idempotency)
 * @param {string} params.userMessage - User's message text
 * @param {string} params.language - 'TR' | 'EN'
 * @param {string} params.timezone - e.g., 'Europe/Istanbul'
 * @param {Object} params.metadata - Optional metadata (webhook context, etc.)
 *
 * @returns {Promise<Object>} { reply, shouldEndSession, forceEnd, state, metrics, debug }
 */
export async function handleIncomingMessage({
  channel,
  business,
  assistant,
  channelUserId,
  sessionId,
  messageId,
  userMessage,
  language = 'TR',
  timezone = 'Europe/Istanbul',
  metadata = {}
}) {
  const turnStartTime = Date.now();
  let finalTurnResult = null;
  let traceClassification = null;
  let traceRouting = null;
  let traceToolResults = [];
  let traceGuardrailResult = null;
  let preLlmWarnings = [];
  const publicContactEmails = collectPublicContactEmails(business);

  // DRY-RUN MODE: Disable all side-effects (for shadow mode)
  const effectsEnabled = !metadata._shadowMode && !metadata._dryRun;

  const metrics = {
    channel,
    businessId: business.id,
    turnStartTime,
    effectsEnabled, // Track if this is dry-run
    llmCalled: false,
    LLM_CALLED: false,
    llmCallReason: normalizeLlmCallReason(channel),
    llm_call_reason: normalizeLlmCallReason(channel),
    llmBypassed: true,
    bypassed: true,
    llm_provider: 'none',
    llm_status: 'not_called',
    response_origin: RESPONSE_ORIGIN.FALLBACK,
    origin_id: 'orchestrator.unset',
    tools_called_count: 0,
    intent_final: null,
    route_final: null,
    policy_blocks: [],
    llm_bypass_reason: null,
    llm_bypass_retryable: false,
    llm_bypass_retry_after_ms: null
  };

  const finalizeReply = (reply, intentHint = null) => finalizeResponseText({
    reply,
    language,
    channel,
    sessionId: metrics.sessionId || sessionId || '',
    intent: intentHint,
    publicContactEmails
  });

  const finish = (result) => {
    finalTurnResult = result;
    return result;
  };

  const prefix = effectsEnabled ? '📨' : '🔍';
  const mode = effectsEnabled ? 'PRODUCTION' : 'DRY-RUN';

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`${prefix} [Orchestrator] ${mode} - Incoming message from ${channel}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  try {
    // ========================================
    // STEP 0: Content Safety (PRE-LLM FILTER)
    // ========================================
    console.log('\n[STEP 0] Content safety check (pre-LLM)...');

    if (containsChildSafetyViolation(userMessage)) {
      console.error('🚨 [CONTENT_SAFETY] Child safety violation detected - BLOCKED');

      // Log violation (WITHOUT logging the actual message content)
      logContentSafetyViolation({
        sessionId: sessionId || 'unknown',
        channel,
        businessId: business.id,
        timestamp: new Date().toISOString()
      });

      // Pre-LLM SecurityTelemetry
      const contentSafetyTelemetry = {
        blocked: true,
        blockReason: 'CHILD_SAFETY_VIOLATION',
        stage: 'pre-llm',
        latencyMs: Date.now() - turnStartTime,
        featureFlags: {
          PLAINTEXT_INJECTION_BLOCK: isFeatureEnabled('PLAINTEXT_INJECTION_BLOCK'),
          SESSION_THROTTLE: isFeatureEnabled('SESSION_THROTTLE'),
          TOOL_ONLY_DATA_HARDBLOCK: isFeatureEnabled('TOOL_ONLY_DATA_HARDBLOCK'),
          FIELD_GROUNDING_HARDBLOCK: isFeatureEnabled('FIELD_GROUNDING_HARDBLOCK'),
          PRODUCT_SPEC_ENFORCE: isFeatureEnabled('PRODUCT_SPEC_ENFORCE'),
        }
      };
      console.log('📊 [SecurityTelemetry]', contentSafetyTelemetry);

      // Return safe response WITHOUT calling LLM
      setResponseOrigin(metrics, RESPONSE_ORIGIN.HARDCODED, 'prellm.childSafetyBlock');
      appendPolicyBlock(metrics, 'CHILD_SAFETY_VIOLATION');
      markLlmBypass(metrics, {
        reasonCode: LLM_BYPASS_REASON.CHILD_SAFETY,
        retryable: false
      });
      const childSafetyMessage = buildReasonCodedFallbackMessage(getBlockedContentMessage(language), {
        language,
        reasonCode: LLM_BYPASS_REASON.CHILD_SAFETY
      });
      return finish({
        reply: finalizeReply(childSafetyMessage),
        outcome: ToolOutcome.DENIED,
        metadata: {
          outcome: ToolOutcome.DENIED,
          guardrailAction: 'BLOCK',
          messageType: 'system_barrier',
          LLM_CALLED: false,
          llm_call_reason: normalizeLlmCallReason(channel),
          bypassed: true,
          llmBypassReason: metrics.llm_bypass_reason,
          llmBypassRetryable: metrics.llm_bypass_retryable,
          llmBypassRetryAfterMs: metrics.llm_bypass_retry_after_ms
        },
        shouldEndSession: false,
        forceEnd: false,
        locked: false,
        state: null,
        metrics: {
          ...metrics,
          llmCalled: false,
          LLM_CALLED: false,
          contentSafetyBlock: true,
          securityTelemetry: contentSafetyTelemetry
        },
        inputTokens: 0,
        outputTokens: 0,
        debug: {
          blocked: true,
          reason: 'CHILD_SAFETY_VIOLATION'
        }
      });
    }

    console.log('✅ [CONTENT_SAFETY] Message passed safety check');

    // ========================================
    // STEP 0.25: Session Throttle (P1-E)
    // ========================================
    const throttleEnabled = isFeatureEnabled('SESSION_THROTTLE');
    const throttleResult = throttleEnabled
      ? checkSessionThrottle({ channelUserId, sessionId, businessId: business.id })
      : { allowed: true };

    if (!throttleEnabled) {
      console.log('⚠️ [SessionThrottle] Feature SESSION_THROTTLE is DISABLED');
    }

    if (!throttleResult.allowed) {
      console.warn(`🚫 [SessionThrottle] Blocked: ${throttleResult.reason} (${throttleResult.count} msgs)`);
      metrics.sessionThrottled = true;
      metrics.throttleReason = throttleResult.reason;

      const throttleMessage = language === 'TR'
        ? 'Çok fazla mesaj gönderdiniz. Lütfen kısa bir süre bekleyip tekrar deneyin.'
        : 'You are sending messages too quickly. Please wait a moment and try again.';

      // Pre-LLM SecurityTelemetry
      const throttleTelemetry = {
        blocked: true,
        blockReason: 'SESSION_THROTTLE',
        stage: 'pre-llm',
        sessionThrottled: true,
        latencyMs: Date.now() - turnStartTime,
        featureFlags: {
          PLAINTEXT_INJECTION_BLOCK: isFeatureEnabled('PLAINTEXT_INJECTION_BLOCK'),
          SESSION_THROTTLE: isFeatureEnabled('SESSION_THROTTLE'),
          TOOL_ONLY_DATA_HARDBLOCK: isFeatureEnabled('TOOL_ONLY_DATA_HARDBLOCK'),
          FIELD_GROUNDING_HARDBLOCK: isFeatureEnabled('FIELD_GROUNDING_HARDBLOCK'),
          PRODUCT_SPEC_ENFORCE: isFeatureEnabled('PRODUCT_SPEC_ENFORCE'),
        }
      };
      console.log('📊 [SecurityTelemetry]', throttleTelemetry);

      setResponseOrigin(metrics, RESPONSE_ORIGIN.HARDCODED, 'prellm.sessionThrottle');
      appendPolicyBlock(metrics, 'SESSION_THROTTLE');
      markLlmBypass(metrics, {
        reasonCode: LLM_BYPASS_REASON.SESSION_THROTTLE,
        retryable: true,
        retryAfterMs: throttleResult.retryAfterMs || null
      });
      return finish({
        reply: finalizeReply(
          buildReasonCodedFallbackMessage(throttleMessage, {
            language,
            reasonCode: LLM_BYPASS_REASON.SESSION_THROTTLE,
            retryAfterMs: throttleResult.retryAfterMs || null
          })
        ),
        outcome: ToolOutcome.DENIED,
        metadata: {
          outcome: ToolOutcome.DENIED,
          guardrailAction: 'BLOCK',
          messageType: 'system_barrier',
          LLM_CALLED: false,
          llm_call_reason: normalizeLlmCallReason(channel),
          bypassed: true,
          llmBypassReason: metrics.llm_bypass_reason,
          llmBypassRetryable: metrics.llm_bypass_retryable,
          llmBypassRetryAfterMs: metrics.llm_bypass_retry_after_ms
        },
        shouldEndSession: false,
        forceEnd: false,
        locked: false,
        state: null,
        metrics: {
          ...metrics,
          llmCalled: false,
          LLM_CALLED: false,
          sessionThrottled: true,
          securityTelemetry: throttleTelemetry
        },
        inputTokens: 0,
        outputTokens: 0,
        debug: {
          blocked: true,
          reason: throttleResult.reason,
          retryAfterMs: throttleResult.retryAfterMs
        }
      });
    }

    // ========================================
    // STEP 0.5: Prompt Injection Detection (P0 SECURITY)
    // ========================================
    console.log('\n[STEP 0.5] Prompt injection check (pre-LLM)...');

    const injectionEnabled = isFeatureEnabled('PLAINTEXT_INJECTION_BLOCK');
    const injectionCheck = injectionEnabled ? await detectPromptInjection(userMessage) : { detected: false };

    if (!injectionEnabled) {
      console.log('⚠️ [INJECTION] Feature PLAINTEXT_INJECTION_BLOCK is DISABLED');
    }

    if (injectionCheck.detected) {
      console.warn('🚨 [INJECTION] Prompt injection detected:', {
        type: injectionCheck.type,
        severity: injectionCheck.severity
      });

      metrics.injectionDetected = {
        type: injectionCheck.type,
        severity: injectionCheck.severity
      };

      // Pre-LLM guard stays intentionally narrow:
      // only explicit technical override payloads are blocked here.
      if (injectionCheck.severity === 'CRITICAL') {
        console.error('🚨 [INJECTION] CRITICAL injection — blocking message, NOT calling LLM');

        // Pre-LLM SecurityTelemetry
        const injectionTelemetry = {
          blocked: true,
          blockReason: 'PROMPT_INJECTION',
          stage: 'pre-llm',
          injectionDetected: { type: injectionCheck.type, severity: 'CRITICAL' },
          latencyMs: Date.now() - turnStartTime,
          featureFlags: {
            PLAINTEXT_INJECTION_BLOCK: isFeatureEnabled('PLAINTEXT_INJECTION_BLOCK'),
            SESSION_THROTTLE: isFeatureEnabled('SESSION_THROTTLE'),
            TOOL_ONLY_DATA_HARDBLOCK: isFeatureEnabled('TOOL_ONLY_DATA_HARDBLOCK'),
            FIELD_GROUNDING_HARDBLOCK: isFeatureEnabled('FIELD_GROUNDING_HARDBLOCK'),
            PRODUCT_SPEC_ENFORCE: isFeatureEnabled('PRODUCT_SPEC_ENFORCE'),
          }
        };
        console.log('📊 [SecurityTelemetry]', injectionTelemetry);

        setResponseOrigin(metrics, RESPONSE_ORIGIN.HARDCODED, 'prellm.promptInjectionBlock');
        appendPolicyBlock(metrics, 'PROMPT_INJECTION');
        markLlmBypass(metrics, {
          reasonCode: LLM_BYPASS_REASON.PROMPT_INJECTION,
          retryable: false
        });
        const injectionBlockMessage = buildReasonCodedFallbackMessage(
          language === 'TR'
            ? 'Bu mesaj güvenlik politikamız gereği işlenemiyor. Size nasıl yardımcı olabilirim?'
            : 'This message cannot be processed due to our security policy. How can I help you?',
          {
            language,
            reasonCode: LLM_BYPASS_REASON.PROMPT_INJECTION
          }
        );
        return finish({
          reply: finalizeReply(injectionBlockMessage),
          outcome: ToolOutcome.DENIED,
          metadata: {
            outcome: ToolOutcome.DENIED,
            injectionBlocked: true,
            injectionType: injectionCheck.type,
            guardrailAction: 'BLOCK',
            messageType: 'system_barrier',
            LLM_CALLED: false,
            llm_call_reason: normalizeLlmCallReason(channel),
            bypassed: true,
            llmBypassReason: metrics.llm_bypass_reason,
            llmBypassRetryable: metrics.llm_bypass_retryable,
            llmBypassRetryAfterMs: metrics.llm_bypass_retry_after_ms
          },
          shouldEndSession: false,
          forceEnd: false,
          locked: false,
          state: null,
          metrics: {
            ...metrics,
            llmCalled: false,
            LLM_CALLED: false,
            injectionBlock: true,
            securityTelemetry: injectionTelemetry
          },
          inputTokens: 0,
          outputTokens: 0,
          debug: {
            blocked: true,
            reason: 'PROMPT_INJECTION_CRITICAL',
            injectionType: injectionCheck.type
          }
        });
      }
    } else {
      console.log('✅ [INJECTION] No injection detected');
    }

    // ========================================
    // STEP 1: Load Context
    // ========================================
    console.log('\n[STEP 1] Loading context...');
    const contextResult = await loadContext({
      channel,
      channelUserId,
      businessId: business.id,
      sessionId, // CRITICAL: Pass sessionId to prevent new session creation
      language,
      metadata
    });

    if (contextResult.terminated) {
      console.log(`⛔ [Orchestrator] Session ${contextResult.locked ? 'LOCKED' : 'terminated'}`);

      // Return lock message if locked, generic message if terminated
      const replyMessage = contextResult.locked
        ? contextResult.lockMessage
        : getMessageVariant('TERMINATED_CONVERSATION', {
          language,
          sessionId: contextResult.sessionId || sessionId || '',
          directiveType: 'TERMINATE',
          severity: 'critical',
          channel
        }).text;

      setResponseOrigin(
        metrics,
        RESPONSE_ORIGIN.TEMPLATE,
        contextResult.locked
          ? `sessionLock.${contextResult.terminationReason || 'UNKNOWN'}`
          : 'TERMINATED_CONVERSATION'
      );
      appendPolicyBlock(metrics, contextResult.terminationReason || 'SESSION_TERMINATED');
      const lockRetryAfterMs = contextResult.lockUntil
        ? Math.max(0, new Date(contextResult.lockUntil).getTime() - Date.now())
        : null;
      const lockBypassReasonCode = contextResult.locked
        ? LLM_BYPASS_REASON.SESSION_LOCK
        : LLM_BYPASS_REASON.SESSION_TERMINATED;
      markLlmBypass(metrics, {
        reasonCode: lockBypassReasonCode,
        retryable: Boolean(contextResult.locked && lockRetryAfterMs && lockRetryAfterMs > 0),
        retryAfterMs: lockRetryAfterMs
      });
      const lockMessage = buildReasonCodedFallbackMessage(replyMessage, {
        language,
        reasonCode: lockBypassReasonCode,
        retryAfterMs: contextResult.locked ? lockRetryAfterMs : null
      });
      return finish({
        reply: finalizeReply(lockMessage),
        outcome: ToolOutcome.DENIED,
        metadata: {
          outcome: ToolOutcome.DENIED,
          lockReason: contextResult.terminationReason || null,
          guardrailAction: 'BLOCK',
          messageType: 'system_barrier',
          LLM_CALLED: false,
          llm_call_reason: normalizeLlmCallReason(channel),
          bypassed: true,
          llmBypassReason: metrics.llm_bypass_reason,
          llmBypassRetryable: metrics.llm_bypass_retryable,
          llmBypassRetryAfterMs: metrics.llm_bypass_retry_after_ms
        },
        shouldEndSession: true,
        forceEnd: true,
        locked: contextResult.locked,
        lockReason: contextResult.terminationReason,
        lockUntil: contextResult.lockUntil,
        state: contextResult.state,
        metrics,
        inputTokens: 0,
        outputTokens: 0,
        debug: {
          terminationReason: contextResult.terminationReason,
          locked: contextResult.locked
        }
      });
    }

    const { sessionId: resolvedSessionId, state } = contextResult;
    metrics.sessionId = resolvedSessionId;

    if (
      isFeatureEnabled('CHATTER_FAST_PATH') &&
      isPureChatter(userMessage) &&
      !hasBlockingConversationTask(state)
    ) {
      const chatterVariant = buildChatterResponse({
        userMessage,
        state,
        language,
        sessionId: resolvedSessionId
      });
      recordChatterVariant(state, chatterVariant);

      const finalResponse = finalizeReply(chatterVariant.text || getInternalProtocolSafeFallback(language));
      const classification = {
        type: 'CHATTER',
        confidence: 1,
        reason: 'Pure chatter fast path'
      };
      const routingResult = {
        directResponse: true,
        routing: {
          action: 'ACKNOWLEDGE_CHATTER',
          reason: 'Pure chatter fast path',
          suggestedFlow: 'GENERAL',
          allowToollessResponse: true
        },
        metadata: {
          mode: 'template_fast_path',
          messageKey: chatterVariant.messageKey || null,
          variantIndex: Number.isInteger(chatterVariant.variantIndex) ? chatterVariant.variantIndex : null
        }
      };

      traceClassification = classification;
      traceRouting = routingResult;
      state.responseGrounding = RESPONSE_GROUNDING.GROUNDED;

      setResponseOrigin(metrics, RESPONSE_ORIGIN.TEMPLATE, 'prellm.chatterFastPath');
      metrics.intent_final = 'CHATTER';
      metrics.route_final = 'ACKNOWLEDGE_CHATTER';
      metrics.chatterFastPath = true;
      metrics.chatterSource = 'template_fast_path';
      metrics.llm_status = 'not_called';
      metrics.llmCalled = false;
      metrics.LLM_CALLED = false;
      metrics.llmBypassed = true;
      metrics.bypassed = true;

      await persistAndEmitMetrics({
        sessionId: resolvedSessionId,
        state,
        userMessage,
        finalResponse,
        classification,
        routing: routingResult,
        turnStartTime,
        inputTokens: 0,
        outputTokens: 0,
        toolsCalled: [],
        hadToolSuccess: false,
        hadToolFailure: false,
        failedTool: null,
        channel,
        channelUserId,
        customerPhone: channel === 'WHATSAPP' ? channelUserId : null,
        businessId: business.id,
        metrics,
        responseGrounding: RESPONSE_GROUNDING.GROUNDED,
        assistantMessageMeta: {
          messageType: 'assistant_claim',
          guardrailAction: 'PASS',
          guardrailReason: null
        },
        effectsEnabled
      });

      console.log('⚡ [ChatterFastPath] Pure chatter answered without LLM/tool pipeline');

      return finish({
        reply: finalResponse,
        outcome: ToolOutcome.OK,
        metadata: {
          outcome: ToolOutcome.OK,
          guardrailAction: 'PASS',
          messageType: 'assistant_claim',
          responseGrounding: RESPONSE_GROUNDING.GROUNDED,
          LLM_CALLED: false,
          llm_call_reason: normalizeLlmCallReason(channel),
          bypassed: true,
          chatterFastPath: true
        },
        shouldEndSession: false,
        forceEnd: false,
        locked: false,
        state,
        metrics,
        inputTokens: 0,
        outputTokens: 0,
        toolsCalled: [],
        debug: {
          classification,
          routing: routingResult.routing?.action,
          chatterFastPath: true
        }
      });
    }

    // ========================================
    // STEP 1.5: Business Identity + Entity Resolver (deterministic, pre-LLM)
    // ========================================
    console.log('\n[STEP 1.5] Resolving business identity/entity...');

    const businessIdentity = await buildBusinessIdentity({
      business,
      db: prisma
    });

    const entityResolution = resolveMentionedEntity(userMessage, businessIdentity, {
      language
    });

    const resolverTelemetry = logEntityResolver({
      channel,
      entityResolution,
      kbConfidence: 'PENDING'
    });

    metrics.businessIdentity = {
      businessName: businessIdentity.businessName,
      aliasCount: (businessIdentity.businessAliases || []).length,
      keyEntityCount: (businessIdentity.keyEntities || []).length
    };
    metrics.entityResolution = entityResolution;
    metrics.entityResolver = resolverTelemetry;

    // ========================================
    // STEP 2: Prepare Context
    // ========================================
    console.log('\n[STEP 2] Preparing context...');
    const {
      systemPrompt,
      conversationHistory,
      toolsAll,
      hasKBMatch,
      kbConfidence,
      retrievalMetadata
    } = await prepareContext({
      business,
      assistant,
      state,
      language,
      timezone,
      prisma,
      sessionId: resolvedSessionId,
      userMessage, // V1 MVP: For intelligent KB retrieval
      businessIdentity,
      entityResolution
    });

    metrics.kbConfidence = kbConfidence;
    metrics.kbRetrieval = retrievalMetadata;

    const resolverWithKb = logEntityResolver({
      channel,
      entityResolution,
      kbConfidence
    });
    metrics.entityResolverWithKb = resolverWithKb;

    const strictGroundingEnabled = isFeatureEnabled('TEXT_STRICT_GROUNDING');
    const businessClaimCategory = isBusinessClaimCategory({
      userMessage,
      entityResolution,
      businessIdentity
    });

    if (strictGroundingEnabled && businessClaimCategory && (kbConfidence === 'LOW' || !hasKBMatch)) {
      metrics.strictGroundingHint = true;
      metrics.businessClaimCategory = true;
      console.log('🧭 [Grounding] LOW KB + business-claim context detected — hinting LLM, no short-circuit');
    }

    const effectiveSystemPrompt = systemPrompt;

    console.log(`📚 History: ${conversationHistory.length} messages`);
    console.log(`🔧 Available tools: ${toolsAll.length}`);

    // ========================================
    // STEP 3: Classify Message
    // ========================================
    console.log('\n[STEP 3] Classifying message...');
    let classification = null;

    // Snapshot extractedSlots BEFORE classification updates them.
    // Used by toolLoop for repeat NOT_FOUND detection (compare old vs new identifiers).
    state._previousExtractedSlots = state.extractedSlots ? { ...state.extractedSlots } : {};

    // OPTIMIZATION: Skip classifier when no active flow.
    // Classifier is only needed to distinguish SLOT_ANSWER vs FOLLOWUP_DISPUTE
    // during active flows. In idle state, LLM handles everything directly.
    // P0-FIX: Also run classifier after NOT_FOUND/VALIDATION_ERROR so new slots get extracted.
    const needsClassifier = isFeatureEnabled('USE_MESSAGE_TYPE_ROUTING');

    if (needsClassifier) {
      classification = await classifyMessage({
        state,
        conversationHistory,
        userMessage,
        language,
        channel
      });

      console.log(`📨 Classification: ${classification.type} (${(classification.confidence * 100).toFixed(0)}%)`);
      if (classification.hadClassifierFailure) {
        console.warn(`⚠️ Classifier ${classification.failureType} - Safe mode activated`);
      }

      // Update state with extractedSlots for argument normalization
      // GUARD: During verification flow, classifier doesn't understand conversation context
      // (e.g., "8271" gets classified as order_number when it's actually phone_last4)
      // LLM handles context correctly via tool calls — don't let classifier corrupt state
      // P0-FIX: Removed flowStatus === 'in_progress' — too broad, blocks slot extraction
      // after NOT_FOUND when user provides new identifier. Only block during actual verification.
      if (classification.extractedSlots && Object.keys(classification.extractedSlots).length > 0) {
        const isVerificationPending = state.verificationContext ||
          state.verification?.status === 'pending';

        if (isVerificationPending) {
          console.log('⚠️ [Classification] Verification in progress — skipping extractedSlots merge to prevent state corruption:', classification.extractedSlots);
        } else {
          state.extractedSlots = {
            ...state.extractedSlots,
            ...classification.extractedSlots
          };
          console.log('📝 [Classification] Updated extractedSlots:', state.extractedSlots);
        }
      }
    } else {
      // Idle state: skip classifier, let LLM handle directly
      console.log('⚡ [Classify] Skipping classifier — no active flow, LLM handles directly');
      classification = {
        type: 'NEW_INTENT',
        confidence: 0.9,
        reason: 'Classifier skipped — idle state'
      };
    }
    traceClassification = classification;

    // ========================================
    // STEP 4: Router Decision
    // ========================================
    console.log('\n[STEP 4] Making routing decision...');
    const routerPassthroughEnabled = isRouterPassthroughEnabled();
    const routerState = routerPassthroughEnabled
      ? cloneStateForRouterDecision(state)
      : state;

    const rawRoutingResult = await makeRoutingDecision({
      classification,
      state: routerState,
      userMessage,
      conversationHistory,
      language,
      business,
      sessionId: resolvedSessionId,
      channel,
      channelUserId,
      hasKBMatch
    });

    let routingResult = rawRoutingResult;

    if (routerPassthroughEnabled) {
      const routerLog = {
        at: new Date().toISOString(),
        passthrough: true,
        action: rawRoutingResult?.routing?.routing?.action || rawRoutingResult?.routing?.action || null,
        suggestedFlow: rawRoutingResult?.routing?.routing?.suggestedFlow || null,
        reason: rawRoutingResult?.routing?.routing?.reason || rawRoutingResult?.routing?.reason || null,
        isChatter: !!(rawRoutingResult?.isChatter || rawRoutingResult?.chatterDirective),
        detectedBy: rawRoutingResult?.metadata?.detectedBy || null
      };

      state._routerLog = routerLog;
      metrics._routerLog = routerLog;
      metrics.router_passthrough = true;

      routingResult = {
        directResponse: false,
        routing: {
          action: 'ROUTER_PASSTHROUGH',
          routing: {
            action: 'ROUTER_PASSTHROUGH',
            reason: 'ROUTER_PASSTHROUGH=true',
            suggestedFlow: null
          }
        },
        metadata: {
          mode: 'router_passthrough'
        }
      };

      metrics.route_final = 'ROUTER_PASSTHROUGH';
      console.log('⚪ [Orchestrator] ROUTER_PASSTHROUGH=true — router decision logged to state._routerLog and ignored');
    } else {
      metrics.route_final = routingResult?.routing?.routing?.action || null;
    }

    traceRouting = routingResult;

    // Enforce LLM-first: any directResponse signal is treated as context only.
    if (routingResult.directResponse) {
      metrics.directResponseSuppressed = true;
      console.warn('⚠️ [Orchestrator] directResponse signal suppressed (LLM-first mode)');
    }

    // ========================================
    // STEP 4.5: New Order Anchor Detection (S6 fix)
    // ========================================
    // If user mentions a DIFFERENT order number than the currently verified anchor,
    // force tool routing so LLM does not skip the lookup.
    const messageOrderNumber = resolveOrderNumberCandidate({ classification, state });
    const currentAnchorOrder = resolveOrderNumberCandidate({
      state: {
        verification: state.verification,
        anchor: state.anchor
      }
    });

    if (!routerPassthroughEnabled &&
        messageOrderNumber && currentAnchorOrder &&
        messageOrderNumber !== currentAnchorOrder) {
      console.log(`🔄 [Orchestrator] New order detected: ${messageOrderNumber} (current anchor: ${currentAnchorOrder})`);

      // Reset verification state — new order needs new verification
      if (state.verification) {
        state.verification.status = 'none';
        state.verification.anchor = null;
      }

      // Update extractedSlots with new order
      state.extractedSlots = {
        ...state.extractedSlots,
        order_number: messageOrderNumber
      };

      // Force activeFlow to ORDER_STATUS so tool gating enables customer_data_lookup
      state.activeFlow = 'ORDER_STATUS';
      state.flowStatus = 'in_progress';

      metrics.newOrderAnchorDetected = true;
      console.log(`🔄 [Orchestrator] Verification reset + flow forced to ORDER_STATUS for new order`);
    }

    // ========================================
    // STEP 4.75: Context-aware User Risk Detection
    // ========================================
    // IMPORTANT:
    // We intentionally run semantic abuse/threat/spam/bypass detection
    // only after session + verification + routing context is available.
    // This prevents short contextual replies like "9111" from being
    // misread as spam before the system realizes phone_last4 is pending.
    console.log('\n[STEP 4.75] Context-aware risk detection...');
    const riskDetection = await detectUserRisks(userMessage, language, state);
    preLlmWarnings = getPIIWarningMessages(riskDetection.warnings || []);

    if (riskDetection.shouldLock) {
      console.warn(`🚨 [RiskDetector] Session lock requested: ${riskDetection.reason}`);

      let lockState = {
        reason: riskDetection.reason,
        lockUntil: null
      };

      if (effectsEnabled) {
        const persistedLock = await lockSession(resolvedSessionId, riskDetection.reason);
        lockState = {
          reason: persistedLock.reason || riskDetection.reason,
          lockUntil: persistedLock.lockUntil || null
        };
        state.flowStatus = 'terminated';
        state.lockReason = lockState.reason;
        state.lockedAt = persistedLock.lockedAt || new Date().toISOString();
        state.lockUntil = lockState.lockUntil;
      } else {
        state.flowStatus = 'terminated';
        state.lockReason = riskDetection.reason;
        state.lockedAt = new Date().toISOString();
        state.lockUntil = null;
      }

      setResponseOrigin(metrics, RESPONSE_ORIGIN.GUARDRAIL_OVERRIDE, `risk.${riskDetection.reason}`);
      appendPolicyBlock(metrics, riskDetection.reason);
      metrics.securityTelemetry = {
        blocked: true,
        blockReason: riskDetection.reason,
        stage: 'context-aware-pre-llm',
        warnings: riskDetection.warnings || []
      };

      return finish({
        reply: finalizeReply(riskDetection.message || getLockMessage(riskDetection.reason, language, resolvedSessionId)),
        outcome: ToolOutcome.DENIED,
        metadata: {
          outcome: ToolOutcome.DENIED,
          lockReason: lockState.reason,
          guardrailAction: 'BLOCK',
          messageType: 'system_barrier',
          LLM_CALLED: false,
          llm_call_reason: normalizeLlmCallReason(channel),
          bypassed: true
        },
        shouldEndSession: false,
        forceEnd: false,
        locked: true,
        lockReason: lockState.reason,
        lockUntil: lockState.lockUntil,
        state,
        metrics,
        inputTokens: 0,
        outputTokens: 0,
        warnings: preLlmWarnings.length > 0 ? preLlmWarnings : undefined,
        debug: {
          blocked: true,
          reason: riskDetection.reason
        }
      });
    }

    if (riskDetection.softRefusal) {
      console.warn(`⚠️ [RiskDetector] Soft refusal: ${riskDetection.softBlockReason || 'GENERIC'}`);

      if (effectsEnabled && riskDetection.stateUpdated) {
        await updateState(resolvedSessionId, state);
      }

      setResponseOrigin(
        metrics,
        RESPONSE_ORIGIN.GUARDRAIL_OVERRIDE,
        `risk.${riskDetection.softBlockReason || riskDetection.reason || 'SOFT_REFUSAL'}`
      );
      appendPolicyBlock(metrics, riskDetection.softBlockReason || riskDetection.reason || 'SOFT_REFUSAL');
      metrics.securityTelemetry = {
        blocked: false,
        action: 'SOFT_REFUSAL',
        blockReason: riskDetection.softBlockReason || null,
        stage: 'context-aware-pre-llm',
        warnings: riskDetection.warnings || []
      };

      return finish({
        reply: finalizeReply(riskDetection.refusalMessage),
        outcome: ToolOutcome.DENIED,
        metadata: {
          outcome: ToolOutcome.DENIED,
          guardrailAction: 'BLOCK',
          messageType: 'system_barrier',
          softRefusal: true,
          softBlockReason: riskDetection.softBlockReason || null,
          LLM_CALLED: false,
          llm_call_reason: normalizeLlmCallReason(channel),
          bypassed: true
        },
        shouldEndSession: false,
        forceEnd: false,
        locked: false,
        state,
        metrics,
        inputTokens: 0,
        outputTokens: 0,
        warnings: preLlmWarnings.length > 0 ? preLlmWarnings : undefined,
        debug: {
          blocked: false,
          reason: riskDetection.softBlockReason || 'SOFT_REFUSAL'
        }
      });
    }

    // LLM chatter directive mode.
    const isChatterLLMMode = !!routingResult.chatterDirective;
    const chatterLLMStartTime = isChatterLLMMode ? Date.now() : null;
    if (isChatterLLMMode) {
      metrics.chatterLLMMode = true;
      console.log('💬 [Telemetry] Chatter LLM mode ACTIVE — directResponse=false, LLM will generate greeting');
      console.log('💬 [Telemetry] Chatter directive:', JSON.stringify(routingResult.chatterDirective));
    }

    // ========================================
    // STEP 5: Build LLM Request
    // ========================================
    console.log('\n[STEP 5] Building LLM request...');
    const { chat, gatedTools, hasTools } = await buildLLMRequest({
      systemPrompt: effectiveSystemPrompt,
      conversationHistory,
      userMessage,
      classification,
      routingResult, // Pass routing result for allowToollessResponse handling
      state,
      toolsAll,
      metrics,
      assistant, // CHATTER minimal prompt için
      business,  // CHATTER minimal prompt için
      entityResolution,
      channel,
      liveSupportAvailable: metadata.liveSupportAvailable ?? null,
      channelUserId,
    });

    console.log(`🔧 Gated tools: ${gatedTools.length}`);

    // ========================================
    // STEP 6: Tool Loop
    // ========================================
    console.log('\n[STEP 6] Executing tool loop...');
    metrics.llm_provider = getActiveLlmProvider();
    metrics.llm_status = 'in_progress';
    metrics.llmCalled = true;
    metrics.LLM_CALLED = true;
    metrics.llmBypassed = false;
    metrics.bypassed = false;
    metrics.llmCallReason = normalizeLlmCallReason(channel);
    metrics.llm_call_reason = metrics.llmCallReason;
    const verificationStatusBeforeToolLoop = state.verification?.status || 'none';
    const verificationPendingFieldBeforeToolLoop =
      state.verification?.pendingField ||
      state.verificationContext?.pendingField ||
      null;
    const toolLoopResult = await executeToolLoop({
      chat,
      userMessage,
      conversationHistory, // CRITICAL: Pass for topic generation in create_callback
      gatedTools,
      hasTools,
      state,
      business,
      language,
      channel,
      channelUserId,       // Channel identity signal (phone for WA, null for chat)
      sessionId: resolvedSessionId,
      messageId,
      metrics,
      effectsEnabled // DRY-RUN flag
    });

    let {
      reply: responseText,
      inputTokens,
      outputTokens,
      hadToolSuccess,
      hadToolFailure,
      failedTool,
      toolsCalled,
      iterations
    } = toolLoopResult;
    traceToolResults = Array.isArray(toolLoopResult?.toolResults) ? toolLoopResult.toolResults : [];

    if (typeof toolLoopResult._llmCalled === 'boolean') {
      metrics.llmCalled = toolLoopResult._llmCalled;
      metrics.LLM_CALLED = toolLoopResult._llmCalled;
      metrics.llmBypassed = !toolLoopResult._llmCalled;
      metrics.bypassed = !toolLoopResult._llmCalled;
    }
    metrics.llm_status = toolLoopResult._llmStatus
      || (metrics.LLM_CALLED === true ? 'success' : 'not_called');
    metrics.tools_called_count = Array.isArray(toolsCalled) ? toolsCalled.length : 0;
    setResponseOrigin(
      metrics,
      toolLoopResult._responseOrigin || RESPONSE_ORIGIN.LLM,
      toolLoopResult._originId || 'toolLoop.unknown'
    );

    console.log(`🔄 Tool loop completed: ${iterations} iterations, ${toolsCalled.length} tools called`);

    // ── LLM chatter telemetry ──
    if (isChatterLLMMode) {
      const chatterLLMLatency = Date.now() - chatterLLMStartTime;
      metrics.chatterLLMLatency = chatterLLMLatency;
      metrics.chatterLLMTokens = { input: inputTokens, output: outputTokens };

      console.log(`📊 [Chatter-Telemetry] latency=${chatterLLMLatency}ms, tokens_in=${inputTokens}, tokens_out=${outputTokens}`);
      metrics.chatterSource = 'llm';
      console.log(`📊 [Chatter-Telemetry] source=${metrics.chatterSource}`);
    }

    // P0-DEBUG: Log tool results for NOT_FOUND detection debugging
    console.log('📊 [ToolLoop] Results summary:', {
      toolResultsCount: toolLoopResult.toolResults?.length || 0,
      toolsCalled: toolsCalled,
      hasNotFoundOutcome: toolLoopResult.toolResults?.some(r => normalizeOutcome(r?.outcome) === ToolOutcome.NOT_FOUND) || false,
      results: toolLoopResult.toolResults?.map(r => ({
        name: r?.name,
        outcome: r?.outcome,
        success: r?.success
      })) || []
    });

    // ========================================
    // STATE RESET AFTER NOT_FOUND TERMINAL
    // ========================================
    // When toolLoop returns NOT_FOUND terminal, the current flow is dead.
    // Reset flowStatus and activeFlow so next turn:
    //   1. Classifier runs (needsClassifier check won't skip due to stale flowStatus)
    //   2. extractedSlots merge is not blocked by stale isVerificationPending
    //   3. Tool gating re-evaluates from clean state
    //   4. Leak filter knows NOT_FOUND context via state.lastNotFound
    const terminalOutcome = normalizeOutcome(toolLoopResult._terminalState);
    if (terminalOutcome === ToolOutcome.NOT_FOUND) {
      console.log('🔄 [Orchestrator] NOT_FOUND terminal — resetting flow state for next turn');
      state.flowStatus = 'not_found';
      // Keep state.activeFlow for context but mark it as completed
      // state.lastNotFound is already set by outcomePolicy in toolLoop
    }

    if (terminalOutcome === ToolOutcome.VALIDATION_ERROR) {
      console.log('🔄 [Orchestrator] VALIDATION_ERROR terminal — resetting flow state for next turn');
      state.flowStatus = 'validation_error';
      // Don't clear activeFlow — LLM may retry with correct params
    }

    if (terminalOutcome === ToolOutcome.NEED_MORE_INFO) {
      console.log('🔄 [Orchestrator] NEED_MORE_INFO terminal — waiting for missing user input');
      state.flowStatus = 'validation_error';
    }

    // ========================================
    // ENUMERATION DEFENSE: Deterministic state-event tracking
    // ========================================
    const relevantToolResults = (toolLoopResult.toolResults || []).filter(r => r?.name === 'customer_data_lookup');
    const stateEvents = relevantToolResults.flatMap(r => Array.isArray(r.stateEvents) ? r.stateEvents : []);
    const verificationFailed = stateEvents.some(e => e?.type === OutcomeEventType.VERIFICATION_FAILED);
    const verificationSucceeded = stateEvents.some(e => e?.type === OutcomeEventType.VERIFICATION_PASSED);

    // Fallback counting path:
    // if verification was pending, user sent phone-like verification input,
    // and we still did not verify this turn, count as failed attempt.
    const syntheticVerificationFailure =
      !verificationFailed &&
      !verificationSucceeded &&
      verificationStatusBeforeToolLoop === 'pending' &&
      state.verification?.status === 'pending' &&
      isLikelyVerificationAttempt({
        userMessage,
        classification,
        pendingField: verificationPendingFieldBeforeToolLoop
      });

    if ((verificationFailed || syntheticVerificationFailure) && !verificationSucceeded) {
      const failureSource = verificationFailed ? 'state-event' : 'synthetic-fallback';
      console.log(`🔐 [Enumeration] Verification failed (${failureSource}), checking attempt count...`);

      const enumResult = await checkEnumerationAttempt(resolvedSessionId);

      if (enumResult.shouldBlock) {
        console.warn(`🚨 [Enumeration] Session blocked after ${enumResult.attempts} attempts`);
        setResponseOrigin(metrics, RESPONSE_ORIGIN.GUARDRAIL_OVERRIDE, 'enumeration.lock');
        appendPolicyBlock(metrics, 'ENUMERATION');

        return finish({
          reply: finalizeReply(getLockMessage('ENUMERATION', language, resolvedSessionId)),
          outcome: ToolOutcome.DENIED,
          metadata: {
            outcome: ToolOutcome.DENIED,
            lockReason: 'ENUMERATION',
            failedAttempts: enumResult.attempts,
            guardrailAction: 'BLOCK',
            messageType: 'system_barrier',
            LLM_CALLED: metrics.LLM_CALLED === true,
            llm_call_reason: metrics.llm_call_reason || metrics.llmCallReason || normalizeLlmCallReason(channel),
            bypassed: metrics.bypassed === true
          },
          shouldEndSession: false,
          forceEnd: false,
          locked: true,
          lockReason: 'ENUMERATION',
          state,
          metrics: {
            ...metrics,
            enumerationBlock: true,
            failedAttempts: enumResult.attempts
          },
          inputTokens,
          outputTokens,
          debug: {
            blocked: true,
            reason: 'ENUMERATION_THRESHOLD_EXCEEDED',
            attempts: enumResult.attempts
          }
        });
      }

      console.log(`⚠️ [Enumeration] Failed attempt ${enumResult.attempts}/${ENUMERATION_LIMITS.MAX_FAILED_VERIFICATIONS}`);
    } else if (verificationSucceeded) {
      // Reset counter on successful verification
      console.log('✅ [Enumeration] Verification succeeded, resetting counter');
      await resetEnumerationCounter(resolvedSessionId);
    }

    // If tool failed, response is already forced template - return immediately
    if (hadToolFailure) {
      console.log('❌ [Orchestrator] Tool failure - returning forced template');
      state.responseGrounding = RESPONSE_GROUNDING.CLARIFICATION;

      await persistAndEmitMetrics({
        sessionId: resolvedSessionId,
        state,
        userMessage,
        finalResponse: responseText,
        classification,
        routing: routingResult,
        turnStartTime,
        inputTokens,
        outputTokens,
        toolsCalled,
        hadToolSuccess: false,
        hadToolFailure: true,
        failedTool,
        channel,
        channelUserId,
        customerPhone: channel === 'WHATSAPP' ? channelUserId : null,
        businessId: business.id,
        metrics,
        responseGrounding: RESPONSE_GROUNDING.CLARIFICATION,
        assistantMessageMeta: {
          messageType: 'system_barrier',
          guardrailAction: 'BLOCK',
          guardrailReason: 'TOOL_INFRA_ERROR'
        },
        effectsEnabled // DRY-RUN flag
      });

      return finish({
        reply: finalizeReply(responseText),
        outcome: ToolOutcome.INFRA_ERROR,
        metadata: {
          outcome: ToolOutcome.INFRA_ERROR,
          failedTool,
          responseGrounding: RESPONSE_GROUNDING.CLARIFICATION,
          guardrailAction: 'BLOCK',
          messageType: 'system_barrier',
          LLM_CALLED: metrics.LLM_CALLED === true,
          llm_call_reason: metrics.llm_call_reason || metrics.llmCallReason || normalizeLlmCallReason(channel),
          bypassed: metrics.bypassed === true
        },
        shouldEndSession: false,
        forceEnd: channel === 'PHONE', // Force end on phone if tool failed
        state,
        metrics,
        inputTokens,
        outputTokens,
        debug: {
          toolFailure: true,
          failedTool,
          toolsCalled
        }
      });
    }

    // ========================================
    // STEP 7: Guardrails
    // ========================================
    console.log('\n[STEP 7] Applying guardrails...');

    // Security Gateway için verification bilgilerini hazırla
    const verificationState = state.verification?.status || 'none';
    const anchor = state.verification?.anchor;
    const verifiedIdentity = verificationState === 'verified' && anchor ? {
      customerId: anchor.customerId || anchor.id,  // Prefer explicit customerId; fallback to id for backward compat
      phone: anchor.phone,
      email: anchor.email,
      orderId: anchor.value,
      name: anchor.name
    } : null;

    // Tool output'larını topla (identity match + NOT_FOUND detection için)
    // NOT: Tüm tool sonuçlarını al - NOT_FOUND aslında başarılı bir tool call
    // Full result objesi geç (outcome, message, output dahil)
    const toolOutputs = toolLoopResult.toolResults || [];

    // Intent bilgisini al (tool enforcement için)
    // Source of truth chain: routing suggestedFlow → classifier suggestedFlow → state.activeFlow
    // Normalize: 'ORDER_STATUS' → 'order_status' (gate intents are lowercase)
    const rawFlow =
      routingResult.routing?.routing?.suggestedFlow
      || classification?.suggestedFlow
      || state.activeFlow
      || null;
    const turnIntent = rawFlow ? String(rawFlow).toLowerCase() : null;
    metrics.intent_final = turnIntent;

    // ============================================
    // COLLECTED DATA: Zaten bilinen veriler
    // ============================================
    // Leak filter için: Zaten sipariş no veya telefon verildiyse tekrar sorma
    const extractedOrderNo = resolveOrderNumberCandidate({ classification, state });
    const collectedData = {
      orderNumber: state.anchor?.order_number || state.collectedSlots?.order_number || extractedOrderNo,
      phone: state.verification?.collected?.phone || state.collectedSlots?.phone,
      last4: state.verification?.collected?.last4,
      name: state.verification?.collected?.name || state.collectedSlots?.name,
      customerName: state.verification?.collected?.customerName
    };

    console.log('📊 [Guardrails] Collected data for leak filter:', {
      hasOrderNumber: !!collectedData.orderNumber,
      hasPhone: !!collectedData.phone,
      hasLast4: !!collectedData.last4,
      hasName: !!collectedData.name
    });

    // ── Intent threading debug (P0-DEBUG) ──
    console.log('🧭 [IntentThread] intent(before guardrails):', {
      turnIntent,
      rawFlow,
      activeFlow: state.activeFlow || null,
      classifierSuggestedFlow: classification?.suggestedFlow || null,
      routingSuggestedFlow: routingResult.routing?.routing?.suggestedFlow || null,
      toolsCalled,
    });

    const guardrailResult = await applyGuardrails({
      responseText,
      hadToolSuccess,
      toolsCalled,
      toolOutputs, // Identity match için
      chat: toolLoopResult.chat,
      language,
      sessionId: resolvedSessionId,
      state,
      channel,
      metrics,
      userMessage,
      verificationState, // Security Gateway için
      verifiedIdentity, // Identity mismatch kontrolü için
      intent: turnIntent, // Tool enforcement için — normalized from suggestedFlow chain
      collectedData, // Leak filter için - zaten bilinen veriler
      lastNotFound: state.lastNotFound || null, // P0-FIX: NOT_FOUND context for leak filter bypass
      callbackPending: state.callbackFlow?.pending === true,
      activeFlow: state.activeFlow || null,
      hasKBMatch, // Anti-confabulation: businessDescriptionClaims KB-backed check
      publicContactEmails
    });
    traceGuardrailResult = guardrailResult;

    let { finalResponse } = guardrailResult;
    const guardrailOverrideApplied =
      guardrailResult?.action && guardrailResult.action !== 'PASS'
      || guardrailResult?.blocked
      || guardrailResult?.needsCorrection
      || !!guardrailResult?.blockReason;
    if (guardrailOverrideApplied) {
      setResponseOrigin(
        metrics,
        RESPONSE_ORIGIN.GUARDRAIL_OVERRIDE,
        guardrailResult?.messageKey
          || guardrailResult?.blockReason
          || `guardrail.${guardrailResult?.action || 'UNKNOWN'}`
      );
    }
    appendPolicyBlock(metrics, guardrailResult?.blockReason || null);
    if (Array.isArray(guardrailResult?.violations)) {
      for (const violation of guardrailResult.violations) {
        appendPolicyBlock(metrics, violation);
      }
    }

    // ── Intent threading debug (P0-DEBUG) — post-guardrails ──
    console.log('🧭 [IntentThread] guardrailResult:', {
      action: guardrailResult.action || 'PASS',
      blockReason: guardrailResult.blockReason || null,
      missingFields: guardrailResult.missingFields || [],
      needsCorrection: !!guardrailResult.needsCorrection,
    });

    // ── needsCorrection: re-prompt LLM instead of hard block ──
    if (guardrailResult.needsCorrection && guardrailResult.correctionType) {
      console.warn(`🔄 [Orchestrator] Guardrail requests correction: ${guardrailResult.correctionType}`);
      try {
        const corrected = await regenerateWithGuidance(
          guardrailResult.correctionType,
          guardrailResult.correctionConstraint || '',
          userMessage,
          language,
          {
            toolOutputs,
            previousResponse: responseText
          }
        );
        if (corrected && String(corrected).trim()) {
          if (guardrailResult.correctionType === 'FIELD_GROUNDING') {
            // FIELD_GROUNDING: Only fallback on actual status contradiction, not missing fields.
            // Missing carrier/tracking is LLM style — not a safety risk.
            // Reprompt limit: exactly 1 correction attempt (this block). If still wrong → deterministic fallback.
            const orderPayload = extractLatestOrderPayload(toolOutputs);
            const contradictionCheck = validateFieldGrounding(corrected, toolOutputs, language);
            const contradictsToolTruth = !contradictionCheck.grounded;

            if (contradictsToolTruth && orderPayload) {
              finalResponse = buildDeterministicOrderResponse(orderPayload, language);
              metrics.fieldGroundingDeterministicFallback = true;
              metrics.securityTelemetry = metrics.securityTelemetry || {};
              metrics.securityTelemetry.repromptCount = 1;
              metrics.securityTelemetry.fallbackUsed = true;
              console.warn('⚠️ [Orchestrator] FIELD_GROUNDING: 1 reprompt exhausted, still contradicts → deterministic fallback');
            } else {
              finalResponse = corrected;
            }
          } else {
            finalResponse = corrected;
          }

          metrics.guardrailCorrectionApplied = guardrailResult.correctionType;
          metrics.securityTelemetry = metrics.securityTelemetry || {};
          metrics.securityTelemetry.repromptCount = 1;
          // Override block — correction succeeded
          guardrailResult.blocked = false;
          guardrailResult.action = 'PASS';
          console.log(`✅ [Orchestrator] Correction succeeded for ${guardrailResult.correctionType}`);
        } else {
          // Correction returned empty — use safe fallback
          finalResponse = getInternalProtocolSafeFallback(language);
          metrics.guardrailFallbackUsed = true;
          setResponseOrigin(metrics, RESPONSE_ORIGIN.GUARDRAIL_OVERRIDE, 'guardrail.correctionEmptyFallback');
        }
      } catch (correctionError) {
        console.error('❌ [Orchestrator] Correction failed:', correctionError.message);
        finalResponse = getInternalProtocolSafeFallback(language);
        metrics.guardrailFallbackUsed = true;
        setResponseOrigin(metrics, RESPONSE_ORIGIN.GUARDRAIL_OVERRIDE, 'guardrail.correctionErrorFallback');
      }
    }

    // Security Gateway tarafından block edildiyse
    if (guardrailResult.blocked) {
      console.warn(`🚨 [SecurityGateway] Response blocked: ${guardrailResult.blockReason}${guardrailResult.violations ? ` (violations: ${guardrailResult.violations.join(', ')})` : ''}`);
      metrics.securityGatewayBlock = {
        reason: guardrailResult.blockReason,
        violations: guardrailResult.violations || null,
        details: guardrailResult.leaks || guardrailResult.mismatchDetails
      };
    }
    if (!String(finalResponse || '').trim()) {
      finalResponse = getInternalProtocolSafeFallback(language);
      metrics.guardrailFallbackUsed = true;
      setResponseOrigin(metrics, RESPONSE_ORIGIN.FALLBACK, 'orchestrator.emptyFinalResponseFallback');
    }

    // Deterministic post-pass for policy topics.
    // applyGuardrails already does this in the normal path, but blocked/reprompt flows
    // can bypass that stage and return without actionable policy guidance.
    if (typeof finalResponse === 'string' && finalResponse.trim()) {
      const policyGuidance = ensurePolicyGuidance(
        finalResponse,
        userMessage || '',
        language,
        { businessId: business.id }
      );
      finalResponse = policyGuidance.response;
      if (policyGuidance.guidanceAdded) {
        const existing = Array.isArray(metrics.guidanceAdded) ? metrics.guidanceAdded : [];
        metrics.guidanceAdded = [...new Set([...existing, ...policyGuidance.addedComponents])];
      }
      if (policyGuidance?.policyAppend) {
        metrics.policyAppend = policyGuidance.policyAppend;
      }
      if (policyGuidance?.wouldAppend === true) {
        metrics.policyAppendMonitor = {
          wouldAppend: true,
          append_key: policyGuidance?.policyAppend?.append_key || null,
          topic: policyGuidance?.policyAppend?.topic || null,
          length: Number.isFinite(policyGuidance?.policyAppend?.length) ? policyGuidance.policyAppend.length : 0
        };
      }
    }

    // ========================================
    // Response Grounding Classification
    // ========================================
    const groundingDecision = determineResponseGrounding({
      finalResponse,
      kbConfidence,
      hasKBMatch,
      hadToolSuccess,
      entityResolution,
      language,
      isChatter: isChatterLLMMode || !!routingResult.isChatter,
      businessIdentity,
      userMessage
    });

    let responseGrounding = groundingDecision.responseGrounding;
    if (groundingDecision.ungroundedDetected) {
      metrics.ungroundedDetected = true;
      finalResponse = groundingDecision.finalResponse;
      responseGrounding = RESPONSE_GROUNDING.CLARIFICATION;
      console.warn('⚠️ [Grounding] Ungrounded response intercepted and replaced with clarification');
    } else {
      finalResponse = groundingDecision.finalResponse;
    }

    state.responseGrounding = responseGrounding;
    state.lastEntityResolution = {
      ...(entityResolution || {}),
      at: new Date().toISOString()
    };

    // ── Security Policy Telemetry (canary monitoring) ──
    {
      // Build or update security telemetry
      const secTelemetry = metrics.securityTelemetry || {};
      secTelemetry.blocked = guardrailResult.blocked || false;
      secTelemetry.blockReason = guardrailResult.blockReason || null;
      secTelemetry.action = guardrailResult.action || 'PASS';
      secTelemetry.violations = guardrailResult.violations || null; // P2-FIX: firewall violation types
      secTelemetry.repromptCount = 0;
      secTelemetry.softRefusal = guardrailResult.softRefusal || false;
      secTelemetry.latencyMs = Date.now() - turnStartTime;

      // Pre-guardrail detections
      secTelemetry.injectionDetected = metrics.injectionDetected || null;
      secTelemetry.sessionThrottled = metrics.sessionThrottled || false;

      // SSOT: Merge all active feature flags into telemetry
      secTelemetry.featureFlags = {
        ...(secTelemetry.featureFlags || {}), // Guardrail-level flags (TOOL_ONLY_DATA, FIELD_GROUNDING, PRODUCT_SPEC)
        PLAINTEXT_INJECTION_BLOCK: isFeatureEnabled('PLAINTEXT_INJECTION_BLOCK'),
        SESSION_THROTTLE: isFeatureEnabled('SESSION_THROTTLE'),
      };

      secTelemetry.stage = 'post-guardrails';
      metrics.securityTelemetry = secTelemetry;

      // Structured console log for canary monitoring
      console.log('📊 [SecurityTelemetry]', {
        blocked: secTelemetry.blocked,
        blockReason: secTelemetry.blockReason,
        action: secTelemetry.action,
        violations: secTelemetry.violations || null,
        repromptCount: secTelemetry.repromptCount,
        fallbackUsed: secTelemetry.fallbackUsed || false,
        injectionDetected: !!secTelemetry.injectionDetected,
        sessionThrottled: secTelemetry.sessionThrottled,
        latencyMs: secTelemetry.latencyMs,
        featureFlags: secTelemetry.featureFlags
      });
    }

    // ── Chatter LLM guardrail telemetry ──
    if (isChatterLLMMode) {
      metrics.chatterGuardrailResult = {
        firewallRan: true,
        blocked: guardrailResult.blocked || false,
        blockReason: guardrailResult.blockReason || null,
        guardrailsApplied: guardrailResult.guardrailsApplied || [],
        violations: guardrailResult.violations || null
      };
      console.log('📊 [Chatter-Telemetry] Step7 guardrails:', {
        blocked: guardrailResult.blocked || false,
        blockReason: guardrailResult.blockReason || null,
        policiesRan: guardrailResult.guardrailsApplied || []
      });
    }

    // ========================================
    // STEP 8: Persist and Metrics
    // ========================================
    console.log('\n[STEP 8] Persisting state and emitting metrics...');
    const guardrailAction = guardrailResult.action || 'PASS';
    const terminalMessageType = typeof toolLoopResult?._terminalMessageType === 'string'
      ? toolLoopResult._terminalMessageType
      : null;
    const assistantMessageType = terminalMessageType || mapAssistantMessageType({
      guardrailAction,
      responseGrounding,
      needsCallbackInfo: guardrailResult.needsCallbackInfo
    });

    const { shouldEndSession, forceEnd, metadata: persistMetadata } = await persistAndEmitMetrics({
      sessionId: resolvedSessionId,
      state,
      userMessage,
      finalResponse,
      classification,
      routing: routingResult,
      turnStartTime,
      inputTokens,
      outputTokens,
      toolsCalled,
      hadToolSuccess,
      hadToolFailure,
      failedTool,
      channel,
      channelUserId,
      customerPhone: channel === 'WHATSAPP' ? channelUserId : null,
      businessId: business.id,
      metrics,
      responseGrounding,
      assistantMessageMeta: {
        messageType: assistantMessageType,
        guardrailAction,
        guardrailReason: guardrailResult.blockReason || null
      },
      effectsEnabled // DRY-RUN flag
    });

    console.log(`\n✅ [Orchestrator] Turn completed successfully`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    let turnOutcome = determineTurnOutcome({
      toolLoopResult,
      guardrailResult,
      hadToolFailure
    });

    // ── Contract enforcement: clarification ⇒ NEED_MORE_INFO (fail-safe) ──
    const contractEnforceMode = getContractEnforceMode();
    if (contractEnforceMode === 'enforce' &&
        assistantMessageType === 'clarification' &&
        turnOutcome === ToolOutcome.OK) {
      console.warn('🔒 [ContractEnforce] messageType=clarification but outcome=OK → overriding to NEED_MORE_INFO');
      turnOutcome = ToolOutcome.NEED_MORE_INFO;
    } else if (contractEnforceMode === 'disabled' &&
               assistantMessageType === 'clarification' &&
               turnOutcome === ToolOutcome.OK) {
      console.warn('⚪ [ContractEnforce] CONTRACT_ENFORCE_MODE=disabled — skipping clarification outcome override');
    }

    const normalizedToolOutcomes = Array.isArray(toolLoopResult?.toolResults)
      ? toolLoopResult.toolResults
        .map(result => normalizeOutcome(result?.outcome))
        .filter(Boolean)
      : [];
    const terminalValidationResult = Array.isArray(toolLoopResult?.toolResults)
      ? toolLoopResult.toolResults.find(result => normalizeOutcome(result?.outcome) === ToolOutcome.VALIDATION_ERROR)
      : null;

    return finish({
      reply: finalizeReply(finalResponse, turnIntent),
      outcome: turnOutcome,
      warnings: preLlmWarnings.length > 0 ? preLlmWarnings : undefined,
      metadata: {
        outcome: turnOutcome,
        tool_outcome: turnOutcome,
        toolOutcomes: normalizedToolOutcomes,
        guardrailsApplied: guardrailResult.guardrailsApplied || [],
        guardrailAction,
        messageType: assistantMessageType,
        guardrailMissingFields: Array.isArray(guardrailResult.missingFields) ? guardrailResult.missingFields : [],
        guardrailMessageKey: guardrailResult.messageKey || null,
        guardrailVariantIndex: Number.isInteger(guardrailResult.variantIndex) ? guardrailResult.variantIndex : null,
        verificationState: state?.verification?.status || 'none',
        ...(terminalValidationResult
          ? {
            validationErrorField: terminalValidationResult.field || null,
            validationErrorExpectedFormat: terminalValidationResult.expectedFormat || null,
            validationErrorPromptStyle: terminalValidationResult.promptStyle || null,
            validationErrorCode: terminalValidationResult.validationCode || null
          }
          : {}),
        repeatToolCallBlocked: !!toolLoopResult._repeatNotFoundBlocked,
        guidanceAdded: metrics.guidanceAdded || [],
        responseGrounding,
        kbConfidence,
        entityMatchType: getEntityMatchType(entityResolution) || null,
        entityHint: getEntityHint(entityResolution) || null,
        entityBestGuess: getEntityHint(entityResolution) || null,
        entityConfidence: entityResolution?.confidence ?? null,
        LLM_CALLED: metrics.LLM_CALLED === true,
        llm_call_reason: metrics.llm_call_reason || metrics.llmCallReason || normalizeLlmCallReason(channel),
        bypassed: metrics.bypassed === true || metrics.llmBypassed === true || metrics.LLM_CALLED !== true,
        ungroundedDetected: !!metrics.ungroundedDetected,
        // P0-3: SANITIZE/BLOCK debug — prod'da "neden sanitize oldu" tek bakışta anlaşılır
        ...(guardrailResult.leakFilterDebug || metrics.leakFilterDebug
          ? { leakFilterDebug: guardrailResult.leakFilterDebug || metrics.leakFilterDebug }
          : {}),
        ...(persistMetadata || {})
      },
      shouldEndSession,
      forceEnd,
      state,
      metrics,
      inputTokens,
      outputTokens,
      toolsCalled, // Expose toolsCalled for test assertions
      debug: {
        classification: classification.type,
        confidence: classification.confidence,
        routing: routingResult.routing?.action,
        toolsCalled,
        hadToolSuccess,
        responseGrounding,
        ...persistMetadata
      }
    });

  } catch (error) {
    console.error('❌ [Orchestrator] Fatal error:', error);
    metrics.llm_status = metrics.LLM_CALLED === true
      ? inferLlmStatusFromError(error)
      : metrics.llm_status || 'not_called';
    setResponseOrigin(metrics, RESPONSE_ORIGIN.TEMPLATE, 'FATAL_ERROR');
    appendPolicyBlock(metrics, 'ORCHESTRATOR_FATAL_ERROR');
    const bypassReasonCode = metrics.LLM_CALLED === true
      ? LLM_BYPASS_REASON.LLM_PROVIDER_ERROR
      : LLM_BYPASS_REASON.ORCHESTRATOR_FATAL;
    const retryableFatal = isRetryableLlmError(error);
    const retryAfterMs = retryableFatal ? 10000 : null;
    markLlmBypass(metrics, {
      reasonCode: bypassReasonCode,
      retryable: retryableFatal,
      retryAfterMs
    });

    // Emit error metrics
    const { emitErrorMetrics } = await import('../metrics/emit.js');
    emitErrorMetrics({
      sessionId: metrics.sessionId || 'unknown',
      channel,
      error,
      stack: error.stack
    });

    // Return safe fallback response
    const fatalTemplate = getMessageVariant('FATAL_ERROR', {
      language,
      sessionId: metrics.sessionId || sessionId || '',
      directiveType: 'FATAL',
      severity: 'critical',
      channel
    }).text;
    const fatalReply = buildReasonCodedFallbackMessage(fatalTemplate, {
      language,
      reasonCode: bypassReasonCode,
      retryAfterMs
    });
    return finish({
      reply: finalizeReply(fatalReply),
      outcome: ToolOutcome.INFRA_ERROR,
      metadata: {
        outcome: ToolOutcome.INFRA_ERROR,
        guardrailAction: 'BLOCK',
        messageType: 'system_barrier',
        LLM_CALLED: metrics.LLM_CALLED === true,
        llm_call_reason: metrics.llm_call_reason || metrics.llmCallReason || normalizeLlmCallReason(channel),
        bypassed: metrics.bypassed === true || metrics.llmBypassed === true || metrics.LLM_CALLED !== true,
        llmBypassReason: metrics.llm_bypass_reason,
        llmBypassRetryable: metrics.llm_bypass_retryable,
        llmBypassRetryAfterMs: metrics.llm_bypass_retry_after_ms
      },
      shouldEndSession: false,
      forceEnd: false,
      state: null,
      metrics,
      inputTokens: 0,
      outputTokens: 0,
      debug: {
        error: error.message,
        stack: error.stack?.substring(0, 500)
      }
    });
  } finally {
    const traceInput = {
      context: {
        channel,
        businessId: business?.id,
        userId: metadata?.userId ?? null,
        sessionId: metrics.sessionId || sessionId || null,
        messageId: messageId || metadata?.inboundMessageId || null,
        requestId: metadata?.requestId || null,
        language,
        verificationState:
          finalTurnResult?.metadata?.verificationState
          || finalTurnResult?.state?.verification?.status
          || 'none',
        responseSource: metrics.response_origin || null,
        originId: metrics.origin_id || null,
        llmUsed: metrics.LLM_CALLED === true,
        llmBypassReason: metrics.llm_bypass_reason || null,
        guardrailAction: finalTurnResult?.metadata?.guardrailAction || traceGuardrailResult?.action || 'PASS',
        guardrailReason:
          traceGuardrailResult?.blockReason
          || finalTurnResult?.metadata?.guardrailReason
          || null,
        responseGrounding:
          finalTurnResult?.metadata?.responseGrounding
          || finalTurnResult?.state?.responseGrounding
          || null,
        messageType: finalTurnResult?.metadata?.messageType || null,
        guardrailsApplied: finalTurnResult?.metadata?.guardrailsApplied || [],
        policyAppend: metrics.policyAppend
          || (metrics.policyAppendMonitor
            ? {
              mode: 'monitor_only',
              would_append: metrics.policyAppendMonitor.wouldAppend === true,
              append_key: metrics.policyAppendMonitor.append_key || null,
              topic: metrics.policyAppendMonitor.topic || null,
              length: metrics.policyAppendMonitor.length || 0
            }
            : null),
        latencyMs: Date.now() - turnStartTime,
        intent: metrics.intent_final || traceRouting?.routing?.routing?.suggestedFlow || traceClassification?.type || 'unknown'
      },
      llmMeta: {
        called: metrics.LLM_CALLED === true,
        model: assistant?.model || null,
        status: metrics.llm_status || null,
        llm_bypass_reason: metrics.llm_bypass_reason || null,
        llm_bypass_retryable: metrics.llm_bypass_retryable === true,
        llm_bypass_retry_after_ms: metrics.llm_bypass_retry_after_ms ?? null
      },
      plan: {
        intent: metrics.intent_final || traceRouting?.routing?.routing?.suggestedFlow || traceClassification?.type || 'unknown',
        slots: finalTurnResult?.state?.collectedSlots || finalTurnResult?.state?.extractedSlots || {},
        tool_candidates: [],
        tool_selected: traceToolResults?.[0]?.name || null,
        confidence: Number.isFinite(traceClassification?.confidence) ? traceClassification.confidence : null
      },
      tools: traceToolResults || [],
      guardrail: {
        action: finalTurnResult?.metadata?.guardrailAction || traceGuardrailResult?.action || 'PASS',
        reason:
          traceGuardrailResult?.blockReason
          || finalTurnResult?.metadata?.guardrailReason
          || null
      },
      postprocessors: [],
      finalResponse: finalTurnResult?.reply || ''
    };
    const unifiedTrace = buildTrace(traceInput);
    traceInput.context = {
      ...(traceInput.context || {}),
      traceId: unifiedTrace.traceId
    };

    if (finalTurnResult && typeof finalTurnResult === 'object') {
      finalTurnResult.traceContext = traceInput;
      finalTurnResult.tracePayload = unifiedTrace.payload;
      finalTurnResult.traceId = unifiedTrace.traceId;
      finalTurnResult.traceValidation = unifiedTrace.validation;
    }

    console.log(`UNIFIED_TRACE_PREVIEW ${JSON.stringify({
      trace_id: unifiedTrace.traceId,
      channel: unifiedTrace.payload.channel,
      response_source: unifiedTrace.payload.response_source,
      llm_used: unifiedTrace.payload.llm_used,
      tools_called_count: unifiedTrace.toolsCalledCount
    })}`);
  }
}

export default { handleIncomingMessage };
