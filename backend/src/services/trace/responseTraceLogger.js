import prisma from '../../config/database.js';
import {
  isOperationalIncidentsEnabled,
  isUnifiedResponseTraceEnabled
} from '../../config/feature-flags.js';
import { emitOperationalIncidents } from '../operationalIncidentLogger.js';
import { buildTrace } from './traceBuilder.js';

async function detectRepeatResponse({ businessId, sessionId, responseHash }) {
  if (!businessId || !sessionId || !responseHash) {
    return { detected: false, count: 0 };
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const duplicateCount = await prisma.responseTrace.count({
    where: {
      businessId,
      sessionId,
      responseHash,
      createdAt: { gte: since }
    }
  });

  return {
    detected: duplicateCount >= 1,
    count: duplicateCount + 1 // include current turn
  };
}

export async function persistUnifiedResponseTrace(traceInput) {
  const built = buildTrace(traceInput);
  const businessId = Number(built?.payload?.businessId);
  const traceEnabled = isUnifiedResponseTraceEnabled({ businessId });
  const incidentsEnabled = isOperationalIncidentsEnabled({ businessId });

  if (!built.validation.valid) {
    console.warn('⚠️ [UnifiedTrace] TRACE_SCHEMA validation failed:', built.validation.errors);
    return {
      traceId: built.traceId,
      persisted: false,
      incidentsInserted: 0,
      validation: built.validation
    };
  }

  if (!traceEnabled && !incidentsEnabled) {
    return {
      traceId: built.traceId,
      persisted: false,
      incidentsInserted: 0,
      validation: built.validation
    };
  }

  // Repeat-response signal for RESPONSE_STUCK incident category.
  try {
    const repeatResponse = await detectRepeatResponse({
      businessId,
      sessionId: built.payload.sessionId,
      responseHash: built.responseHash
    });
    built.payload.details.repeat_response = repeatResponse;
  } catch (repeatError) {
    console.warn('⚠️ [UnifiedTrace] repeat-response check failed:', repeatError.message);
    built.payload.details.repeat_response = { detected: false, count: 0, error: true };
  }

  let persisted = false;
  if (traceEnabled) {
    await prisma.responseTrace.create({
      data: {
        traceId: built.traceId,
        requestId: built.payload.requestId,
        channel: built.payload.channel,
        businessId,
        userId: built.payload.userId != null ? String(built.payload.userId) : null,
        sessionId: built.payload.sessionId || null,
        messageId: built.payload.messageId || null,
        payload: built.payload,
        latencyMs: built.payload.latency_ms,
        responseHash: built.responseHash,
        responsePreview: built.responsePreview,
        toolOutcomeHash: built.toolOutcomeHash,
        responseSource: built.responseSource,
        llmUsed: built.payload.llm_used === true,
        toolsCalledCount: built.toolsCalledCount,
        toolSuccess: built.toolSuccess
      }
    });
    persisted = true;
  }

  let incidentsInserted = 0;
  if (incidentsEnabled) {
    const incidentResult = await emitOperationalIncidents(built.payload);
    incidentsInserted = incidentResult.inserted || 0;
  }

  return {
    traceId: built.traceId,
    persisted,
    incidentsInserted,
    validation: built.validation,
    payload: built.payload
  };
}

/**
 * Non-blocking queue helper to avoid response-latency impact.
 */
export function queueUnifiedResponseTrace(traceInput) {
  const tentative = buildTrace(traceInput);
  const enrichedInput = {
    ...traceInput,
    context: {
      ...(traceInput?.context || {}),
      traceId: tentative.traceId
    }
  };
  Promise.resolve()
    .then(() => persistUnifiedResponseTrace(enrichedInput))
    .then((result) => {
      if (result.persisted || result.incidentsInserted > 0) {
        console.log('🧭 [UnifiedTrace] persisted', {
          traceId: result.traceId,
          persisted: result.persisted,
          incidentsInserted: result.incidentsInserted
        });
      }
    })
    .catch((error) => {
      console.error('❌ [UnifiedTrace] persist failed:', error.message);
    });

  return {
    traceId: tentative.traceId,
    validation: tentative.validation
  };
}

export default {
  persistUnifiedResponseTrace,
  queueUnifiedResponseTrace
};
