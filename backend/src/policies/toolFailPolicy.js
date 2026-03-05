/**
 * Tool Fail Policy
 *
 * CRITICAL: Only apply fail policy on INFRA_ERROR.
 *
 * Valid outcomes (NOT failures - AI handles naturally):
 * - OK: Tool succeeded
 * - NOT_FOUND: Query succeeded, no matching record
 * - VALIDATION_ERROR: User provided invalid input
 * - VERIFICATION_REQUIRED: Need identity verification
 *
 * Failure (triggers forced template):
 * - INFRA_ERROR: DB down, API timeout, etc.
 */

import { getToolFailResponse, isRealToolFailure } from '../services/tool-fail-handler.js';
import { logToolExecution, logViolation } from '../services/routing-metrics.js';
import { ToolOutcome, normalizeOutcome } from '../tools/toolResult.js';

/**
 * Apply tool fail policy
 *
 * @param {Object} params
 * @returns {Object|null} Forced response if INFRA_ERROR, null otherwise
 */
export function applyToolFailPolicy(params) {
  const { toolResult, toolName, language, channel, sessionId, executionTime, metrics } = params;

  // Determine outcome type for logging
  const outcomeType = normalizeOutcome(toolResult.outcome) ||
    (toolResult.notFound ? ToolOutcome.NOT_FOUND :
     toolResult.verificationRequired ? ToolOutcome.VERIFICATION_REQUIRED :
     toolResult.validationError ? ToolOutcome.VALIDATION_ERROR :
     toolResult.success ? ToolOutcome.OK : ToolOutcome.INFRA_ERROR);

  // Log tool execution with outcome type
  logToolExecution({
    sessionId,
    toolName,
    success: !isRealToolFailure(toolResult),
    outcome: outcomeType,
    attempts: toolResult.attempts || 1,
    errorType: toolResult.error || null,
    executionTime
  });

  // Check if this is a REAL failure (INFRA_ERROR only)
  if (!isRealToolFailure(toolResult)) {
    // Valid outcome - let AI handle it naturally
    console.log(`✅ [ToolFailPolicy] Outcome ${outcomeType} - AI will handle`);
    return null;
  }

  // INFRA_ERROR - apply forced template policy
  console.error('❌ [ToolFailPolicy] INFRA_ERROR, returning forced template');

  // Log violation
  logViolation('TOOL_FAILURE', {
    sessionId,
    details: {
      tool: toolName,
      error: toolResult.error,
      attempts: toolResult.attempts,
      outcome: outcomeType
    }
  });

  // Get forced response
  const forcedResponse = getToolFailResponse(toolName, language, channel);

  // Update metrics
  if (metrics) {
    metrics.hadToolFailure = true;
    metrics.failedTool = toolName;
  }

  return {
    reply: forcedResponse.reply,
    inputTokens: 0,
    outputTokens: 0,
    hadToolFailure: true,
    failedTool: toolName,
    metadata: {
      ...(forcedResponse.metadata || {}),
      type: 'TOOL_FAILURE',
      tool: toolName,
      forceEnd: forcedResponse.forceEnd,
      outcome: outcomeType
    }
  };
}

export default { applyToolFailPolicy };
