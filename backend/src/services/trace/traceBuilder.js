import crypto from 'crypto';

const CHANNELS = new Set(['WHATSAPP', 'CHAT', 'EMAIL', 'ADMIN_DRAFT']);
const VERIFICATION_STATES = new Set(['none', 'requested', 'provided', 'failed', 'passed']);
const RESPONSE_SOURCES = new Set(['LLM', 'template', 'fallback', 'policy_append']);
const TOOL_OUTCOMES = new Set([
  'OK',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'NEED_MORE_INFO',
  'VERIFICATION_REQUIRED',
  'DENIED',
  'INFRA_ERROR'
]);

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function toInt(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.round(numeric));
}

function normalizeChannel(channel) {
  const normalized = String(channel || 'CHAT').toUpperCase();
  if (CHANNELS.has(normalized)) return normalized;
  return 'CHAT';
}

function normalizeVerificationState(state) {
  const normalized = String(state || 'none').toLowerCase();
  if (normalized === 'pending') return 'requested';
  if (normalized === 'verified') return 'passed';
  if (VERIFICATION_STATES.has(normalized)) return normalized;
  return 'none';
}

function normalizeResponseSource(rawSource, policyAppend = null) {
  if (policyAppend?.mode === 'legacy' && policyAppend?.guidanceAdded === true) {
    return 'policy_append';
  }

  const source = String(rawSource || '').toUpperCase();
  if (source === 'LLM') return 'LLM';
  if (source === 'FALLBACK') return 'fallback';
  if (source === 'TEMPLATE') return 'template';
  if (source === 'HARDCODED') return 'template';
  if (source === 'GUARDRAIL_OVERRIDE') return 'template';
  return 'fallback';
}

function normalizeToolOutcome(rawOutcome, success) {
  const normalized = String(rawOutcome || '').toUpperCase();
  if (TOOL_OUTCOMES.has(normalized)) return normalized;
  return success === true ? 'OK' : 'INFRA_ERROR';
}

