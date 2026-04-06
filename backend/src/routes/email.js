/**
 * Email Channel Routes
 * OAuth, Threads, Messages, and Drafts management
 */

import express from 'express';
import crypto from 'crypto';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import { hasEmailInboxAccess, requireEmailInboxAccess } from '../middleware/planGating.js';
import gmailService from '../services/gmail.js';
import outlookService from '../services/outlook.js';
import emailAggregator from '../services/email-aggregator.js';
import emailAI from '../services/email-ai.js';
import { handleEmailTurn } from '../core/email/index.js';
import { onEmailSent } from '../core/email/rag/indexingHooks.js';
import { buildEmailPairs, getPairStatistics } from '../services/email-pair-builder.js';
import { generateOAuthState, validateOAuthState } from '../middleware/oauthState.js';
import { safeRedirect } from '../middleware/redirectWhitelist.js';
import { queueUnifiedResponseTrace } from '../services/trace/responseTraceLogger.js';
import {
  buildEmailWrittenIdempotencyKey,
  commitWrittenInteraction,
  isWrittenUsageBlockError,
  releaseWrittenInteraction,
  reserveWrittenInteraction
} from '../services/writtenUsageService.js';

const router = express.Router();
const EMAIL_OUTBOUND_TTL_MS = 5 * 60 * 1000;

function buildEmailSendLockKey({ draftId = null, threadId = null, content = '', replyToId = null }) {
  if (draftId) {
    return `draft:${draftId}`;
  }

  const contentHash = crypto
    .createHash('sha256')
    .update(String(content || ''))
    .digest('hex')
    .slice(0, 24);

  return `quick:${replyToId || threadId || 'thread'}:${contentHash}`;
}

function buildSyntheticSentMessageId(lockKey) {
  const hash = crypto
    .createHash('sha256')
    .update(String(lockKey || 'email'))
    .digest('hex')
    .slice(0, 24);

  return `local-${hash}`;
}

function getEmailSendLeaseWhere({ businessId, recipientId, lockKey }) {
  return {
    businessId_channel_recipientId_inboundMessageId: {
      businessId,
      channel: 'EMAIL',
      recipientId,
      inboundMessageId: lockKey
    }
  };
}

async function acquireEmailSendLease({ businessId, recipientId, lockKey }) {
  const where = getEmailSendLeaseWhere({ businessId, recipientId, lockKey });
  const expiresAt = new Date(Date.now() + EMAIL_OUTBOUND_TTL_MS);

  const existing = await prisma.outboundMessage.findUnique({ where });
  if (existing) {
    if (existing.sent) {
      return { status: 'duplicate', lease: existing };
    }

    const existingExpiry = existing.expiresAt ? new Date(existing.expiresAt).getTime() : 0;
    if (existingExpiry > Date.now()) {
      return { status: 'in_progress', lease: existing };
    }

    const recycled = await prisma.outboundMessage.update({
      where: { id: existing.id },
      data: {
        sent: false,
        externalId: null,
        expiresAt
      }
    });

    return { status: 'acquired', lease: recycled };
  }

  try {
    const lease = await prisma.outboundMessage.create({
      data: {
        businessId,
        channel: 'EMAIL',
        recipientId,
        inboundMessageId: lockKey,
        sent: false,
        externalId: null,
        expiresAt
      }
    });

    return { status: 'acquired', lease };
  } catch (error) {
    const recovered = await prisma.outboundMessage.findUnique({ where });
    if (recovered?.sent) return { status: 'duplicate', lease: recovered };
    if (recovered) return { status: 'in_progress', lease: recovered };
    throw error;
  }
}

async function markEmailSendLeaseSent(leaseId, externalId = null) {
  if (!leaseId) return;

  await prisma.outboundMessage.update({
    where: { id: leaseId },
    data: {
      sent: true,
      externalId: externalId || null,
      expiresAt: new Date(Date.now() + EMAIL_OUTBOUND_TTL_MS)
    }
  });
}

async function releaseEmailSendLease(leaseId) {
  if (!leaseId) return;

  await prisma.outboundMessage.delete({
    where: { id: leaseId }
  }).catch(() => undefined);
}

async function getSubscriptionForWrittenUsage(businessId) {
  if (!businessId) return null;

  return prisma.subscription.findUnique({
    where: { businessId },
    include: {
      business: {
        select: {
          country: true
        }
      }
    }
  });
}

function buildWrittenUsageErrorResponse(error) {
  const status = error?.code === 'INSUFFICIENT_BALANCE' ? 402 : 403;
  return {
    status,
    body: {
      error: error?.message || 'Written usage is not available',
      code: error?.code || 'WRITTEN_USAGE_BLOCKED'
    }
  };
}

async function persistOutboundEmail({
  businessId,
  thread,
  draft = null,
  plainContent,
  htmlContent,
  integrationEmail,
  businessName,
  subject,
  messageId,
  classification = null
}) {
  const sentAt = new Date();

  await prisma.emailMessage.upsert({
    where: {
      threadId_messageId: {
        threadId: thread.id,
        messageId
      }
    },
    update: {
      direction: 'OUTBOUND',
      fromEmail: integrationEmail,
      fromName: businessName || null,
      toEmail: thread.customerEmail,
      subject,
      bodyText: plainContent,
      bodyHtml: htmlContent,
      status: 'SENT',
      sentAt,
      isDraft: false
    },
    create: {
      threadId: thread.id,
      messageId,
      direction: 'OUTBOUND',
      fromEmail: integrationEmail,
      fromName: businessName || null,
      toEmail: thread.customerEmail,
      subject,
      bodyText: plainContent,
      bodyHtml: htmlContent,
      status: 'SENT',
      sentAt
    }
  });

  const writes = [
    prisma.emailThread.update({
      where: { id: thread.id },
      data: { status: 'REPLIED' }
    })
  ];

  if (draft?.id) {
    writes.push(
      prisma.emailDraft.update({
        where: { id: draft.id },
        data: {
          status: 'SENT',
          sentAt,
          sentMessageId: messageId
        }
      })
    );
  }

  await Promise.all(writes);

  onEmailSent({
    messageId,
    threadId: thread.id,
    businessId,
    classification
  }).catch(err => {
    console.error('RAG indexing failed (non-blocking):', err);
  });
}

function deriveAdminDraftVerificationState(tools = []) {
  const normalizedOutcomes = (Array.isArray(tools) ? tools : [])
    .map(item => String(item?.outcome || '').toUpperCase())
    .filter(Boolean);

  if (normalizedOutcomes.includes('VERIFICATION_REQUIRED')) return 'requested';
  if (normalizedOutcomes.includes('DENIED') || normalizedOutcomes.includes('VALIDATION_ERROR')) return 'failed';

  const hasVerifiedLookup = (Array.isArray(tools) ? tools : []).some((item) => {
    const name = String(item?.toolName || item?.name || '').toLowerCase();
    const outcome = String(item?.outcome || '').toUpperCase();
    if (outcome !== 'OK') return false;
    return name === 'customer_data_lookup';
  });
  if (hasVerifiedLookup) return 'passed';

  return 'none';
}

