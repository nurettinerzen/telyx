/**
 * Email Turn Handler - Draft-Only Orchestrator
 *
 * This is the SINGLE source of truth for email draft generation.
 * Follows the same pattern as WhatsApp/Chat handleTurn but specialized for email.
 *
 * CRITICAL RULES:
 * 1. NEVER auto-send - only create drafts
 * 2. Recipient guard: Draft can only reply to thread From/Reply-To
 * 3. Action-claim guard: LLM cannot claim actions without tool success
 * 4. Tool result contract: Always pass outcome + data + message to LLM
 * 5. Read-only tools: Only lookup tools, no write operations during draft
 *
 * Pipeline:
 * 1. Load Context (business, thread, integration)
 * 2. Fetch Thread (get email history from provider)
 * 3. Classify Email (intent, urgency, needs_tools)
 * 4. Tool Gating (determine which tools are available)
 * 5. Init (no-op — tools called by LLM in Step 6)
 * 6. Generate Draft (LLM generates response + calls tools via function calling)
 * 7. Guardrails (recipient, action-claim, verification)
 * 8. Create Draft (save to provider as draft)
 * 9. Persist & Metrics
 */

import { loadEmailContext } from './steps/01_loadEmailContext.js';
import { fetchThreadMessages } from './steps/02_fetchThread.js';
import { classifyEmail } from './steps/03_classifyEmail.js';
import { gateEmailTools } from './steps/04_toolGating.js';
import { executeEmailToolLoop } from './steps/05_toolLoop.js';
import { generateEmailDraft } from './steps/06_generateDraft.js';
import { applyEmailGuardrails } from './steps/07_guardrails.js';
import { createProviderDraft } from './steps/08_createDraft.js';
import { persistEmailMetrics } from './steps/09_persistAndMetrics.js';

// Production policies
import {
  acquireDraftLock,
  completeDraftLock,
  failDraftLock
} from './policies/idempotencyPolicy.js';
import {
  validateRecipientOwnership,
  stripRecipientMentions,
  buildSafeRecipients
} from './policies/recipientOwnershipPolicy.js';
import { enforceToolRequiredPolicy } from './policies/toolRequiredPolicy.js';
import { preventPIILeak, scanForPII } from './policies/piiPreventionPolicy.js';
import {
  containsChildSafetyViolation,
  getBlockedContentMessage,
  logContentSafetyViolation
} from '../../utils/content-safety.js';
import { ToolOutcome, normalizeOutcome } from '../../tools/toolResult.js';
import { getState, updateState } from '../../services/state-manager.js';

/**
 * Handle email draft generation turn
 *
 * @param {Object} params
 * @param {number} params.businessId - Business ID
 * @param {string} params.threadId - Internal thread ID (from EmailThread table)
 * @param {string} params.messageId - Internal message ID to reply to
 * @param {Object} params.options - Optional settings
 * @returns {Promise<Object>} { draft, metrics, errors }
 */