function normalizeScalar(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

function normalizeSlotMap(slots) {
  const obj = asObject(slots);
  const output = {};
  for (const [key, value] of Object.entries(obj)) {
    output[key] = normalizeScalar(value);
  }
  return output;
}

function trimPreview(text, maxLen = 220) {
  const content = String(text || '').trim();
  if (content.length <= maxLen) return content;
  return `${content.slice(0, maxLen)}...`;
}

function normalizeForHash(text = '') {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hashText(text = '') {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex');
}

function buildTraceId() {
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  return `trc_${rand}`;
}

function ensureRequestId(context = {}) {
  if (context.requestId && String(context.requestId).trim()) {
    return String(context.requestId);
  }
  return `req_${Date.now()}`;
}

function ensureSessionId(context = {}, channel = 'CHAT') {
  if (context.sessionId && String(context.sessionId).trim()) {
    return String(context.sessionId);
  }
  if (context.messageId && String(context.messageId).trim()) {
    return `${channel.toLowerCase()}_${String(context.messageId)}`;
  }
  return `${channel.toLowerCase()}_${Date.now()}`;
}

function normalizePostprocessors(postprocessors = []) {
  if (!Array.isArray(postprocessors)) return [];
  return postprocessors
    .map(item => String(item || '').trim())
    .filter(Boolean);
}

function normalizeTools(tools = []) {
  if (!Array.isArray(tools)) return [];

  return tools.map((item) => {
    const tool = asObject(item);
    return {
      name: String(tool.name || tool.toolName || 'unknown_tool'),
      input: asObject(tool.input || tool.args || {}),
      outcome: normalizeToolOutcome(tool.outcome, tool.success),
      latency_ms: toInt(tool.latencyMs || tool.latency_ms || tool.executionMs || 0),
      retry_count: toInt(tool.retryCount || tool.retry_count || 0),
      error_code: tool.errorCode || tool.error_code || tool.validationCode || null
    };
  });
}

export function validateResponseTracePayload(payload) {
  const errors = [];
  const data = asObject(payload);

  const requiredKeys = [
    'trace_id',
    'timestamp',
    'channel',
    'requestId',
    'businessId',
    'userId',
    'sessionId',
    'llm_used',
    'model',
    'prompt_hash',
    'completion_id',
    'plan',
    'tools_called',
    'verification_state',
    'response_source',
    'postprocessors_applied',
    'final_response_length',
    'language'
  ];

  for (const key of requiredKeys) {
    if (!(key in data)) {
      errors.push(`missing:${key}`);
    }
  }

  if (!CHANNELS.has(String(data.channel || ''))) {
    errors.push('channel.invalid');
  }

  if (!VERIFICATION_STATES.has(String(data.verification_state || ''))) {
    errors.push('verification_state.invalid');
  }

  if (!RESPONSE_SOURCES.has(String(data.response_source || ''))) {
    errors.push('response_source.invalid');
  }

  if (!Array.isArray(data.tools_called)) {
    errors.push('tools_called.invalid');
  }

  if (!Array.isArray(data.postprocessors_applied)) {
    errors.push('postprocessors_applied.invalid');
  }

  if (typeof data.final_response_length !== 'number') {
    errors.push('final_response_length.invalid');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Unified trace builder for all channels.
 * Build once, finalize at route-level after all postprocessors are complete.
 */
export function buildTrace({
  context = {},
  llmMeta = {},
  plan = {},
  tools = [],
  guardrail = {},
  postprocessors = [],
  finalResponse = ''
} = {}) {
  const ctx = asObject(context);
  const llm = asObject(llmMeta);
  const planInput = asObject(plan);
  const guard = asObject(guardrail);

  const channel = normalizeChannel(ctx.channel);
  const policyAppend = asObject(ctx.policyAppend);
  const responseSource = normalizeResponseSource(
    ctx.responseSource || llm.response_origin || llm.responseSource,
    policyAppend
  );
  const finalText = String(finalResponse || '');
  const normalizedFinal = normalizeForHash(finalText);
  const responseHash = normalizedFinal ? hashText(normalizedFinal) : null;

  const normalizedTools = normalizeTools(tools);
  const toolOutcomeSignature = normalizedTools
    .map(tool => `${tool.name}:${tool.outcome}:${tool.error_code || '-'}`)
    .join('|');
  const toolOutcomeHash = toolOutcomeSignature ? hashText(toolOutcomeSignature) : null;
  const hasToolSuccess = normalizedTools.some(tool => tool.outcome === 'OK');

  const traceId = String(ctx.traceId || buildTraceId());
  const requestId = ensureRequestId(ctx);
  const sessionId = ensureSessionId(ctx, channel);

  const tracePayload = {
    trace_id: traceId,
    timestamp: new Date().toISOString(),
    channel,
    requestId,
    businessId: ctx.businessId,
    userId: ctx.userId ?? null,
    sessionId,
    messageId: ctx.messageId ? String(ctx.messageId) : null,
    llm_used: llm.called === true || llm.llm_called === true || ctx.llmUsed === true,
    model: llm.model || null,
    prompt_hash: llm.prompt_hash || null,
    completion_id: llm.completion_id || null,
    plan: {
      intent: String(planInput.intent || ctx.intent || 'unknown'),
      slots: normalizeSlotMap(planInput.slots),
      next_question: planInput.next_question || null,
      tool_candidates: Array.isArray(planInput.tool_candidates)
        ? planInput.tool_candidates.map(item => String(item))
        : [],
      tool_selected: planInput.tool_selected || null,
      confidence: Number.isFinite(planInput.confidence) ? planInput.confidence : null
    },
    tools_called: normalizedTools,
    verification_state: normalizeVerificationState(ctx.verificationState || ctx.verification_state),
    response_source: responseSource,
    postprocessors_applied: normalizePostprocessors(postprocessors),
    guardrail: {
      action: String(guard.action || ctx.guardrailAction || 'PASS'),
      reason: guard.reason || ctx.guardrailReason || null
    },
    final_response_length: finalText.length,
    language: String(ctx.language || 'TR'),
    latency_ms: Number.isFinite(ctx.latencyMs) ? toInt(ctx.latencyMs) : null,
    details: {
      response_origin_raw: ctx.responseSource || null,
      origin_id: ctx.originId || null,
      llm_status: llm.status || null,
      llm_bypass_reason: llm.llm_bypass_reason || ctx.llmBypassReason || null,
      llm_bypass_retryable: llm.llm_bypass_retryable === true,
      llm_bypass_retry_after_ms: Number.isFinite(llm.llm_bypass_retry_after_ms)
        ? toInt(llm.llm_bypass_retry_after_ms)
        : null,
      response_grounding: ctx.responseGrounding || null,
      message_type: ctx.messageType || null,
      guardrails_applied: Array.isArray(ctx.guardrailsApplied) ? ctx.guardrailsApplied : [],
      response_hash: responseHash,
      tool_outcome_hash: toolOutcomeHash,
      response_preview: trimPreview(finalText, 320),
      policy_append: Object.keys(policyAppend).length > 0 ? policyAppend : null
    }
  };

  const validation = validateResponseTracePayload(tracePayload);

  return {
    traceId,
    payload: tracePayload,
    validation,
    responseHash,
    toolOutcomeHash,
    responseSource,
    responsePreview: trimPreview(finalText),
    toolsCalledCount: normalizedTools.length,
    toolSuccess: hasToolSuccess
  };
}

export default {
  buildTrace,
  validateResponseTracePayload
};