function queueAdminDraftTrace({
  req,
  threadId,
  messageId,
  result
}) {
  try {
    const isSuccess = result?.success === true;
    const classification = result?.classification || {};
    const tools = Array.isArray(result?.toolResults)
      ? result.toolResults
      : Array.isArray(result?.toolsCalled)
        ? result.toolsCalled.map(name => ({ toolName: name, outcome: 'OK', data: {} }))
        : [];
    const verificationState = deriveAdminDraftVerificationState(tools);

    const postprocessors = [];
    if (result?.piiModified) postprocessors.push('pii_output_scrub');
    if (result?.inputPiiScrubbed) postprocessors.push('pii_input_scrub');
    if (result?.toolPiiScrubbed) postprocessors.push('tool_pii_scrub');
    if (Array.isArray(result?.metrics?.recipientStripped) && result.metrics.recipientStripped.length > 0) {
      postprocessors.push('strip_recipient_mentions');
    }

    queueUnifiedResponseTrace({
      context: {
        channel: 'ADMIN_DRAFT',
        businessId: req.businessId,
        userId: req.userId ?? null,
        sessionId: threadId,
        messageId: messageId || null,
        requestId: req.requestId || null,
        language: req.user?.business?.language || 'TR',
        verificationState,
        responseSource: isSuccess
          ? (result?.toolRequiredEnforced ? 'TEMPLATE' : 'LLM')
          : 'FALLBACK',
        originId: isSuccess ? 'email.handleEmailTurn' : 'email.handleEmailTurn.error',
        llmUsed: Number(result?.metrics?.inputTokens || 0) > 0 || Number(result?.metrics?.outputTokens || 0) > 0,
        llmBypassReason: isSuccess ? null : 'EMAIL_TURN_FAILED',
        guardrailAction: isSuccess ? 'PASS' : 'BLOCK',
        guardrailReason: isSuccess ? null : (result?.errorCode || 'EMAIL_TURN_ERROR'),
        responseGrounding: result?.responseGrounding || null,
        messageType: result?.assistantMessageMeta?.messageType || null,
        guardrailsApplied: result?.assistantMessageMeta?.guardrailAction
          ? [result.assistantMessageMeta.guardrailAction]
          : [],
        latencyMs: Number(result?.metrics?.totalDuration || 0)
      },
      llmMeta: {
        called: Number(result?.metrics?.inputTokens || 0) > 0 || Number(result?.metrics?.outputTokens || 0) > 0,
        model: null,
        status: isSuccess ? 'success' : 'error',
        llm_bypass_reason: isSuccess ? null : 'EMAIL_TURN_FAILED'
      },
      plan: {
        intent: classification?.intent || (isSuccess ? 'email_draft' : 'email_error'),
        slots: {},
        tool_candidates: [],
        tool_selected: tools[0]?.toolName || null,
        confidence: Number.isFinite(classification?.confidence) ? classification.confidence : null
      },
      tools: tools.map(item => ({
        name: item.toolName || item.name || 'unknown_tool',
        input: item.args || {},
        outcome: item.outcome || 'OK',
        latency_ms: item.latencyMs || 0,
        retry_count: item.retryCount || 0,
        error_code: item.errorCode || null
      })),
      guardrail: {
        action: isSuccess ? 'PASS' : 'BLOCK',
        reason: isSuccess ? null : (result?.errorCode || 'EMAIL_TURN_ERROR')
      },
      postprocessors,
      finalResponse: isSuccess
        ? (result?.draftContent || result?.draft?.generatedContent || '')
        : (result?.error || 'Draft generation failed')
    });
  } catch (traceError) {
    console.error('⚠️ [Email] Failed to queue unified trace:', traceError.message);
  }
}

// ==================== OAUTH ROUTES ====================

/**
 * Gmail OAuth - Get Auth URL
 * GET /api/email/gmail/auth
 */
router.get('/gmail/auth', authenticateToken, async (req, res) => {
  try {
    // Check if already connected to a different provider
    const existing = await prisma.emailIntegration.findUnique({
      where: { businessId: req.businessId }
    });

    if (existing && existing.connected && existing.provider !== 'GMAIL') {
      return res.status(400).json({
        error: 'Another email provider is already connected. Please disconnect it first.'
      });
    }

    // SECURITY: Generate cryptographically secure state token with PKCE (CSRF + code injection protection)
    const { state, pkce } = await generateOAuthState(req.businessId, 'gmail', {}, true);
    const authUrl = gmailService.getAuthUrl(state, pkce.challenge);

    res.json({ authUrl });
  } catch (error) {
    console.error('Gmail auth error:', error);
    res.status(500).json({ error: 'Failed to generate Gmail auth URL' });
  }
});

/**
 * Gmail OAuth Callback
 * GET /api/email/gmail/callback
 */
router.get('/gmail/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      console.error('Gmail OAuth error:', oauthError);
      return safeRedirect(res, `/dashboard/integrations?error=gmail-denied`);
    }

    if (!code || !state) {
      console.error('Gmail callback: missing code or state');
      return safeRedirect(res, `/dashboard/integrations?error=gmail-invalid`);
    }

    // SECURITY: Validate state token (CSRF protection)
    const validation = await validateOAuthState(state, null, 'gmail');

    if (!validation.valid) {
      console.error('❌ Gmail callback: Invalid state token:', validation.error);
      return safeRedirect(res, `/dashboard/integrations?error=gmail-csrf`);
    }

    const businessId = validation.businessId;
    const codeVerifier = validation.metadata?.codeVerifier;

    // SECURITY: Use PKCE verifier to exchange code for tokens
    await gmailService.handleCallback(code, businessId, codeVerifier);

    console.log(`✅ Gmail connected for business ${businessId}`);

    // Trigger style analysis in background
    import('../services/email-style-analyzer.js').then((module) => {
      module.analyzeWritingStyle(businessId).catch((err) => {
        console.error('Background style analysis failed:', err);
      });
    });

    safeRedirect(res, `/dashboard/integrations?success=gmail`);
  } catch (error) {
    console.error('❌ Gmail callback error:', error);
    safeRedirect(res, `/dashboard/integrations?error=gmail-failed`);
  }
});

/**
 * Outlook OAuth - Get Auth URL
 * GET /api/email/outlook/auth
 */
router.get('/outlook/auth', authenticateToken, async (req, res) => {
  try {
    // Check if already connected to a different provider
    const existing = await prisma.emailIntegration.findUnique({
      where: { businessId: req.businessId }
    });

    if (existing && existing.connected && existing.provider !== 'OUTLOOK') {
      return res.status(400).json({
        error: 'Another email provider is already connected. Please disconnect it first.'
      });
    }

    // SECURITY: Generate cryptographically secure state token with PKCE (CSRF + code injection protection)
    const { state, pkce } = await generateOAuthState(req.businessId, 'outlook', {}, true);
    const authUrl = outlookService.getAuthUrl(state, pkce.challenge);

    res.json({ authUrl });
  } catch (error) {
    console.error('Outlook auth error:', error);
    res.status(500).json({ error: 'Failed to generate Outlook auth URL' });
  }
});

/**
 * Outlook OAuth Callback
 * GET /api/email/outlook/callback
 */
router.get('/outlook/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      console.error('Outlook OAuth error:', oauthError);
      return safeRedirect(res, `/dashboard/integrations?error=outlook-denied`);
    }

    if (!code || !state) {
      console.error('Outlook callback: missing code or state');
      return safeRedirect(res, `/dashboard/integrations?error=outlook-invalid`);
    }

    // SECURITY: Validate state token (CSRF protection)
    const validation = await validateOAuthState(state, null, 'outlook');

    if (!validation.valid) {
      console.error('❌ Outlook callback: Invalid state token:', validation.error);
      return safeRedirect(res, `/dashboard/integrations?error=outlook-csrf`);
    }

    const businessId = validation.businessId;
    const codeVerifier = validation.metadata?.codeVerifier;

    // SECURITY: Use PKCE verifier to exchange code for tokens
    await outlookService.handleCallback(code, businessId, codeVerifier);

    console.log(`✅ Outlook connected for business ${businessId}`);

    // Trigger style analysis in background
    import('../services/email-style-analyzer.js').then((module) => {
      module.analyzeWritingStyle(businessId).catch((err) => {
        console.error('Background style analysis failed:', err);
      });
    });

    safeRedirect(res, `/dashboard/integrations?success=outlook`);
  } catch (error) {
    console.error('❌ Outlook callback error:', error);
    safeRedirect(res, `/dashboard/integrations?error=outlook-failed`);
  }
});

