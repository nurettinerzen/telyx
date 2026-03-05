import crypto from 'crypto';
import prisma from '../config/database.js';

export const OP_INCIDENT_CATEGORY = Object.freeze({
  LLM_BYPASSED: 'LLM_BYPASSED',
  TEMPLATE_FALLBACK_USED: 'TEMPLATE_FALLBACK_USED',
  TOOL_NOT_CALLED_WHEN_EXPECTED: 'TOOL_NOT_CALLED_WHEN_EXPECTED',
  VERIFICATION_INCONSISTENT: 'VERIFICATION_INCONSISTENT',
  HALLUCINATION_RISK: 'HALLUCINATION_RISK',
  RESPONSE_STUCK: 'RESPONSE_STUCK'
});

export const OP_INCIDENT_SEVERITY = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
});

const DEDUP_WINDOW_MS = 5 * 60 * 1000;
const CONFIDENT_CLAIM_PATTERN = /(sipariş|kargoda|takip|teslim|order|delivered|tracking|refund|return)/i;
const UNCERTAIN_PATTERN = /(bilmiyorum|emin değilim|bilemem|i cannot|can't|unable to verify|not sure)/i;

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

  if (['template', 'fallback', 'policy_append'].includes(String(payload.response_source || ''))) {
    pushIncident(incidents, payload, {
      category: OP_INCIDENT_CATEGORY.TEMPLATE_FALLBACK_USED,
      severity: OP_INCIDENT_SEVERITY.MEDIUM,
      summary: 'Template/fallback response source detected',
      details: {
        response_source: payload.response_source,
        origin_id: details.origin_id || null
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
  if ((verificationState === 'requested' || verificationState === 'failed') && hasConfidentClaim && !hasUncertainClaim) {
    pushIncident(incidents, payload, {
      category: OP_INCIDENT_CATEGORY.VERIFICATION_INCONSISTENT,
      severity: OP_INCIDENT_SEVERITY.HIGH,
      summary: 'Response appears to make factual claims while verification is incomplete',
      details: {
        verification_state: verificationState
      }
    });
  }

  if (payload.response_source === 'LLM' && tools.length === 0 && hasConfidentClaim) {
    pushIncident(incidents, payload, {
      category: OP_INCIDENT_CATEGORY.HALLUCINATION_RISK,
      severity: OP_INCIDENT_SEVERITY.CRITICAL,
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

export default {
  evaluateIncidents,
  emitOperationalIncidents,
  OP_INCIDENT_CATEGORY,
  OP_INCIDENT_SEVERITY
};
