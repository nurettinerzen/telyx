import crypto from 'crypto';
import prisma from '../config/database.js';

export const OP_INCIDENT_CATEGORY = Object.freeze({
  LLM_BYPASSED: 'LLM_BYPASSED',
  TEMPLATE_FALLBACK_USED: 'TEMPLATE_FALLBACK_USED',
  TOOL_NOT_CALLED_WHEN_EXPECTED: 'TOOL_NOT_CALLED_WHEN_EXPECTED',
  VERIFICATION_INCONSISTENT: 'VERIFICATION_INCONSISTENT',
  HALLUCINATION_RISK: 'HALLUCINATION_RISK',
  RESPONSE_STUCK: 'RESPONSE_STUCK',
  ASSISTANT_BLOCKED: 'ASSISTANT_BLOCKED',
  ASSISTANT_SANITIZED: 'ASSISTANT_SANITIZED',
  ASSISTANT_NEEDS_CLARIFICATION: 'ASSISTANT_NEEDS_CLARIFICATION',
  ASSISTANT_INTERVENTION: 'ASSISTANT_INTERVENTION',
  ASSISTANT_NEGATIVE_FEEDBACK: 'ASSISTANT_NEGATIVE_FEEDBACK',
  ASSISTANT_POSITIVE_FEEDBACK: 'ASSISTANT_POSITIVE_FEEDBACK'
});

export const OP_INCIDENT_SEVERITY = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
});