/**
 * Disconnect Email
 * POST /api/email/disconnect
 */
router.post('/disconnect', authenticateToken, async (req, res) => {
  try {
    await emailAggregator.disconnect(req.businessId);
    res.json({ success: true, message: 'Email disconnected successfully' });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect email' });
  }
});

/**
 * Get Email Connection Status
 * GET /api/email/status
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const status = await emailAggregator.getStatus(req.businessId);
    const subscription = await prisma.subscription.findUnique({
      where: { businessId: req.businessId },
      select: { plan: true, status: true }
    });

    const hasInboxAccess = Boolean(status.connected && hasEmailInboxAccess(subscription));

    res.json({
      ...status,
      hasInboxAccess,
      currentPlan: subscription?.plan || null,
      requiredPlan: hasInboxAccess ? null : 'PAYG',
      subscriptionStatus: subscription?.status || null,
    });
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({ error: 'Failed to get email status' });
  }
});

// ==================== THREAD ROUTES ====================

/**
 * Get Thread List
 * GET /api/email/threads
 * P1: PRO+ gating for email usage
 */
router.get('/threads', authenticateToken, requireEmailInboxAccess, async (req, res) => {
  try {
    const { status, limit = 20, offset = 0, search } = req.query;

    const { threads, total } = await emailAggregator.getThreadsFromDb(
      req.businessId,
      {
        status,
        limit: parseInt(limit),
        offset: parseInt(offset),
        search: search || null
      }
    );

    res.json({
      threads,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get threads error:', error);
    res.status(500).json({ error: 'Failed to get threads' });
  }
});

/**
 * Get Single Thread
 * GET /api/email/threads/:threadId
 */
router.get('/threads/:threadId', authenticateToken, requireEmailInboxAccess, async (req, res) => {
  try {
    const thread = await emailAggregator.getThreadFromDb(
      req.businessId,
      req.params.threadId
    );

    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    res.json(thread);
  } catch (error) {
    console.error('Get thread error:', error);
    res.status(500).json({ error: 'Failed to get thread' });
  }
});

/**
 * Close Thread
 * POST /api/email/threads/:threadId/close
 */
router.post('/threads/:threadId/close', authenticateToken, requireEmailInboxAccess, async (req, res) => {
  try {
    const thread = await prisma.emailThread.findFirst({
      where: {
        id: req.params.threadId,
        businessId: req.businessId
      }
    });

    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    await emailAggregator.updateThreadStatus(thread.id, 'CLOSED');

    res.json({ success: true, message: 'Thread closed' });
  } catch (error) {
    console.error('Close thread error:', error);
    res.status(500).json({ error: 'Failed to close thread' });
  }
});

/**
 * Update Thread Status (Manual Tagging)
 * PATCH /api/email/threads/:threadId
 * Allows user to manually set thread status (e.g., NO_REPLY_NEEDED)
 */
router.patch('/threads/:threadId', authenticateToken, requireEmailInboxAccess, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['PENDING_REPLY', 'NO_REPLY_NEEDED', 'CLOSED', 'SPAM'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const thread = await prisma.emailThread.findFirst({
      where: {
        id: req.params.threadId,
        businessId: req.businessId
      }
    });

    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    await emailAggregator.updateThreadStatus(thread.id, status);

    res.json({ success: true, message: `Thread status updated to ${status}` });
  } catch (error) {
    console.error('Update thread status error:', error);
    res.status(500).json({ error: 'Failed to update thread status' });
  }
});

// ==================== DRAFT ROUTES ====================

/**
 * Get Pending Drafts
 * GET /api/email/drafts
 */
router.get('/drafts', authenticateToken, requireEmailInboxAccess, async (req, res) => {
  try {
    const drafts = await emailAI.getPendingDrafts(req.businessId);
    res.json({ drafts });
  } catch (error) {
    console.error('Get drafts error:', error);
    res.status(500).json({ error: 'Failed to get drafts' });
  }
});

/**
 * Get Single Draft
 * GET /api/email/drafts/:draftId
 */
router.get('/drafts/:draftId', authenticateToken, requireEmailInboxAccess, async (req, res) => {
  try {
    const draft = await emailAI.getDraft(req.params.draftId);

    if (!draft || draft.businessId !== req.businessId) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    res.json(draft);
  } catch (error) {
    console.error('Get draft error:', error);
    res.status(500).json({ error: 'Failed to get draft' });
  }
});

/**
 * Update Draft Content
 * PUT /api/email/drafts/:draftId
 */
router.put('/drafts/:draftId', authenticateToken, requireEmailInboxAccess, async (req, res) => {
  try {
    const { content } = req.body;

    const draft = await emailAI.getDraft(req.params.draftId);

    if (!draft || draft.businessId !== req.businessId) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const updated = await emailAI.updateDraft(req.params.draftId, content);
    res.json(updated);
  } catch (error) {
    console.error('Update draft error:', error);
    res.status(500).json({ error: 'Failed to update draft' });
  }
});

/**
 * Approve Draft
 * POST /api/email/drafts/:draftId/approve
 */
router.post('/drafts/:draftId/approve', authenticateToken, requireEmailInboxAccess, async (req, res) => {
  try {
    const draft = await emailAI.getDraft(req.params.draftId);

    if (!draft || draft.businessId !== req.businessId) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const approved = await emailAI.approveDraft(req.params.draftId, req.userId);
    res.json(approved);
  } catch (error) {
    console.error('Approve draft error:', error);
    res.status(500).json({ error: 'Failed to approve draft' });
  }
});

/**
 * Convert plain text to HTML with proper formatting
 * @param {string} text - Plain text content
 * @returns {string} - HTML formatted content
 */
function textToHtml(text) {
  if (!text) return '';
  // Escape HTML entities
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  // Convert newlines to <br> tags
  html = html.replace(/\n/g, '<br>');

  return html;
}

/**
 * Build HTML email with styling and signature
 * @param {string} bodyContent - The email body content (plain text)
 * @param {object} business - Business object with name
 * @param {string} senderEmail - Sender's email address
 * @returns {string} - Full HTML email
 */
function buildHtmlEmail(bodyContent, business, senderEmail) {
  const htmlBody = textToHtml(bodyContent);
  const businessName = business?.name || '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .email-body { padding: 0; }
    .signature { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
    .signature-name { font-weight: 600; color: #333; }
  </style>
</head>
<body>
  <div class="email-body">
    ${htmlBody}
  </div>
  <div class="signature">
    <p class="signature-name">${businessName}</p>
    <p>${senderEmail}</p>
  </div>
</body>
</html>`.trim();
}

function buildReplySubject(subject) {
  let sanitized = String(subject || '(no subject)')
    .replace(/[\r\n]/g, ' ')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim();

  if (!sanitized) {
    sanitized = '(no subject)';
  }

  if (!/^re:/i.test(sanitized)) {
    sanitized = `Re: ${sanitized}`;
  }

  return sanitized;
}

function buildReplyReferences({ references, internetMessageId }) {
  const chain = [];

  if (references) {
    chain.push(
      ...String(references)
        .split(/\s+/)
        .map(part => part.trim())
        .filter(Boolean)
    );
  }

  if (internetMessageId) {
    chain.push(String(internetMessageId).trim());
  }

  return Array.from(new Set(chain)).join(' ') || null;
}

async function resolveReplyOptions({ businessId, thread, parentMessage = null }) {
  const options = {
    threadId: thread.threadId,
    conversationId: thread.threadId
  };

  let replyTarget = parentMessage;
  if (!replyTarget) {
    replyTarget = await prisma.emailMessage.findFirst({
      where: {
        threadId: thread.id,
        direction: 'INBOUND'
      },
      orderBy: [
        { receivedAt: 'desc' },
        { createdAt: 'desc' }
      ]
    });
  }

  if (!replyTarget?.messageId) {
    return options;
  }

  options.replyToId = replyTarget.messageId;

  try {
    const providerMessage = await emailAggregator.getMessage(businessId, replyTarget.messageId);
    const internetMessageId = providerMessage?.internetMessageId || null;
    const references = buildReplyReferences({
      references: providerMessage?.references || null,
      internetMessageId
    });

    if (internetMessageId) {
      options.inReplyTo = internetMessageId;
    }

    if (references) {
      options.references = references;
    }
  } catch (error) {
    console.warn(`⚠️ [Email] Failed to resolve reply headers for message ${replyTarget.messageId}:`, error.message);
  }

  return options;
}

/**
 * Send Draft
 * POST /api/email/drafts/:draftId/send
 */
router.post('/drafts/:draftId/send', authenticateToken, async (req, res) => {
  try {
    const draft = await emailAI.getDraft(req.params.draftId);

    if (!draft || draft.businessId !== req.businessId) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const thread = draft.thread;
    const plainContent = draft.editedContent || draft.generatedContent;

    // Get the email integration to find connected email
    const integration = await emailAggregator.getIntegration(req.businessId);

    // Get business for signature
    const business = await prisma.business.findUnique({
      where: { id: req.businessId }
    });

    // Convert plain text to HTML with signature
    const htmlContent = buildHtmlEmail(plainContent, business, integration.email);

    const replySubject = buildReplySubject(thread.subject);
    const options = await resolveReplyOptions({
      businessId: req.businessId,
      thread,
      parentMessage: draft.message || null
    });
    const sendLockKey = buildEmailSendLockKey({ draftId: draft.id });
    const leaseResult = await acquireEmailSendLease({
      businessId: req.businessId,
      recipientId: thread.customerEmail,
      lockKey: sendLockKey
    });
    const fallbackMessageId = buildSyntheticSentMessageId(sendLockKey);
    const meteringSubscription = await getSubscriptionForWrittenUsage(req.businessId);
    const writtenUsageKey = meteringSubscription?.id
      ? buildEmailWrittenIdempotencyKey({
        subscriptionId: meteringSubscription.id,
        lockKey: sendLockKey,
        threadId: thread.id
      })
      : null;

    if (leaseResult.status === 'in_progress') {
      return res.status(409).json({
        error: 'Email send is already in progress',
        code: 'EMAIL_SEND_IN_PROGRESS'
      });
    }

    if (leaseResult.status === 'duplicate') {
      const duplicateMessageId = leaseResult.lease?.externalId || draft.sentMessageId || fallbackMessageId;

      if (writtenUsageKey) {
        await commitWrittenInteraction(writtenUsageKey, {
          duplicate: true,
          messageId: duplicateMessageId,
          channel: 'EMAIL'
        }).catch(() => null);
      }

      try {
        await persistOutboundEmail({
          businessId: req.businessId,
          thread,
          draft,
          plainContent,
          htmlContent,
          integrationEmail: integration.email,
          businessName: business?.name || null,
          subject: replySubject,
          messageId: duplicateMessageId,
          classification: draft.classification || draft.metadata?.classification || null
        });

        return res.json({
          success: true,
          duplicate: true,
          message: 'Email already sent',
          messageId: duplicateMessageId
        });
      } catch (persistError) {
        console.error('Draft duplicate sync error:', persistError);
        return res.json({
          success: true,
          duplicate: true,
          stateSyncPending: true,
          message: 'Email was already sent; local sync is pending',
          messageId: duplicateMessageId
        });
      }
    }

    if (writtenUsageKey) {
      try {
        await reserveWrittenInteraction({
          subscriptionId: meteringSubscription.id,
          channel: 'EMAIL',
          idempotencyKey: writtenUsageKey,
          metadata: {
            threadId: thread.id,
            draftId: draft.id,
            customerEmail: thread.customerEmail
          }
        });
      } catch (error) {
        await releaseEmailSendLease(leaseResult.lease?.id);
        if (isWrittenUsageBlockError(error)) {
          const response = buildWrittenUsageErrorResponse(error);
          return res.status(response.status).json(response.body);
        }
        throw error;
      }
    }

    // Send the email (with HTML content)
    let result;
    try {
      result = await emailAggregator.sendMessage(
        req.businessId,
        thread.customerEmail,
        replySubject,
        htmlContent,
        options
      );
    } catch (sendError) {
      if (writtenUsageKey) {
        await releaseWrittenInteraction(writtenUsageKey, 'EMAIL_SEND_FAILED').catch(() => null);
      }
      await releaseEmailSendLease(leaseResult.lease?.id);
      throw sendError;
    }

    const finalMessageId = result.messageId || fallbackMessageId;

    try {
      await markEmailSendLeaseSent(leaseResult.lease?.id, finalMessageId);
    } catch (leaseError) {
      console.error('Draft send lease mark error:', leaseError);
    }

    try {
      if (writtenUsageKey) {
        await commitWrittenInteraction(writtenUsageKey, {
          channel: 'EMAIL',
          messageId: finalMessageId,
          provider: 'email'
        });
      }

      await persistOutboundEmail({
        businessId: req.businessId,
        thread,
        draft,
        plainContent,
        htmlContent,
        integrationEmail: integration.email,
        businessName: business?.name || null,
        subject: replySubject,
        messageId: finalMessageId,
        classification: draft.classification || draft.metadata?.classification || null
      });
    } catch (persistError) {
      console.error('Send draft persistence error:', persistError);
      return res.json({
        success: true,
        stateSyncPending: true,
        message: 'Email sent; local sync is pending',
        messageId: finalMessageId
      });
    }

    res.json({
      success: true,
      message: 'Email sent successfully',
      messageId: finalMessageId
    });
  } catch (error) {
    console.error('Send draft error:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

/**
 * Quick Reply — send without creating a draft
 * POST /api/email/threads/:threadId/quick-reply
 */
router.post('/threads/:threadId/quick-reply', authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content is required' });

    const thread = await prisma.emailThread.findFirst({
      where: { id: req.params.threadId, businessId: req.businessId }
    });
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    const integration = await emailAggregator.getIntegration(req.businessId);
    const business = await prisma.business.findUnique({ where: { id: req.businessId } });
    const htmlContent = buildHtmlEmail(content, business, integration.email);
    const replySubject = buildReplySubject(thread.subject);
    const replyOptions = await resolveReplyOptions({
      businessId: req.businessId,
      thread
    });
    const sendLockKey = buildEmailSendLockKey({
      threadId: thread.id,
      content,
      replyToId: replyOptions.replyToId || null
    });
    const leaseResult = await acquireEmailSendLease({
      businessId: req.businessId,
      recipientId: thread.customerEmail,
      lockKey: sendLockKey
    });
    const fallbackMessageId = buildSyntheticSentMessageId(sendLockKey);
    const meteringSubscription = await getSubscriptionForWrittenUsage(req.businessId);
    const writtenUsageKey = meteringSubscription?.id
      ? buildEmailWrittenIdempotencyKey({
        subscriptionId: meteringSubscription.id,
        lockKey: sendLockKey,
        threadId: thread.id
      })
      : null;

    console.log('📧 [Email Quick Reply] Request received', {
      businessId: req.businessId,
      threadId: thread.id,
      replyToId: replyOptions.replyToId || null,
      lockKey: sendLockKey
    });

    if (leaseResult.status === 'in_progress') {
      console.warn('📧 [Email Quick Reply] Duplicate in-progress send blocked', {
        businessId: req.businessId,
        threadId: thread.id,
        lockKey: sendLockKey
      });
      return res.status(409).json({
        error: 'Email send is already in progress',
        code: 'EMAIL_SEND_IN_PROGRESS'
      });
    }

    if (leaseResult.status === 'duplicate') {
      const duplicateMessageId = leaseResult.lease?.externalId || fallbackMessageId;
      console.warn('📧 [Email Quick Reply] Duplicate send replayed as success', {
        businessId: req.businessId,
        threadId: thread.id,
        messageId: duplicateMessageId,
        lockKey: sendLockKey
      });

      if (writtenUsageKey) {
        await commitWrittenInteraction(writtenUsageKey, {
          duplicate: true,
          messageId: duplicateMessageId,
          channel: 'EMAIL'
        }).catch(() => null);
      }

      try {
        await persistOutboundEmail({
          businessId: req.businessId,
          thread,
          plainContent: content,
          htmlContent,
          integrationEmail: integration.email,
          businessName: business?.name || null,
          subject: replySubject,
          messageId: duplicateMessageId
        });

        return res.json({
          success: true,
          duplicate: true,
          message: 'Email already sent',
          messageId: duplicateMessageId
        });
      } catch (persistError) {
        console.error('Quick reply duplicate sync error:', persistError);
        return res.json({
          success: true,
          duplicate: true,
          stateSyncPending: true,
          message: 'Email was already sent; local sync is pending',
          messageId: duplicateMessageId
        });
      }
    }

    if (writtenUsageKey) {
      try {
        await reserveWrittenInteraction({
          subscriptionId: meteringSubscription.id,
          channel: 'EMAIL',
          idempotencyKey: writtenUsageKey,
          metadata: {
            threadId: thread.id,
            quickReply: true,
            customerEmail: thread.customerEmail
          }
        });
      } catch (error) {
        await releaseEmailSendLease(leaseResult.lease?.id);
        if (isWrittenUsageBlockError(error)) {
          const response = buildWrittenUsageErrorResponse(error);
          return res.status(response.status).json(response.body);
        }
        throw error;
      }
    }

    let result;
    try {
      result = await emailAggregator.sendMessage(
        req.businessId,
        thread.customerEmail,
        replySubject,
        htmlContent,
        replyOptions
      );
      console.log('📧 [Email Quick Reply] Provider send succeeded', {
        businessId: req.businessId,
        threadId: thread.id,
        providerMessageId: result?.messageId || null
      });
    } catch (sendError) {
      if (writtenUsageKey) {
        await releaseWrittenInteraction(writtenUsageKey, 'EMAIL_SEND_FAILED').catch(() => null);
      }
      await releaseEmailSendLease(leaseResult.lease?.id);
      throw sendError;
    }

    const finalMessageId = result.messageId || fallbackMessageId;

    try {
      await markEmailSendLeaseSent(leaseResult.lease?.id, finalMessageId);
    } catch (leaseError) {
      console.error('Quick reply lease mark error:', leaseError);
    }

    try {
      if (writtenUsageKey) {
        await commitWrittenInteraction(writtenUsageKey, {
          channel: 'EMAIL',
          messageId: finalMessageId,
          provider: 'email'
        });
      }

      await persistOutboundEmail({
        businessId: req.businessId,
        thread,
        plainContent: content,
        htmlContent,
        integrationEmail: integration.email,
        businessName: business?.name || null,
        subject: replySubject,
        messageId: finalMessageId
      });
    } catch (persistError) {
      console.error('📧 [Email Quick Reply] Provider sent but local persistence failed:', {
        businessId: req.businessId,
        threadId: thread.id,
        messageId: finalMessageId,
        error: persistError?.message || String(persistError)
      });
      return res.json({
        success: true,
        stateSyncPending: true,
        message: 'Email sent; local sync is pending',
        messageId: finalMessageId
      });
    }

    res.json({ success: true, messageId: finalMessageId });
  } catch (error) {
    console.error('📧 [Email Quick Reply] Request failed before success response:', {
      threadId: req.params.threadId,
      businessId: req.businessId,
      error: error?.message || String(error)
    });
    res.status(500).json({ error: 'Failed to send email' });
  }
});

/**
 * Reject Draft
 * POST /api/email/drafts/:draftId/reject
 */
router.post('/drafts/:draftId/reject', authenticateToken, async (req, res) => {
  try {
    const draft = await emailAI.getDraft(req.params.draftId);

    if (!draft || draft.businessId !== req.businessId) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const rejected = await emailAI.rejectDraft(req.params.draftId, req.userId);
    res.json(rejected);
  } catch (error) {
    console.error('Reject draft error:', error);
    res.status(500).json({ error: 'Failed to reject draft' });
  }
});

/**
 * Generate Draft Manually for a Thread (NEW ORCHESTRATOR)
 * POST /api/email/threads/:threadId/generate-draft
 *
 * Uses the new email orchestrator pipeline with:
 * - Classification
 * - Tool gating (read-only)
 * - Guardrails (recipient, action-claim, verification)
 * - Provider draft creation
 */
router.post('/threads/:threadId/generate-draft', authenticateToken, async (req, res) => {
  try {
    const { threadId } = req.params;
    const { messageId, createProviderDraft = true } = req.body;

    // Validate thread exists and belongs to business
    const thread = await prisma.emailThread.findFirst({
      where: {
        id: threadId,
        businessId: req.businessId
      }
    });

    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Check if draft already exists for the latest inbound message
    const latestInbound = await prisma.emailMessage.findFirst({
      where: {
        threadId: thread.id,
        direction: 'INBOUND'
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!latestInbound) {
      return res.status(400).json({ error: 'No inbound message found in this thread' });
    }

    const targetMessageId = messageId || latestInbound.id;

    // Archive older pending drafts for deterministic single-active-draft behavior.
    const archivedDrafts = await prisma.emailDraft.updateMany({
      where: {
        threadId: thread.id,
        status: 'PENDING_REVIEW'
      },
      data: { status: 'CANCELLED' }
    });
    if (archivedDrafts.count > 0) {
      console.log(`[Email] Archived ${archivedDrafts.count} stale pending draft(s) before generate`);
    }

    // Clear stale COMPLETED/FAILED lock so "generate again" can create a fresh draft.
    // Keep IN_PROGRESS lock untouched to preserve concurrency safety.
    await prisma.emailDraftLock.deleteMany({
      where: {
        businessId: req.businessId,
        threadId: thread.id,
        sourceMessageId: targetMessageId,
        status: { in: ['COMPLETED', 'FAILED'] }
      }
    });

    // Use new orchestrator
    const result = await handleEmailTurn({
      businessId: req.businessId,
      threadId,
      messageId: targetMessageId,
      options: {
        createProviderDraft
      }
    });

    queueAdminDraftTrace({
      req,
      threadId,
      messageId: targetMessageId,
      result
    });

    if (!result.success) {
      // Handle specific error codes
      if (result.errorCode === 'GUARDRAIL_BLOCKED') {
        return res.status(400).json({
          error: result.error,
          errorCode: result.errorCode,
          blockedBy: result.blockedBy
        });
      }

      return res.status(500).json({
        error: result.error || 'Failed to generate draft',
        errorCode: result.errorCode
      });
    }

    res.json({
      success: true,
      message: 'Draft generated successfully',
      draft: result.draft,
      classification: result.classification,
      responseGrounding: result.responseGrounding || 'GROUNDED',
      toolsCalled: result.toolsCalled,
      guardrailsApplied: result.guardrailsApplied,
      providerDraftId: result.providerDraftId,
      metrics: {
        totalDuration: result.metrics?.totalDuration,
        steps: result.metrics?.steps
      }
    });
  } catch (error) {
    console.error('Manual draft generation error:', error);

    import('../services/errorLogger.js')
      .then(({ logError, ERROR_CATEGORY, SEVERITY }) => {
        logError({
          category: ERROR_CATEGORY.CHAT_ERROR,
          severity: SEVERITY.HIGH,
          message: error?.message,
          error,
          source: 'email/generate-draft',
          businessId: req.businessId || null,
          endpoint: req.path,
          method: req.method,
        }).catch(() => {});
      })
      .catch(() => {});

    res.status(500).json({ error: 'Failed to generate draft' });
  }
});

/**
 * Generate Draft using LEGACY method (fallback)
 * POST /api/email/threads/:threadId/generate-draft-legacy
 *
 * Kept for backward compatibility if needed
 */
router.post('/threads/:threadId/generate-draft-legacy', authenticateToken, async (req, res) => {
  try {
    const { threadId } = req.params;

    const thread = await prisma.emailThread.findFirst({
      where: {
        id: threadId,
        businessId: req.businessId
      }
    });

    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const latestInbound = await prisma.emailMessage.findFirst({
      where: {
        threadId: thread.id,
        direction: 'INBOUND'
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!latestInbound) {
      return res.status(400).json({ error: 'No inbound message found in this thread' });
    }

    const existingDraft = await prisma.emailDraft.findFirst({
      where: {
        messageId: latestInbound.id,
        status: 'PENDING_REVIEW'
      }
    });

    if (existingDraft) {
      return res.status(400).json({
        error: 'A pending draft already exists for this message',
        draftId: existingDraft.id
      });
    }

    // Use legacy emailAI service
    const draft = await emailAI.generateDraft(req.businessId, thread, latestInbound);

    await prisma.emailThread.update({
      where: { id: thread.id },
      data: { status: 'DRAFT_READY' }
    });

    res.json({
      success: true,
      message: 'Draft generated successfully (legacy)',
      draft
    });
  } catch (error) {
    console.error('Legacy draft generation error:', error);
    res.status(500).json({ error: 'Failed to generate draft' });
  }
});

/**
 * Regenerate Draft
 * POST /api/email/drafts/:draftId/regenerate
 *
 * CRITICAL: Uses handleEmailTurn pipeline (NOT legacy emailAI.regenerateDraft).
 * Legacy regenerateDraft() has NO tool/CRM integration — LLM hallucinates
 * order data because it never fetches real data from CRM.
 * handleEmailTurn runs the full pipeline: classification → tool gating →
 * tool loop (CRM lookups) → draft generation with real data.
 */
router.post('/drafts/:draftId/regenerate', authenticateToken, async (req, res) => {
  try {
    const { feedback } = req.body;

    // 1. Find existing draft
    const draft = await emailAI.getDraft(req.params.draftId);

    if (!draft || draft.businessId !== req.businessId) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    // 2. Archive old active drafts in the thread, keep the source draft as REJECTED.
    await prisma.$transaction([
      prisma.emailDraft.update({
        where: { id: draft.id },
        data: { status: 'REJECTED' }
      }),
      prisma.emailDraft.updateMany({
        where: {
          threadId: draft.threadId,
          status: 'PENDING_REVIEW',
          id: { not: draft.id }
        },
        data: { status: 'CANCELLED' }
      })
    ]);

    // 3. Clear idempotency lock so handleEmailTurn can create a new draft.
    // Without this, the lock (status=COMPLETED) blocks new draft generation
    // for the same (businessId, threadId, messageId) tuple.
    await prisma.emailDraftLock.deleteMany({
      where: {
        businessId: req.businessId,
        threadId: draft.threadId,
        sourceMessageId: draft.messageId,
        status: { in: ['COMPLETED', 'FAILED'] }
      }
    });

    // 4. Generate new draft using full pipeline (with CRM/tool lookups)
    const result = await handleEmailTurn({
      businessId: req.businessId,
      threadId: draft.threadId,
      messageId: draft.messageId,
      options: {
        feedback,
        createProviderDraft: true
      }
    });

    queueAdminDraftTrace({
      req,
      threadId: draft.threadId,
      messageId: draft.messageId,
      result
    });

    if (!result.success) {
      if (result.errorCode === 'GUARDRAIL_BLOCKED') {
        return res.status(400).json({
          error: result.error,
          errorCode: result.errorCode,
          blockedBy: result.blockedBy
        });
      }

      return res.status(500).json({
        error: result.error || 'Failed to regenerate draft',
        errorCode: result.errorCode
      });
    }

    res.json({
      success: true,
      draft: result.draft,
      classification: result.classification,
      responseGrounding: result.responseGrounding || 'GROUNDED',
      toolsCalled: result.toolsCalled
    });
  } catch (error) {
    console.error('Regenerate draft error:', error);

    import('../services/errorLogger.js')
      .then(({ logError, ERROR_CATEGORY, SEVERITY }) => {
        logError({
          category: ERROR_CATEGORY.CHAT_ERROR,
          severity: SEVERITY.HIGH,
          message: error?.message,
          error,
          source: 'email/regenerate',
          businessId: req.businessId || null,
          endpoint: req.path,
          method: req.method,
        }).catch(() => {});
      })
      .catch(() => {});

    res.status(500).json({ error: 'Failed to regenerate draft' });
  }
});

// ==================== SYNC ROUTES ====================

/**
 * Manual Sync (Legacy - returns after completion)
 * POST /api/email/sync
 *
 * NOTE: This route ONLY syncs emails - NO automatic draft generation.
 * Draft generation is 100% manual via the generate-draft endpoint.
 */
router.post('/sync', authenticateToken, async (req, res) => {
  try {
    const status = await emailAggregator.getStatus(req.businessId);

    if (!status.connected) {
      return res.status(400).json({ error: 'No email provider connected' });
    }

    // Get new messages from provider
    const newMessages = await emailAggregator.syncNewMessages(req.businessId);

    // Get connected email to determine direction
    const integration = await emailAggregator.getIntegration(req.businessId);
    const connectedEmail = integration.email;

    let processedCount = 0;

    for (const message of newMessages) {
      // Determine direction
      const direction = message.from.email.toLowerCase() === connectedEmail.toLowerCase()
        ? 'OUTBOUND'
        : 'INBOUND';

      // Save to database
      const { thread, isNew } = await emailAggregator.saveMessageToDb(
        req.businessId,
        message,
        direction
      );

      if (isNew) {
        processedCount++;

        // For OUTBOUND messages (sent by user via external app), mark thread as REPLIED
        if (direction === 'OUTBOUND' && thread.status !== 'REPLIED') {
          await prisma.emailThread.update({
            where: { id: thread.id },
            data: { status: 'REPLIED' }
          });
          console.log(`[Email Sync] Thread ${thread.id} marked as REPLIED (outbound message detected)`);
        }

        // For INBOUND messages: If thread was REPLIED or CLOSED, reopen it as PENDING_REPLY
        // This handles the case where a customer sends a follow-up email after we replied
        if (direction === 'INBOUND' && (thread.status === 'REPLIED' || thread.status === 'CLOSED' || thread.status === 'NO_REPLY_NEEDED')) {
          // Cancel any pending drafts for this thread (they're for old messages)
          await prisma.emailDraft.updateMany({
            where: {
              threadId: thread.id,
              status: 'PENDING_REVIEW'
            },
            data: { status: 'CANCELLED' }
          });

          await prisma.emailThread.update({
            where: { id: thread.id },
            data: { status: 'PENDING_REPLY' }
          });
          console.log(`[Email Sync] Thread ${thread.id} reopened as PENDING_REPLY (new inbound message after reply)`);
        }
      }
    }

    // All messages saved — now update lastSyncedAt
    await prisma.emailIntegration.update({
      where: { businessId: req.businessId },
      data: { lastSyncedAt: new Date() }
    });

    res.json({
      success: true,
      message: `Synced ${processedCount} new messages`,
      processedCount
    });
  } catch (error) {
    console.error('Sync error:', error);
    if (error?.code === 'EMAIL_RECONNECT_REQUIRED') {
      return res.status(409).json({
        error: error.message,
        code: error.code
      });
    }
    res.status(500).json({ error: 'Failed to sync messages' });
  }
});

/**
 * Real-time Sync with Server-Sent Events (SSE)
 * GET /api/email/sync/stream
 *
 * Streams sync progress events to frontend:
 * - 'started': Sync initiated
 * - 'thread': New thread processed (includes thread data)
 * - 'completed': Sync finished
 * - 'error': Error occurred
 */
router.get('/sync/stream', authenticateToken, async (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const status = await emailAggregator.getStatus(req.businessId);

    if (!status.connected) {
      sendEvent('error', { error: 'No email provider connected' });
      return res.end();
    }

    sendEvent('started', { message: 'Starting email sync...' });

    // Get new messages from provider
    const newMessages = await emailAggregator.syncNewMessages(req.businessId);

    // Get connected email to determine direction
    const integration = await emailAggregator.getIntegration(req.businessId);
    const connectedEmail = integration.email;

    let processedCount = 0;

    for (const message of newMessages) {
      // Determine direction
      const direction = message.from.email.toLowerCase() === connectedEmail.toLowerCase()
        ? 'OUTBOUND'
        : 'INBOUND';

      // Save to database
      const { thread, isNew } = await emailAggregator.saveMessageToDb(
        req.businessId,
        message,
        direction
      );

      if (isNew) {
        processedCount++;

        // For OUTBOUND messages (sent by user via external app), mark thread as REPLIED
        if (direction === 'OUTBOUND' && thread.status !== 'REPLIED') {
          await prisma.emailThread.update({
            where: { id: thread.id },
            data: { status: 'REPLIED' }
          });
        }

        // For INBOUND messages: If thread was REPLIED or CLOSED, reopen it as PENDING_REPLY
        if (direction === 'INBOUND' && (thread.status === 'REPLIED' || thread.status === 'CLOSED' || thread.status === 'NO_REPLY_NEEDED')) {
          // Cancel any pending drafts for this thread (they're for old messages)
          await prisma.emailDraft.updateMany({
            where: {
              threadId: thread.id,
              status: 'PENDING_REVIEW'
            },
            data: { status: 'CANCELLED' }
          });

          await prisma.emailThread.update({
            where: { id: thread.id },
            data: { status: 'PENDING_REPLY' }
          });
        }

        // Send thread update event to frontend
        // Fetch full thread data with last message + draft for list display
        const fullThread = await prisma.emailThread.findUnique({
          where: { id: thread.id },
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1
            },
            drafts: {
              where: { status: 'PENDING_REVIEW' },
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        });

        sendEvent('thread', {
          thread: fullThread,
          isNew: true,
          direction,
          processedCount
        });
      }
    }

    // All messages saved to DB — NOW update lastSyncedAt
    // (Not before, because page refresh kills SSE mid-loop and unsaved messages would be lost)
    await prisma.emailIntegration.update({
      where: { businessId: req.businessId },
      data: { lastSyncedAt: new Date() }
    });

    // Send completion event
    sendEvent('completed', {
      message: `Synced ${processedCount} new messages`,
      processedCount,
      totalMessages: newMessages.length
    });

    res.end();
  } catch (error) {
    console.error('Sync stream error:', error);
    sendEvent('error', {
      error: error?.code === 'EMAIL_RECONNECT_REQUIRED' ? error.message : 'Failed to sync messages',
      message: error?.message || 'Failed to sync messages',
      code: error?.code || 'EMAIL_SYNC_FAILED'
    });
    res.end();
  }
});

// ==================== STATS ROUTES ====================

/**
 * Get Email Stats
 * GET /api/email/stats
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      newCount,
      pendingCount,
      draftReadyCount,
      repliedCount,
      repliedTodayCount,
      noReplyNeededCount,
      totalThreads
    ] = await Promise.all([
      // NEW status (new emails without any action)
      prisma.emailThread.count({
        where: {
          businessId: req.businessId,
          status: 'NEW'
        }
      }),
      // PENDING_REPLY (legacy - kept for backward compatibility)
      prisma.emailThread.count({
        where: {
          businessId: req.businessId,
          status: 'PENDING_REPLY'
        }
      }),
      // DRAFT_READY (AI draft generated)
      prisma.emailThread.count({
        where: {
          businessId: req.businessId,
          status: 'DRAFT_READY'
        }
      }),
      // Total REPLIED count
      prisma.emailThread.count({
        where: {
          businessId: req.businessId,
          status: 'REPLIED'
        }
      }),
      // Replied today count
      prisma.emailThread.count({
        where: {
          businessId: req.businessId,
          status: 'REPLIED',
          updatedAt: { gte: today }
        }
      }),
      // NO_REPLY_NEEDED
      prisma.emailThread.count({
        where: {
          businessId: req.businessId,
          status: 'NO_REPLY_NEEDED'
        }
      }),
      // Total threads
      prisma.emailThread.count({
        where: { businessId: req.businessId }
      })
    ]);

    res.json({
      newCount,
      pendingCount,
      draftReadyCount,
      repliedCount,
      repliedTodayCount,
      noReplyNeededCount,
      totalThreads
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ==================== WEBHOOK ROUTES ====================

/**
 * Gmail Push Notification Webhook
 * POST /api/email/webhook/gmail
 */
router.post('/webhook/gmail', async (req, res) => {
  try {
    // Gmail sends base64 encoded data
    const message = req.body.message;
    if (message && message.data) {
      const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
      console.log('Gmail webhook received:', data);
      // TODO: Process the notification and sync new messages
    }
    res.status(200).send('OK');
  } catch (error) {
    console.error('Gmail webhook error:', error);
    res.status(200).send('OK'); // Always return 200 to prevent retries
  }
});

/**
 * Outlook Subscription Webhook
 * POST /api/email/webhook/outlook
 */
router.post('/webhook/outlook', async (req, res) => {
  try {
    // Validation request
    if (req.query.validationToken) {
      return res.status(200).send(req.query.validationToken);
    }

    // Notification
    const notifications = req.body.value || [];
    console.log('Outlook webhook received:', notifications);
    // TODO: Process the notifications and sync new messages

    res.status(202).send('Accepted');
  } catch (error) {
    console.error('Outlook webhook error:', error);
    res.status(202).send('Accepted');
  }
});

// ==================== STYLE LEARNING ROUTES ====================

import { analyzeWritingStyle, getStyleProfile, reanalyzeWritingStyle } from '../services/email-style-analyzer.js';
import { classifyEmailSender, overrideClassification, getClassificationStats } from '../services/email-classifier.js';

/**
 * Get Style Profile
 * GET /api/email/style-profile
 */
router.get('/style-profile', authenticateToken, async (req, res) => {
  try {
    const profile = await getStyleProfile(req.businessId);

    if (!profile) {
      return res.status(404).json({ error: 'No email integration found' });
    }

    res.json({
      styleProfile: profile.styleProfile,
      status: profile.styleAnalysisStatus,
      analyzedAt: profile.styleAnalyzedAt,
    });
  } catch (error) {
    console.error('Get style profile error:', error);
    res.status(500).json({ error: 'Failed to get style profile' });
  }
});

/**
 * Trigger Style Analysis
 * POST /api/email/style-profile/analyze
 */
router.post('/style-profile/analyze', authenticateToken, async (req, res) => {
  try {
    // Check if integration exists
    const integration = await prisma.emailIntegration.findUnique({
      where: { businessId: req.businessId },
    });

    if (!integration || !integration.connected) {
      return res.status(400).json({ error: 'No email provider connected' });
    }

    // If already processing, don't start another
    if (integration.styleAnalysisStatus === 'PROCESSING') {
      return res.status(400).json({ error: 'Analysis is already in progress' });
    }

    // Start analysis in background
    const result = await reanalyzeWritingStyle(req.businessId);

    res.json({
      success: true,
      message: 'Style analysis started',
      status: 'PROCESSING',
    });
  } catch (error) {
    console.error('Trigger style analysis error:', error);
    res.status(500).json({ error: 'Failed to start style analysis' });
  }
});

// ==================== SMART FILTERING ROUTES ====================

/**
 * Classify Email Sender
 * POST /api/email/classify
 */
router.post('/classify', authenticateToken, async (req, res) => {
  try {
    const { senderEmail, subject, snippet, headers } = req.body;

    if (!senderEmail) {
      return res.status(400).json({ error: 'Sender email is required' });
    }

    const result = await classifyEmailSender(req.businessId, senderEmail, {
      subject,
      snippet,
      headers,
    });

    res.json(result);
  } catch (error) {
    console.error('Classify email error:', error);
    res.status(500).json({ error: 'Failed to classify email' });
  }
});

/**
 * Override Classification
 * POST /api/email/classify/override
 */
router.post('/classify/override', authenticateToken, async (req, res) => {
  try {
    const { senderEmail, classification } = req.body;

    if (!senderEmail || !classification) {
      return res.status(400).json({ error: 'Sender email and classification are required' });
    }

    if (!['PERSONAL', 'AUTOMATED'].includes(classification)) {
      return res.status(400).json({ error: 'Invalid classification. Must be PERSONAL or AUTOMATED' });
    }

    const result = await overrideClassification(req.businessId, senderEmail, classification);

    res.json({
      success: true,
      message: 'Classification updated',
      result,
    });
  } catch (error) {
    console.error('Override classification error:', error);
    res.status(500).json({ error: 'Failed to override classification' });
  }
});

/**
 * Get Classification Stats
 * GET /api/email/classify/stats
 */
router.get('/classify/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await getClassificationStats(req.businessId);

    const summary = {
      total: 0,
      personal: 0,
      automated: 0,
      bySource: {
        heuristic: 0,
        ai: 0,
        userOverride: 0,
      },
    };

    for (const stat of stats) {
      summary.total += stat._count;
      if (stat.classification === 'PERSONAL') {
        summary.personal += stat._count;
      } else {
        summary.automated += stat._count;
      }
      if (stat.classifiedBy === 'HEURISTIC') {
        summary.bySource.heuristic += stat._count;
      } else if (stat.classifiedBy === 'AI') {
        summary.bySource.ai += stat._count;
      } else {
        summary.bySource.userOverride += stat._count;
      }
    }

    res.json(summary);
  } catch (error) {
    console.error('Get classification stats error:', error);
    res.status(500).json({ error: 'Failed to get classification stats' });
  }
});

// ==================== SIGNATURE ROUTES ====================

/**
 * Get email signature settings
 * GET /api/email/signature
 */
router.get('/signature', authenticateToken, async (req, res) => {
  try {
    const integration = await prisma.emailIntegration.findUnique({
      where: { businessId: req.businessId },
      select: {
        emailSignature: true,
        signatureType: true
      }
    });

    if (!integration) {
      return res.json({
        emailSignature: null,
        signatureType: 'PLAIN'
      });
    }

    res.json({
      emailSignature: integration.emailSignature,
      signatureType: integration.signatureType
    });
  } catch (error) {
    console.error('Get signature error:', error);
    res.status(500).json({ error: 'Failed to get email signature' });
  }
});

/**
 * Update email signature
 * PUT /api/email/signature
 */
router.put('/signature', authenticateToken, async (req, res) => {
  try {
    const { emailSignature, signatureType } = req.body;

    // Validate signatureType
    if (signatureType && !['PLAIN', 'HTML'].includes(signatureType)) {
      return res.status(400).json({ error: 'signatureType must be PLAIN or HTML' });
    }

    // Check if email integration exists
    const existing = await prisma.emailIntegration.findUnique({
      where: { businessId: req.businessId }
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Email integration not found. Please connect your email first.'
      });
    }

    // Update signature
    const updated = await prisma.emailIntegration.update({
      where: { businessId: req.businessId },
      data: {
        emailSignature: emailSignature || null,
        signatureType: signatureType || 'PLAIN'
      },
      select: {
        emailSignature: true,
        signatureType: true
      }
    });

    res.json({
      success: true,
      emailSignature: updated.emailSignature,
      signatureType: updated.signatureType,
      message: 'Email signature updated successfully'
    });
  } catch (error) {
    console.error('Update signature error:', error);
    res.status(500).json({ error: 'Failed to update email signature' });
  }
});

// ==================== EMAIL PAIR ROUTES (Learning Dataset) ====================

/**
 * Build email pairs from sent emails
 * POST /api/email/pairs/build
 * Body: { daysBack: 30, limit: 100 }
 */
router.post('/pairs/build', authenticateToken, async (req, res) => {
  try {
    const { daysBack = 30, limit = 100 } = req.body;

    console.log(`[EmailPairs] Building pairs for business ${req.businessId}`);

    const result = await buildEmailPairs(req.businessId, { daysBack, limit });

    res.json(result);
  } catch (error) {
    console.error('Build pairs error:', error);
    res.status(500).json({ error: 'Failed to build email pairs' });
  }
});

/**
 * Get pair statistics
 * GET /api/email/pairs/stats
 */
router.get('/pairs/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await getPairStatistics(req.businessId);
    res.json(stats);
  } catch (error) {
    console.error('Get pair stats error:', error);
    res.status(500).json({ error: 'Failed to get pair statistics' });
  }
});

export default router;
