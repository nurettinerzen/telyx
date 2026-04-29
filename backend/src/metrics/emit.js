/**
 * Metrics Emission
 *
 * Central place for all metrics emission.
 * Emits to:
 * - Console (dev)
 * - In-memory store (for dashboard)
 * - External systems (future: Datadog, Prometheus, etc.)
 */

import { getActiveLlmProvider } from '../config/llm.js';
import { logRoutingDecision } from '../services/routing-metrics.js';

/**
 * Emit turn metrics
 *
 * @param {Object} metrics - Turn metrics
 */
export function emitTurnMetrics(metrics) {
  const {
    sessionId,
    channel,
    businessId,
    turnDuration,
    classification,
    routing,
    toolsCalled = [],
    hadToolSuccess = false,
    hadToolFailure = false,
    failedTool = null,
    inputTokens = 0,
    outputTokens = 0,
    error = null,
    identityProof = null,  // Channel identity proof telemetry
    securityTelemetry = null, // Security policy telemetry (P1-E)
    llmCalled = null,
    LLM_CALLED = null,
    llmCallReason = null,
    llm_call_reason = null,
    llmBypassed = null,
    bypassed = null,
    response_origin = null,
    origin_id = null,
    llm_provider = null,
    llm_status = null,
    tools_called_count = null,
    intent_final = null,
    route_final = null,
    policy_blocks = null,
    llm_bypass_reason = null,
    llm_bypass_retryable = null,
    llm_bypass_retry_after_ms = null
  } = metrics;

  const llmCalledFlag = llmCalled === true || LLM_CALLED === true;
  const llmReason = llm_call_reason
    || llmCallReason
    || String(channel || 'UNKNOWN').toUpperCase();
  const llmBypassFlag = typeof bypassed === 'boolean'
    ? bypassed
    : typeof llmBypassed === 'boolean'
      ? llmBypassed
      : !llmCalledFlag;
  const responseOrigin = response_origin || 'FALLBACK';
  const originId = origin_id || 'unknown';
  const provider = llm_provider || (llmCalledFlag ? getActiveLlmProvider() : 'none');
  const llmStatus = llm_status || (llmCalledFlag ? 'success' : 'not_called');
  const toolCount = Number.isInteger(tools_called_count) ? tools_called_count : toolsCalled.length;
  const policyBlocks = Array.isArray(policy_blocks) ? policy_blocks : [];
  const llmBypassReason = llm_bypass_reason || null;
  const llmBypassRetryable = llm_bypass_retryable === true;
  const llmBypassRetryAfterMs = Number.isFinite(llm_bypass_retry_after_ms)
    ? llm_bypass_retry_after_ms
    : null;

  // Console log (dev)
  const metricsLog = {
    sessionId,
    channel,
    duration: `${turnDuration}ms`,
    classification: classification?.type,
    confidence: classification?.confidence,
    toolsCalled: toolsCalled.length,
    hadToolSuccess,
    hadToolFailure,
    tokens: { input: inputTokens, output: outputTokens },
    llmCalled: llmCalledFlag,
    LLM_CALLED: llmCalledFlag,
    llm_called: llmCalledFlag,
    llm_provider: provider,
    llm_status: llmStatus,
    llm_call_reason: llmReason,
    bypassed: llmBypassFlag,
    response_origin: responseOrigin,
    origin_id: originId,
    tools_called_count: toolCount,
    intent_final,
    route_final,
    policy_blocks: policyBlocks,
    llm_bypass_reason: llmBypassReason,
    llm_bypass_retryable: llmBypassRetryable,
    llm_bypass_retry_after_ms: llmBypassRetryAfterMs
  };

  // Identity proof telemetry (when channel proof is evaluated)
  if (identityProof) {
    metricsLog.identityProof = {
      strength: identityProof.strength,
      channel: identityProof.channel,
      autoverifyApplied: identityProof.autoverifyApplied || false,
      secondFactorRequired: identityProof.secondFactorRequired,
      reason: identityProof.reason,
      durationMs: identityProof.durationMs
    };
  }

  // Security telemetry (canary monitoring)
  if (securityTelemetry) {
    metricsLog.security = {
      blocked: securityTelemetry.blocked,
      blockReason: securityTelemetry.blockReason,
      correctionType: securityTelemetry.correctionType,
      repromptCount: securityTelemetry.repromptCount,
      fallbackUsed: securityTelemetry.fallbackUsed,
      injectionDetected: !!securityTelemetry.injectionDetected,
      sessionThrottled: securityTelemetry.sessionThrottled,
      latencyMs: securityTelemetry.latencyMs,
      stage: securityTelemetry.stage || 'unknown',
      featureFlags: securityTelemetry.featureFlags || {}
    };
  }

  // Only include error if it exists
  if (error) {
    metricsLog.error = error;
  }

  console.log('📊 [TurnMetrics]', metricsLog);

  // Log routing decision
  if (routing) {
    logRoutingDecision({
      sessionId,
      routing: routing.routing,
      triggerRule: classification?.triggerRule,
      state: { /* minimal state snapshot */ },
      newFlow: routing.routing.suggestedFlow || null
    });
  }

  // TODO: Emit to external systems (Datadog, Prometheus, etc.)
  // Example:
  // if (process.env.DATADOG_ENABLED === 'true') {
  //   datadogClient.increment('turn.completed', 1, {
  //     channel,
  //     classification: classification?.type,
  //     had_tool_failure: hadToolFailure
  //   });
  // }
}

/**
 * Emit error metrics
 *
 * @param {Object} errorData
 */
export function emitErrorMetrics(errorData) {
  const { sessionId, channel, error, stack, businessId, source } = errorData;

  console.error('🚨 [ErrorMetrics]', {
    sessionId,
    channel,
    error: error?.message || error,
    stack: stack?.substring(0, 200)
  });

  // Persist to ErrorLog table (replaces TODO for Sentry/Rollbar)
  // Non-blocking: fire-and-forget, never awaited to avoid slowing down the request
  import('../services/errorLogger.js')
    .then(({ logError, ERROR_CATEGORY, SEVERITY }) => {
      logError({
        category: ERROR_CATEGORY.SYSTEM_ERROR,
        severity: SEVERITY.HIGH,
        message: error?.message || String(error),
        error: error instanceof Error ? error : null,
        source: source || 'orchestrator',
        sessionId,
        businessId: businessId || null,
      }).catch(() => {}); // swallow — logError already has internal try/catch
    })
    .catch(() => {}); // swallow import errors
}

export default {
  emitTurnMetrics,
  emitErrorMetrics
};