const DEDUP_WINDOW_MS = 5 * 60 * 1000;
const CONFIDENT_CLAIM_PATTERN = /((sipariş|siparis)(iniz|inizin)?\s+(durumu|kargoda|hazırlandı|hazirlandi|oluşturuldu|olusturuldu|iptal edildi|teslim edildi)|kargo(nuz)?\s+yolda|takip numarası|takip numarasi|teslim edildi|delivered|tracking number|refund issued|return approved|order status|your order is)/i;
const VERIFICATION_REQUEST_PATTERN = /(teyit|doğrula|dogrula|doğrul[a-zıi]*|dogrul[a-zıi]*|verify|confirm|son dört han|son dort han|last four digits|güvenliğiniz için|guvenliginiz icin|paylaşır mısınız|paylasir misiniz|paylaşabilir misiniz|paylasabilir misiniz|rica ederim)/i;
const UNCERTAIN_PATTERN = /(bilmiyorum|emin değilim|bilemem|i cannot|can't|unable to verify|not sure)/i;
export const ASSISTANT_INCIDENT_CATEGORIES = Object.freeze([
  OP_INCIDENT_CATEGORY.ASSISTANT_BLOCKED,
  OP_INCIDENT_CATEGORY.ASSISTANT_SANITIZED,
  OP_INCIDENT_CATEGORY.ASSISTANT_INTERVENTION,
  OP_INCIDENT_CATEGORY.ASSISTANT_NEGATIVE_FEEDBACK,
  OP_INCIDENT_CATEGORY.ASSISTANT_POSITIVE_FEEDBACK,
  OP_INCIDENT_CATEGORY.TEMPLATE_FALLBACK_USED
]);

export const OPS_INCIDENT_CATEGORIES = Object.freeze([
  OP_INCIDENT_CATEGORY.LLM_BYPASSED,
  OP_INCIDENT_CATEGORY.TOOL_NOT_CALLED_WHEN_EXPECTED
]);

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hashFingerprint(value = '') {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function buildFingerprint(tracePayload, category) {
  const details = safeObject(tracePayload?.details);
  const responseHash = details.response_hash || 'na';
  const toolOutcomeHash = details.tool_outcome_hash || 'na';
  const base = [
    tracePayload?.businessId ?? 'na',
    tracePayload?.sessionId ?? 'na',
    category,
    responseHash,
    toolOutcomeHash
  ].join('|');
  return hashFingerprint(base);
}

function buildIncidentBase(tracePayload) {
  return {
    traceId: String(tracePayload?.trace_id || ''),
    requestId: tracePayload?.requestId ? String(tracePayload.requestId) : null,
    businessId: Number(tracePayload?.businessId),
    userId: tracePayload?.userId != null ? String(tracePayload.userId) : null,
    sessionId: tracePayload?.sessionId ? String(tracePayload.sessionId) : null,
    messageId: tracePayload?.messageId ? String(tracePayload.messageId) : null,
    channel: String(tracePayload?.channel || 'CHAT')
  };
}

function pushIncident(list, tracePayload, { category, severity, summary, details = {} }) {
  const base = buildIncidentBase(tracePayload);
  if (!base.traceId || !Number.isFinite(base.businessId)) return;

  list.push({
    ...base,
    category,
    severity,
    summary,
    details,
    responseHash: safeObject(tracePayload?.details).response_hash || null,
    toolOutcomeHash: safeObject(tracePayload?.details).tool_outcome_hash || null
  });
}

/**
 * Evaluate operational anomalies from unified trace payload.
 * Pure function: no DB side effects.
 */
export function evaluateIncidents(tracePayload) {
  const payload = safeObject(tracePayload);
  const incidents = [];
  const details = safeObject(payload.details);

  const tools = Array.isArray(payload.tools_called) ? payload.tools_called : [];
  const toolSelected = payload?.plan?.tool_selected || null;
  const responsePreview = String(details.response_preview || '');
  const guard = safeObject(payload.guardrail);
  const guardAction = String(guard.action || 'PASS').toUpperCase();
  const guardReason = guard.reason || null;
  const responseSource = String(payload.response_source || '');
  const responseGrounding = String(details.response_grounding || '').toUpperCase();
  const postprocessors = Array.isArray(payload.postprocessors_applied) ? payload.postprocessors_applied : [];
  const originId = String(details.origin_id || '');
  const isExpectedTemplateResponse = originId === 'prellm.chatterFastPath';

  if (payload.llm_used === false && details.llm_bypass_reason) {
    pushIncident(incidents, payload, {
      category: OP_INCIDENT_CATEGORY.LLM_BYPASSED,
      severity: OP_INCIDENT_SEVERITY.HIGH,
      summary: 'Turn bypassed LLM due to pre/post guard condition',
      details: {
        llm_bypass_reason: details.llm_bypass_reason,
        response_source: payload.response_source
      }
    });
  }

  if (guardAction === 'BLOCK') {
    pushIncident(incidents, payload, {
      category: OP_INCIDENT_CATEGORY.ASSISTANT_BLOCKED,
      severity: OP_INCIDENT_SEVERITY.HIGH,
      summary: 'Assistant response was blocked before reaching the user as-is',
      details: {
        guardrail_reason: guardReason,
        response_source: responseSource
      }
    });
  }

  if (guardAction === 'SANITIZE') {
    pushIncident(incidents, payload, {
      category: OP_INCIDENT_CATEGORY.ASSISTANT_SANITIZED,
      severity: OP_INCIDENT_SEVERITY.MEDIUM,
      summary: 'Assistant response required sanitization or masking',
      details: {
        guardrail_reason: guardReason,
        response_source: responseSource
      }
    });
  }

  if (
    postprocessors.length > 0
    || (responseSource === 'template' && !isExpectedTemplateResponse)
    || responseSource === 'fallback'
    || originId.includes('guardrail')
  ) {
    pushIncident(incidents, payload, {
      category: OP_INCIDENT_CATEGORY.ASSISTANT_INTERVENTION,
      severity: OP_INCIDENT_SEVERITY.MEDIUM,
      summary: 'Assistant reply was altered by guardrails or postprocessors',
      details: {
        postprocessors,
        response_source: responseSource,
        origin_id: originId || null,
        guardrail_action: guardAction,
        guardrail_reason: guardReason
      }
    });
  }

  if (!isExpectedTemplateResponse && ['template', 'fallback', 'policy_append'].includes(String(payload.response_source || ''))) {
    pushIncident(incidents, payload, {
      category: OP_INCIDENT_CATEGORY.TEMPLATE_FALLBACK_USED,
      severity: OP_INCIDENT_SEVERITY.MEDIUM,
      summary: 'Template/fallback response source detected',
      details: {
        response_source: payload.response_source,
        origin_id: originId || null
      }
    });
  }

  if (toolSelected && tools.length === 0) {
    pushIncident(incidents, payload, {
      category: OP_INCIDENT_CATEGORY.TOOL_NOT_CALLED_WHEN_EXPECTED,
      severity: OP_INCIDENT_SEVERITY.HIGH,
      summary: 'Planner selected a tool but tool loop executed zero calls',
      details: {
        tool_selected: toolSelected,
        tool_candidates: Array.isArray(payload?.plan?.tool_candidates) ? payload.plan.tool_candidates : []
      }
    });
  }

  const verificationState = String(payload.verification_state || 'none');
  const hasConfidentClaim = CONFIDENT_CLAIM_PATTERN.test(responsePreview);
  const hasUncertainClaim = UNCERTAIN_PATTERN.test(responsePreview);
  const isClarificationLike = (
    responseGrounding === 'CLARIFICATION'
    || guardAction === 'NEED_MIN_INFO_FOR_TOOL'
    || VERIFICATION_REQUEST_PATTERN.test(responsePreview)
  );
  if (
    (verificationState === 'requested' || verificationState === 'failed')
    && hasConfidentClaim
    && !hasUncertainClaim
    && !isClarificationLike
  ) {
    pushIncident(incidents, payload, {
      category: OP_INCIDENT_CATEGORY.VERIFICATION_INCONSISTENT,
      severity: OP_INCIDENT_SEVERITY.HIGH,
      summary: 'Response appears to make factual claims while verification is incomplete',
      details: {
        verification_state: verificationState
      }
    });
  }

  if (
    payload.response_source === 'LLM'
    && tools.length === 0
    && hasConfidentClaim
    && !hasUncertainClaim
    && !isClarificationLike
  ) {
    pushIncident(incidents, payload, {
      category: OP_INCIDENT_CATEGORY.HALLUCINATION_RISK,
      severity: OP_INCIDENT_SEVERITY.HIGH,
      summary: 'LLM response has claim-like content without any tool evidence',
      details: {
        verification_state: verificationState
      }
    });
  }

  const repeatInfo = safeObject(details.repeat_response);
  if (repeatInfo.detected === true) {
    pushIncident(incidents, payload, {
      category: OP_INCIDENT_CATEGORY.RESPONSE_STUCK,
      severity: OP_INCIDENT_SEVERITY.MEDIUM,
      summary: 'Near-duplicate assistant response detected in same session',
      details: {
        normalized_hash: details.response_hash || null,
        recent_duplicate_count: Number(repeatInfo.count || 0)
      }
    });
  }

  const policyAppend = safeObject(details.policy_append);
  if (policyAppend.mode === 'monitor_only' && policyAppend.would_append === true) {
    pushIncident(incidents, payload, {
      category: OP_INCIDENT_CATEGORY.TEMPLATE_FALLBACK_USED,
      severity: OP_INCIDENT_SEVERITY.MEDIUM,
      summary: 'Policy append monitor_only: append skipped (would_append=true)',
      details: {
        append_key: policyAppend.append_key || null,
        topic: policyAppend.topic || null,
        length: Number.isFinite(policyAppend.length) ? policyAppend.length : 0
      }
    });
  }

  return incidents;
}

async function isDuplicateIncident(incident, fingerprint) {
  const since = new Date(Date.now() - DEDUP_WINDOW_MS);
  const existing = await prisma.operationalIncident.findFirst({
    where: {
      businessId: incident.businessId,
      sessionId: incident.sessionId,
      category: incident.category,
      fingerprint,
      createdAt: { gte: since }
    },
    select: { id: true }
  });
  return !!existing;
}

/**
 * Persist evaluated incidents with dedup window (5 minutes).
 */
export async function emitOperationalIncidents(tracePayload) {
  const incidents = evaluateIncidents(tracePayload);
  if (incidents.length === 0) {
    return { inserted: 0, deduped: 0, incidents: [] };
  }

  let inserted = 0;
  let deduped = 0;

  for (const incident of incidents) {
    const fingerprint = buildFingerprint(tracePayload, incident.category);
    const duplicate = await isDuplicateIncident(incident, fingerprint);
    if (duplicate) {
      deduped += 1;
      continue;
    }

    await prisma.operationalIncident.create({
      data: {
        severity: incident.severity,
        category: incident.category,
        channel: incident.channel,
        traceId: incident.traceId,
        requestId: incident.requestId,
        businessId: incident.businessId,
        userId: incident.userId,
        sessionId: incident.sessionId,
        messageId: incident.messageId,
        summary: incident.summary,
        details: incident.details || null,
        fingerprint,
        responseHash: incident.responseHash,
        toolOutcomeHash: incident.toolOutcomeHash
      }
    });
    inserted += 1;
  }

  return { inserted, deduped, incidents };
}

export async function logAssistantFeedback({
  businessId,
  traceId = null,
  requestId = null,
  sessionId = null,
  messageId = null,
  userId = null,
  channel = 'CHAT',
  sentiment = 'negative',
  reason = null,
  comment = null,
  assistantReplyPreview = null,
  source = 'widget_feedback'
} = {}) {
  const numericBusinessId = Number(businessId);
  if (!Number.isFinite(numericBusinessId)) {
    throw new Error('BUSINESS_ID_REQUIRED');
  }

  const normalizedSentiment = String(sentiment || 'negative').toLowerCase() === 'positive'
    ? 'positive'
    : 'negative';
  const category = normalizedSentiment === 'positive'
    ? OP_INCIDENT_CATEGORY.ASSISTANT_POSITIVE_FEEDBACK
    : OP_INCIDENT_CATEGORY.ASSISTANT_NEGATIVE_FEEDBACK;
  const severity = normalizedSentiment === 'positive'
    ? OP_INCIDENT_SEVERITY.LOW
    : OP_INCIDENT_SEVERITY.HIGH;
  const normalizedComment = String(comment || '').trim() || null;
  const normalizedReason = String(reason || '').trim() || null;
  const normalizedPreview = String(assistantReplyPreview || '').trim() || null;
  const fingerprint = hashFingerprint([
    numericBusinessId,
    traceId || 'na',
    sessionId || 'na',
    category,
    normalizedReason || 'na',
    normalizedComment || 'na'
  ].join('|'));

  const existing = await prisma.operationalIncident.findFirst({
    where: {
      businessId: numericBusinessId,
      category,
      fingerprint
    },
    select: { id: true }
  });

  if (existing) {
    return { created: false, id: existing.id, deduped: true };
  }

  const created = await prisma.operationalIncident.create({
    data: {
      severity,
      category,
      channel: String(channel || 'CHAT').toUpperCase(),
      traceId: traceId || `feedback_${Date.now()}`,
      requestId: requestId ? String(requestId) : null,
      businessId: numericBusinessId,
      userId: userId != null ? String(userId) : null,
      sessionId: sessionId ? String(sessionId) : null,
      messageId: messageId ? String(messageId) : null,
      summary: normalizedSentiment === 'positive'
        ? 'End user marked the assistant response as helpful'
        : 'End user marked the assistant response as not helpful',
      details: {
        source,
        sentiment: normalizedSentiment,
        reason: normalizedReason,
        comment: normalizedComment,
        assistantReplyPreview: normalizedPreview
      },
      fingerprint
    }
  });

  return { created: true, id: created.id, deduped: false };
}

export default {
  evaluateIncidents,
  emitOperationalIncidents,
  logAssistantFeedback,
  OP_INCIDENT_CATEGORY,
  OP_INCIDENT_SEVERITY,
  ASSISTANT_INCIDENT_CATEGORIES,
  OPS_INCIDENT_CATEGORIES
};
