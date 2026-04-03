/**
 * Step 9: Persist Draft & Metrics
 *
 * Saves the generated draft to database and emits metrics.
 */

import prisma from '../../../prismaClient.js';
import { ToolOutcome, normalizeOutcome } from '../../../tools/toolResult.js';

/**
 * Persist draft and metrics
 *
 * @param {Object} ctx - Pipeline context
 * @returns {Promise<Object>} { success, draft }
 */
export async function persistEmailMetrics(ctx) {
  const {
    businessId,
    thread,
    inboundMessage,
    draftContent,
    classification,
    toolResults,
    guardrailsApplied,
    providerDraft,
    providerDraftError,
    assistantMessageMeta,
    responseGrounding = 'GROUNDED',
    metrics,
    errors,
    // RAG-specific context
    ragExamples,
    resolvedSnippets,
    ragSettings
  } = ctx;

  try {
    // ============================================
    // 1. Save Draft to Database
    // ============================================
    console.log('📧 [Persist] Creating draft with:', {
      messageId: inboundMessage?.id,
      threadId: thread?.id,
      businessId,
      contentLength: draftContent?.length,
      hasContent: !!draftContent
    });

    const [archivedDrafts, draft] = await prisma.$transaction([
      prisma.emailDraft.updateMany({
        where: {
          threadId: thread.id,
          status: 'PENDING_REVIEW'
        },
        data: {
          status: 'CANCELLED'
        }
      }),
      prisma.emailDraft.create({
        data: {
          messageId: inboundMessage.id,
          threadId: thread.id,
          businessId,
          generatedContent: draftContent,
          status: 'PENDING_REVIEW',
          // Store metadata as JSON
          metadata: {
            classification,
            toolResults: toolResults?.map(r => ({
              tool: r.toolName,
              outcome: r.outcome,
              hasData: !!r.data
            })),
            guardrails: guardrailsApplied,
            messageType: assistantMessageMeta?.messageType
              || (responseGrounding === 'CLARIFICATION' ? 'clarification' : 'assistant_claim'),
            guardrailAction: assistantMessageMeta?.guardrailAction
              || (responseGrounding === 'CLARIFICATION' ? 'NEED_MIN_INFO_FOR_TOOL' : 'PASS'),
            guardrailReason: assistantMessageMeta?.guardrailReason || null,
            responseGrounding,
            providerDraftId: providerDraft?.draftId || providerDraft?.id,
            providerDraftError,
            // RAG metrics
            ragExamplesUsed: ragExamples?.length || 0,
            snippetsUsed: resolvedSnippets?.length || 0,
            ragEnabled: ragSettings?.useRAG || false,
            snippetsEnabled: ragSettings?.useSnippets || false,
            generatedAt: new Date().toISOString()
          }
        }
      })
    ]);

    if (archivedDrafts?.count > 0) {
      console.log(`📧 [Persist] Archived ${archivedDrafts.count} previous active draft(s)`);
    }

    console.log(`📧 [Persist] Draft saved: ${draft.id}`);

    // ============================================
    // 2. Update Thread Status
    // ============================================
    await prisma.emailThread.update({
      where: { id: thread.id },
      data: { status: 'DRAFT_READY' }
    });

    console.log(`📧 [Persist] Thread status updated to DRAFT_READY`);

    // ============================================
    // 3. Log Metrics
    // ============================================
    await logEmailMetrics({
      businessId,
      threadId: thread.id,
      draftId: draft.id,
      metrics,
      classification,
      toolResults,
      guardrailsApplied,
      responseGrounding,
      errors,
      // RAG metrics
      ragExamples,
      resolvedSnippets,
      ragSettings
    });

    return {
      success: true,
      draft
    };

  } catch (error) {
    console.error('❌ [Persist] Error:', error);

    // Try to at least log the error
    try {
      await logEmailMetrics({
        businessId,
        threadId: thread?.id,
        metrics,
        errors: [...(errors || []), { type: 'PERSIST_ERROR', message: error.message }]
      });
    } catch (logError) {
      console.error('❌ [Persist] Failed to log metrics:', logError);
    }

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Log email generation metrics
 */
async function logEmailMetrics({
  businessId,
  threadId,
  draftId,
  metrics,
  classification,
  toolResults,
  guardrailsApplied,
  responseGrounding = 'GROUNDED',
  errors,
  ragExamples,
  resolvedSnippets,
  ragSettings
}) {
  try {
    // Calculate summary metrics
    const summary = {
      businessId,
      threadId,
      draftId,
      timestamp: new Date().toISOString(),

      // Timing
      totalDuration: metrics?.totalDuration || 0,
      steps: metrics?.steps || {},

      // Classification
      intent: classification?.intent,
      urgency: classification?.urgency,
      needsTools: classification?.needs_tools,

      // Tools
      toolsCalled: toolResults?.map(r => r.toolName) || [],
      toolOutcomes: toolResults?.map(r => r.outcome) || [],
      hadToolSuccess: toolResults?.some(r => normalizeOutcome(r.outcome) === ToolOutcome.OK) || false,
      hadToolFailure: toolResults?.some(r => normalizeOutcome(r.outcome) === ToolOutcome.INFRA_ERROR) || false,

      // Guardrails
      guardrailsApplied: guardrailsApplied?.map(g => g.name) || [],
      guardrailsPassed: guardrailsApplied?.filter(g => g.passed).map(g => g.name) || [],
      guardrailsFailed: guardrailsApplied?.filter(g => !g.passed).map(g => g.name) || [],
      responseGrounding,

      // Tokens
      inputTokens: metrics?.inputTokens || 0,
      outputTokens: metrics?.outputTokens || 0,

      // RAG Metrics
      ragExamplesUsed: ragExamples?.length || 0,
      snippetsUsed: resolvedSnippets?.length || 0,
      ragEnabled: ragSettings?.useRAG || false,
      snippetsEnabled: ragSettings?.useSnippets || false,
      ragLatencyMs: metrics?.steps?.rag || 0,

      // Errors
      hasErrors: errors?.length > 0,
      errorCount: errors?.length || 0,
      errorTypes: errors?.map(e => e.type) || []
    };

    // Log to console (structured logging)
    console.log('📊 [EmailMetrics]', JSON.stringify(summary, null, 2));

    // TODO: Send to metrics service (DataDog, CloudWatch, etc.)
    // await metricsService.emit('email.draft.generated', summary);

    // Store in database for analytics (optional)
    // This could be a separate EmailMetrics table or sent to analytics service

  } catch (error) {
    console.error('Failed to log metrics:', error);
    // Don't throw - metrics logging shouldn't fail the main operation
  }
}

/**
 * Emit specific metric event
 * Can be used for tracking specific events like guardrail violations
 */
export async function emitEmailMetric(eventName, data) {
  try {
    console.log(`📊 [EmailMetric] ${eventName}:`, data);
    // TODO: Send to metrics service
  } catch (error) {
    console.error('Failed to emit metric:', error);
  }
}

export default { persistEmailMetrics, emitEmailMetric };