export async function handleEmailTurn(params) {
  const { businessId, threadId, messageId, options = {} } = params;

  const turnStartTime = Date.now();
  const metrics = {
    businessId,
    threadId,
    messageId,
    turnStartTime,
    steps: {}
  };

  // Pipeline context - passed through all steps
  const ctx = {
    businessId,
    threadId,
    messageId,
    options,
    metrics,

    // Will be populated by steps
    business: null,
    thread: null,
    inboundMessage: null,
    emailIntegration: null,
    threadMessages: [],
    classification: null,
    gatedTools: [],
    toolResults: [],
    draftContent: null,
    guardrailsApplied: [],
    providerDraft: null,
    errors: [],

    // Security context
    lockId: null,              // Idempotency lock ID
    allowedRecipients: null,   // Set by recipient ownership policy
    safeRecipients: null,      // Built by orchestrator, used at send time

    // Regeneration context
    feedback: options.feedback || null,  // User feedback from regenerate action

    // Verification state — loaded from DB per email thread
    emailVerificationState: null
  };

  console.log(`\n📧 [EmailTurn] Starting draft generation for thread ${threadId}`);

  try {
    // ============================================
    // STEP 0: Idempotency Lock (CRITICAL - DB TRANSACTION)
    // ============================================
    const idempotencyStart = Date.now();
    const lockResult = await acquireDraftLock({
      businessId,
      threadId,
      messageId,
      requestParams: { options }
    });

    metrics.steps.idempotency = Date.now() - idempotencyStart;

    if (!lockResult.acquired) {
      console.warn(`🔒 [EmailTurn] Blocked by idempotency: ${lockResult.reason}`);
      return {
        success: false,
        error: lockResult.reason === 'DRAFT_ALREADY_EXISTS'
          ? 'A draft already exists for this message'
          : 'Draft generation is already in progress',
        errorCode: 'IDEMPOTENCY_BLOCKED',
        reason: lockResult.reason,
        existingDraftId: lockResult.existingDraftId,
        metrics
      };
    }

    // Store lockId for later release
    ctx.lockId = lockResult.lockId;
    console.log(`🔒 [EmailTurn] Lock acquired: ${ctx.lockId}`)

    // ============================================
    // STEP 1: Load Context
    // ============================================
    const step1Start = Date.now();
    const contextResult = await loadEmailContext(ctx);

    if (!contextResult.success) {
      console.error('❌ [EmailTurn] Failed to load context:', contextResult.error);
      return {
        success: false,
        error: contextResult.error,
        errorCode: 'CONTEXT_LOAD_FAILED',
        metrics
      };
    }

    metrics.steps.loadContext = Date.now() - step1Start;
    console.log(`✅ [EmailTurn] Context loaded (${metrics.steps.loadContext}ms)`);

    // Load verification state for this email thread (persists across drafts)
    const emailSessionId = `email_${threadId}`;
    try {
      const threadState = await getState(emailSessionId);
      ctx.emailVerificationState = threadState || { verification: { status: 'none' } };

      // Backward compatibility: normalize older verification shape into state.verification.
      if (!ctx.emailVerificationState.verification) {
        ctx.emailVerificationState.verification = {
          status: ctx.emailVerificationState.verificationStatus || 'none',
          pendingField: ctx.emailVerificationState.pendingVerificationField || null,
          anchor: ctx.emailVerificationState.verificationAnchor || null,
          attempts: Number.isFinite(ctx.emailVerificationState.verificationAttempts)
            ? ctx.emailVerificationState.verificationAttempts
            : 0
        };
      }

      console.log('📧 [EmailTurn] Verification state loaded:', {
        status: ctx.emailVerificationState?.verification?.status || 'none',
        pendingField: ctx.emailVerificationState?.verification?.pendingField || null,
        hasAnchor: Boolean(ctx.emailVerificationState?.verification?.anchor),
        attempts: ctx.emailVerificationState?.verification?.attempts || 0
      });
    } catch (stateErr) {
      console.warn('⚠️ [EmailTurn] Failed to load email verification state:', stateErr.message);
      ctx.emailVerificationState = { verification: { status: 'none' } };
    }

    // ============================================
    // STEP 1.5: Recipient Ownership Validation (CRITICAL)
    // ============================================
    const ownershipStart = Date.now();
    const ownershipCheck = await validateRecipientOwnership({
      businessId,
      threadId,
      targetEmail: ctx.customerEmail
    });

    metrics.steps.ownershipValidation = Date.now() - ownershipStart;

    if (!ownershipCheck.valid) {
      console.error(`🚫 [EmailTurn] Recipient ownership failed: ${ownershipCheck.error}`);
      await failDraftLock(ctx.lockId, ownershipCheck.error);
      return {
        success: false,
        error: ownershipCheck.message,
        errorCode: 'RECIPIENT_OWNERSHIP_FAILED',
        reason: ownershipCheck.error,
        requiresManualReview: ownershipCheck.requiresManualReview,
        metrics
      };
    }

    // Store allowed recipients - orchestrator controls these, NOT the LLM
    ctx.allowedRecipients = ownershipCheck.recipients;
    console.log(`✅ [EmailTurn] Recipient ownership validated: ${ownershipCheck.originalSender} (${metrics.steps.ownershipValidation}ms)`);

    // ============================================
    // STEP 2: Fetch Thread Messages
    // ============================================
    const step2Start = Date.now();
    const fetchResult = await fetchThreadMessages(ctx);

    if (!fetchResult.success) {
      console.error('❌ [EmailTurn] Failed to fetch thread:', fetchResult.error);
      return {
        success: false,
        error: fetchResult.error,
        errorCode: 'THREAD_FETCH_FAILED',
        metrics
      };
    }

    metrics.steps.fetchThread = Date.now() - step2Start;
    console.log(`✅ [EmailTurn] Thread fetched: ${ctx.threadMessages.length} messages (${metrics.steps.fetchThread}ms)`);

    // ============================================
    // STEP 2.4: Content Safety (PRE-LLM FILTER)
    // ============================================
    console.log('\n[STEP 2.4] Content safety check (pre-LLM)...');

    // Check inbound message for child safety violations
    const inboundText = ctx.inboundMessage?.textPlain || ctx.inboundMessage?.snippet || '';
    const inboundSubject = ctx.thread?.subject || '';
    const combinedText = `${inboundSubject} ${inboundText}`;

    if (containsChildSafetyViolation(combinedText)) {
      console.error('🚨 [CONTENT_SAFETY] Child safety violation detected in email - BLOCKED');

      // Log violation (WITHOUT logging the actual content)
      logContentSafetyViolation({
        sessionId: `email_${threadId}`,
        channel: 'EMAIL',
        businessId,
        timestamp: new Date().toISOString()
      });

      // Fail the draft lock and return error
      await failDraftLock(ctx.lockId, 'CONTENT_SAFETY_VIOLATION');

      return {
        success: false,
        error: 'This email contains inappropriate content and cannot be processed.',
        errorCode: 'CONTENT_SAFETY_VIOLATION',
        metrics: {
          ...metrics,
          llmCalled: false,
          contentSafetyBlock: true
        }
      };
    }

    console.log('✅ [CONTENT_SAFETY] Email passed safety check');

    // ============================================
    // STEP 2.5: Input PII Scrubbing (CRITICAL)
    // Scrub PII from inbound email BEFORE sending to LLM
    // ============================================
    const inputPiiStart = Date.now();
    let inputPiiCount = 0;

    // Scrub PII from each message in thread before LLM sees it
    ctx.threadMessages = ctx.threadMessages.map(msg => {
      // Only scrub customer content, not our own responses
      if (msg.direction === 'INBOUND' || msg.role === 'customer') {
        const bodyResult = preventPIILeak(msg.body || msg.content, { strict: false });
        const subjectResult = preventPIILeak(msg.subject, { strict: false });

        if (bodyResult.modified || subjectResult.modified) {
          inputPiiCount += (bodyResult.modifications?.length || 0) + (subjectResult.modifications?.length || 0);
        }

        return {
          ...msg,
          body: bodyResult.content,
          content: bodyResult.content,
          subject: subjectResult.content,
          // Keep original for reference (not sent to LLM)
          _originalBody: msg.body || msg.content,
          _originalSubject: msg.subject,
          _piiScrubbed: bodyResult.modified || subjectResult.modified
        };
      }
      return msg;
    });

    // Also scrub the latest inbound message specifically
    if (ctx.inboundMessage) {
      const inboundBodyResult = preventPIILeak(ctx.inboundMessage.body || ctx.inboundMessage.bodyHtml, { strict: false });
      if (inboundBodyResult.modified) {
        ctx.inboundMessage = {
          ...ctx.inboundMessage,
          body: inboundBodyResult.content,
          bodyHtml: inboundBodyResult.content,
          _originalBody: ctx.inboundMessage.body || ctx.inboundMessage.bodyHtml,
          _piiScrubbed: true
        };
        inputPiiCount += inboundBodyResult.modifications?.length || 0;
      }
    }

    metrics.steps.inputPiiScrub = Date.now() - inputPiiStart;
    metrics.inputPiiScrubbed = inputPiiCount;

    if (inputPiiCount > 0) {
      console.log(`🛡️ [EmailTurn] Input PII scrubbed: ${inputPiiCount} items (${metrics.steps.inputPiiScrub}ms)`);
    }

    // ============================================
    // STEP 3: Classify Email
    // ============================================
    const step3Start = Date.now();
    const classifyResult = await classifyEmail(ctx);

    metrics.steps.classify = Date.now() - step3Start;
    metrics.classification = ctx.classification;
    console.log(`✅ [EmailTurn] Classified: ${ctx.classification?.intent} (${metrics.steps.classify}ms)`);

    // ============================================
    // STEP 4: Tool Gating
    // ============================================
    const step4Start = Date.now();
    const gatingResult = await gateEmailTools(ctx);

    metrics.steps.toolGating = Date.now() - step4Start;
    metrics.gatedTools = ctx.gatedTools;
    console.log(`✅ [EmailTurn] Tools gated: ${ctx.gatedTools.length} available (${metrics.steps.toolGating}ms)`);

    // ============================================
    // STEP 5: Tool Loop (Read-Only)
    // ============================================
    const step5Start = Date.now();
    const toolLoopResult = await executeEmailToolLoop(ctx);

    metrics.steps.toolLoop = Date.now() - step5Start;
    console.log(`✅ [EmailTurn] Tool loop init complete (${metrics.steps.toolLoop}ms)`);

    // ============================================
    // STEP 6: Generate Draft
    // ============================================
    const step6Start = Date.now();
    const generateResult = await generateEmailDraft(ctx);

    if (!generateResult.success) {
      console.error('❌ [EmailTurn] Failed to generate draft:', generateResult.error);
      return {
        success: false,
        error: generateResult.error,
        errorCode: 'DRAFT_GENERATION_FAILED',
        metrics
      };
    }

    metrics.steps.generateDraft = Date.now() - step6Start;
    metrics.inputTokens = generateResult.inputTokens;
    metrics.outputTokens = generateResult.outputTokens;
    metrics.toolsCalled = ctx.toolResults.map(r => r.toolName);
    metrics.hadToolSuccess = ctx.toolResults.some(r => normalizeOutcome(r.outcome) === ToolOutcome.OK);
    console.log(`✅ [EmailTurn] Draft generated: ${ctx.toolResults.length} tool calls (${metrics.steps.generateDraft}ms)`);

    // Persist email verification state after tool execution
    if (ctx.emailVerificationState?.verification?.status !== 'none') {
      try {
        await updateState(emailSessionId, ctx.emailVerificationState);
        console.log('📧 [EmailTurn] Verification state persisted:', {
          status: ctx.emailVerificationState?.verification?.status || 'none',
          pendingField: ctx.emailVerificationState?.verification?.pendingField || null,
          hasAnchor: Boolean(ctx.emailVerificationState?.verification?.anchor),
          attempts: ctx.emailVerificationState?.verification?.attempts || 0
        });
      } catch (stateErr) {
        console.warn('⚠️ [EmailTurn] Failed to persist email verification state:', stateErr.message);
      }
    }

    // ============================================
    // STEP 6.1: Tool Result PII Scrubbing
    // Scrub PII from tool results called by LLM in Step 6
    // ============================================
    const toolPiiStart = Date.now();
    let toolPiiCount = 0;

    ctx.toolResults = ctx.toolResults.map(result => {
      if (result.data && typeof result.data === 'object') {
        const scrubbedData = {};
        for (const [key, value] of Object.entries(result.data)) {
          if (typeof value === 'string') {
            const scrubResult = preventPIILeak(value, { strict: false });
            scrubbedData[key] = scrubResult.content;
            if (scrubResult.modified) {
              toolPiiCount += scrubResult.modifications?.length || 0;
            }
          } else {
            scrubbedData[key] = value;
          }
        }
        return {
          ...result,
          data: scrubbedData,
          _originalData: result.data,
          _piiScrubbed: toolPiiCount > 0
        };
      }
      return result;
    });

    metrics.steps.toolPiiScrub = Date.now() - toolPiiStart;
    metrics.toolPiiScrubbed = toolPiiCount;

    if (toolPiiCount > 0) {
      console.log(`🛡️ [EmailTurn] Tool result PII scrubbed: ${toolPiiCount} items (${metrics.steps.toolPiiScrub}ms)`);
    }

    // ============================================
    // STEP 6.2: Tool Required Policy Check (Post-Draft)
    // Validates that tool-required intents had proper tool usage
    // ============================================
    const toolRequiredStart = Date.now();
    const toolRequiredResult = enforceToolRequiredPolicy({
      classification: ctx.classification,
      toolResults: ctx.toolResults,
      language: ctx.language
    });

    metrics.steps.toolRequiredPolicy = Date.now() - toolRequiredStart;
    metrics.toolRequiredEnforced = toolRequiredResult.enforced;

    if (toolRequiredResult.enforced) {
      console.warn(`⚠️ [EmailTurn] Tool required policy enforced (post-draft): ${toolRequiredResult.reason}`);

      if (toolRequiredResult.action === 'NEED_MIN_INFO_FOR_TOOL' || toolRequiredResult.action === 'ASK_VERIFICATION') {
        ctx.draftContent = toolRequiredResult.message;
        ctx.assistantMessageMeta = {
          messageType: 'clarification',
          guardrailAction: 'NEED_MIN_INFO_FOR_TOOL',
          guardrailReason: toolRequiredResult.reason || 'NEED_MIN_INFO_FOR_TOOL'
        };
      } else if (toolRequiredResult.action === 'SYSTEM_ERROR_FALLBACK') {
        ctx.draftContent = toolRequiredResult.message;
        ctx.assistantMessageMeta = {
          messageType: 'system_barrier',
          guardrailAction: 'BLOCK',
          guardrailReason: toolRequiredResult.reason || 'SYSTEM_ERROR'
        };
      }
    }

    ctx.responseGrounding = ctx.responseGrounding || 'GROUNDED';
    if (!ctx.assistantMessageMeta) {
      ctx.assistantMessageMeta = ctx.responseGrounding === 'CLARIFICATION'
        ? {
          messageType: 'clarification',
          guardrailAction: 'NEED_MIN_INFO_FOR_TOOL',
          guardrailReason: null
        }
        : {
          messageType: 'assistant_claim',
          guardrailAction: 'PASS',
          guardrailReason: null
        };
    }
    metrics.responseGrounding = ctx.responseGrounding;

    // ============================================
    // STEP 6.25: Strip Recipient Mentions from Draft
    // LLM CANNOT set recipients - remove any attempts
    // ============================================
    const stripResult = stripRecipientMentions(ctx.draftContent);
    if (stripResult.wasModified) {
      console.warn(`🛡️ [EmailTurn] Stripped recipient mentions from draft:`, stripResult.stripped);
      ctx.draftContent = stripResult.content;
      metrics.recipientStripped = stripResult.stripped;
    }

    // ============================================
    // STEP 6.5: PII Leak Prevention (CRITICAL)
    // ============================================
    const piiStart = Date.now();
    const piiResult = preventPIILeak(ctx.draftContent, {
      strict: true,
      language: ctx.language
    });

    metrics.steps.piiPrevention = Date.now() - piiStart;
    metrics.piiFindings = piiResult.findings?.length || 0;

    if (piiResult.blocked) {
      console.error(`🚫 [EmailTurn] Draft blocked by PII prevention`);
      await failDraftLock(ctx.lockId, 'PII_BLOCKED');
      return {
        success: false,
        error: piiResult.errorMessage,
        errorCode: 'PII_BLOCKED',
        piiFindings: piiResult.findings,
        metrics
      };
    }

    if (piiResult.modified) {
      console.log(`🛡️ [EmailTurn] PII scrubbed: ${piiResult.modifications?.length} changes`);
      ctx.draftContent = piiResult.content;
    }

    // ============================================
    // STEP 7: Guardrails
    // ============================================
    const step7Start = Date.now();
    const guardrailsResult = await applyEmailGuardrails(ctx);

    metrics.steps.guardrails = Date.now() - step7Start;
    metrics.guardrailsApplied = ctx.guardrailsApplied;
    metrics.guardrailBlocked = guardrailsResult.blocked;
    console.log(`✅ [EmailTurn] Guardrails applied: ${ctx.guardrailsApplied.length} checks (${metrics.steps.guardrails}ms)`);

    if (guardrailsResult.blocked) {
      console.warn('⚠️ [EmailTurn] Draft blocked by guardrails:', guardrailsResult.blockReason);
      await failDraftLock(ctx.lockId, guardrailsResult.blockReason);
      return {
        success: false,
        error: guardrailsResult.blockReason,
        errorCode: 'GUARDRAIL_BLOCKED',
        blockedBy: guardrailsResult.blockedBy,
        metrics
      };
    }

    // ============================================
    // STEP 7.5: Build Safe Recipients (Orchestrator Only)
    // Recipients are set HERE, not from LLM output
    // ============================================
    ctx.safeRecipients = buildSafeRecipients(ctx.thread, ctx.inboundMessage);
    console.log(`📧 [EmailTurn] Safe recipients set: To=${ctx.safeRecipients.to}`);

    // ============================================
    // STEP 8: Create Provider Draft (Optional)
    // ============================================
    let providerDraftResult = null;
    if (options.createProviderDraft !== false) {
      const step8Start = Date.now();
      providerDraftResult = await createProviderDraft(ctx);

      metrics.steps.createDraft = Date.now() - step8Start;
      console.log(`✅ [EmailTurn] Provider draft created (${metrics.steps.createDraft}ms)`);
    }

    // ============================================
    // STEP 9: Persist & Metrics
    // ============================================
    const step9Start = Date.now();
    const persistResult = await persistEmailMetrics(ctx);

    metrics.steps.persist = Date.now() - step9Start;
    metrics.totalDuration = Date.now() - turnStartTime;
    console.log(`✅ [EmailTurn] Persisted (${metrics.steps.persist}ms)`);
    console.log(`📧 [EmailTurn] PersistResult:`, {
      success: persistResult.success,
      hasDraft: !!persistResult.draft,
      draftId: persistResult.draft?.id,
      error: persistResult.error
    });

    console.log(`\n📧 [EmailTurn] Complete in ${metrics.totalDuration}ms`);

    // Check if persist failed
    if (!persistResult.success) {
      console.error(`❌ [EmailTurn] Persist failed:`, persistResult.error);
      await failDraftLock(ctx.lockId, persistResult.error || 'Persist failed');
      return {
        success: false,
        error: persistResult.error || 'Failed to save draft',
        errorCode: 'PERSIST_FAILED',
        metrics
      };
    }

    // Mark idempotency lock as complete with draft ID
    await completeDraftLock(ctx.lockId, persistResult.draft?.id);

    // ============================================
    // RETURN SUCCESS
    // ============================================
    return {
      success: true,
      draft: persistResult.draft,
      draftContent: ctx.draftContent,
      providerDraftId: ctx.providerDraft?.id,
      // Orchestrator-controlled recipients (NOT from LLM)
      recipients: ctx.safeRecipients,
      metrics,
      classification: ctx.classification,
      toolsCalled: metrics.toolsCalled,
      toolResults: ctx.toolResults,
      responseGrounding: ctx.responseGrounding,
      guardrailsApplied: ctx.guardrailsApplied,
      toolRequiredEnforced: toolRequiredResult?.enforced || false,
      piiModified: piiResult?.modified || false,
      inputPiiScrubbed: metrics.inputPiiScrubbed > 0,
      toolPiiScrubbed: metrics.toolPiiScrubbed > 0
    };

  } catch (error) {
    console.error('❌ [EmailTurn] Fatal error:', error);

    // Persist to ErrorLog
    import('../../services/errorLogger.js')
      .then(({ logError, ERROR_CATEGORY, SEVERITY }) => {
        logError({
          category: ERROR_CATEGORY.CHAT_ERROR,
          severity: SEVERITY.HIGH,
          message: error?.message,
          error,
          source: 'email/orchestrator',
          businessId: ctx.businessId || null,
          sessionId: ctx.threadId || null,
        }).catch(() => {});
      })
      .catch(() => {});

    // Release idempotency lock
    if (ctx.lockId) {
      await failDraftLock(ctx.lockId, error.message);
    }

    metrics.totalDuration = Date.now() - turnStartTime;
    metrics.error = error.message;

    // Try to persist error metrics
    try {
      await persistEmailMetrics({
        ...ctx,
        errors: [...ctx.errors, { type: 'FATAL', message: error.message }]
      });
    } catch (persistError) {
      console.error('❌ [EmailTurn] Failed to persist error metrics:', persistError);
    }

    return {
      success: false,
      error: error.message,
      errorCode: 'FATAL_ERROR',
      metrics
    };
  }
}

export default { handleEmailTurn };
