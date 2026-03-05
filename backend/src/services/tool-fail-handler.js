/**
 * Tool Fail Handler - Production Guardrail
 *
 * CRITICAL: When tool fails with INFRA_ERROR, NEVER let LLM make up a response.
 * Use forced template to prevent action claims.
 *
 * NOTE: NOT_FOUND, VALIDATION_ERROR, VERIFICATION_REQUIRED are NOT failures.
 * These are valid outcomes that AI should handle naturally.
 * Only INFRA_ERROR triggers fail policy.
 */

import { shouldTriggerFailPolicy, ToolOutcome, normalizeOutcome } from '../tools/toolResult.js';
import { hasActionClaim } from '../security/actionClaimLexicon.js';
import { getMessageVariant } from '../messages/messageCatalog.js';
import { getPolicyAppendMode } from '../config/feature-flags.js';

/**
 * Get forced error response when tool fails
 *
 * @param {string} toolName - Name of failed tool
 * @param {string} language - Language code
 * @param {string} channel - CHAT | WHATSAPP | PHONE
 * @returns {Object} { reply: string, forceEnd: boolean, metadata: object }
 */
export function getToolFailResponse(toolName, language = 'TR', channel = 'CHAT') {
  const isPhone = channel === 'PHONE';
  const normalizedToolName = String(toolName || 'default').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const reasonCode = `TOOL_INFRA_${normalizedToolName}`;
  const retryAfterMs = 10000;

  const messageKeys = {
    create_callback: 'TOOL_FAIL_CREATE_CALLBACK',
    customer_data_lookup: 'TOOL_FAIL_CUSTOMER_DATA_LOOKUP',
    calendly: 'TOOL_FAIL_CALENDLY',
    default: 'TOOL_FAIL_DEFAULT'
  };
  const selectedKey = messageKeys[toolName] || messageKeys.default;
  const messageVariant = getMessageVariant(selectedKey, {
    language,
    channel,
    directiveType: 'TOOL_FAIL',
    severity: 'warning',
    seedHint: toolName || 'default'
  });

  return {
    reply: messageVariant.text,
    forceEnd: isPhone, // Only force end conversation on phone (to prevent long wait)
    hadToolFailure: true,
    failedTool: toolName,
    metadata: {
      type: 'TOOL_FAILURE',
      tool: toolName,
      reasonCode,
      retryable: true,
      retryAfterMs,
      messageKey: messageVariant.messageKey,
      variantIndex: messageVariant.variantIndex,
      timestamp: new Date().toISOString(),
      channel
    }
  };
}

/**
 * Validate that response doesn't contain action claims after tool failure
 *
 * @param {string} responseText - LLM response text
 * @param {boolean} hadToolSuccess - Whether any tool succeeded
 * @param {string} language - Language code
 * @returns {Object} { valid: boolean, forcedResponse?: string }
 */
export function validateResponseAfterToolFail(responseText, hadToolSuccess, language = 'TR') {
  // If tool succeeded, no validation needed
  if (hadToolSuccess) {
    return { valid: true };
  }

  const hasClaim = hasActionClaim(responseText, language);

  if (hasClaim) {
    console.error('🚨 [ToolFail] LLM made action claim without tool success!');
    console.error('   Response:', responseText.substring(0, 200));

    // HARD BLOCK: Return forced apology WITH guidance
    const forcedResponse = getMessageVariant('TOOL_FAIL_ACTION_CLAIM', {
      language,
      directiveType: 'TOOL_FAIL',
      severity: 'critical',
      seedHint: 'ACTION_CLAIM_WITHOUT_TOOL_SUCCESS'
    }).text;

    return {
      valid: false,
      forcedResponse,
      violationType: 'ACTION_CLAIM_WITHOUT_TOOL_SUCCESS'
    };
  }

  return { valid: true };
}

/**
 * Add retry logic for critical tools with idempotency
 *
 * @param {Function} toolExecutor - Tool execution function
 * @param {string} toolName - Tool name
 * @param {Object} args - Tool arguments
 * @param {number} maxRetries - Max retry attempts (default: 1)
 * @returns {Promise<Object>} Tool result
 */
/**
 * Check if a tool result is a real failure (INFRA_ERROR) vs valid outcome
 *
 * Valid outcomes (NOT failures):
 * - NOT_FOUND: Query succeeded, just no matching record
 * - VALIDATION_ERROR: User provided invalid input
 * - VERIFICATION_REQUIRED: Need identity verification
 *
 * Real failure (triggers fail policy):
 * - INFRA_ERROR: DB down, API timeout, etc.
 */
export function isRealToolFailure(result) {
  // Use contract if available
  if (result.outcome) {
    return normalizeOutcome(result.outcome) === ToolOutcome.INFRA_ERROR;
  }

  // Backward compat: notFound is NOT a failure
  if (result.notFound === true) {
    return false;
  }

  // Backward compat: verificationRequired is NOT a failure
  if (result.verificationRequired === true || result.action === 'VERIFICATION_REQUIRED') {
    return false;
  }

  // Backward compat: validationError is NOT a failure
  if (result.validationError === true || result.action === 'VERIFICATION_FAILED') {
    return false;
  }

  // Only success=false without above flags is a real failure
  return result.success === false;
}

export async function executeToolWithRetry(toolExecutor, toolName, args, maxRetries = 1) {
  let lastError = null;

  // Critical tools that need retry (only on INFRA_ERROR)
  const criticalTools = ['create_callback', 'customer_data_lookup'];
  const shouldRetry = criticalTools.includes(toolName);

  const attempts = shouldRetry ? maxRetries + 1 : 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      console.log(`🔧 [ToolRetry] Attempt ${attempt + 1}/${attempts} for ${toolName}`);

      const result = await toolExecutor(toolName, args);

      // Check if this is a valid outcome (not a failure)
      if (!isRealToolFailure(result)) {
        if (attempt > 0) {
          console.log(`✅ [ToolRetry] Success on attempt ${attempt + 1}`);
        }

        // Log outcome type for debugging
        const outcomeType = result.outcome ||
          (result.notFound ? 'NOT_FOUND' : result.success ? 'OK' : 'UNKNOWN');
        console.log(`📋 [ToolRetry] Outcome: ${outcomeType}`);

        return result;
      }

      lastError = result.error || 'Tool returned INFRA_ERROR';

      // Wait before retry (exponential backoff)
      if (attempt < attempts - 1) {
        const waitMs = Math.min(1000 * Math.pow(2, attempt), 3000); // Max 3s
        console.log(`⏳ [ToolRetry] Waiting ${waitMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }

    } catch (error) {
      lastError = error.message;
      console.error(`❌ [ToolRetry] Attempt ${attempt + 1} failed:`, error.message);

      if (attempt < attempts - 1) {
        const waitMs = Math.min(1000 * Math.pow(2, attempt), 3000);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }
  }

  // All attempts failed - this is an INFRA_ERROR
  console.error(`❌ [ToolRetry] All ${attempts} attempts failed for ${toolName}`);
  return {
    outcome: ToolOutcome.INFRA_ERROR,
    success: false,
    error: lastError || 'Tool execution failed after retries',
    attempts
  };
}

/**
 * Deterministic Guidance Guard for Policy Responses
 *
 * Ensures policy responses (refund, return, cancellation, etc.) ALWAYS
 * include at least 2 of:
 * 1. Next step (what to do)
 * 2. Contact channel (how to reach us)
 * 3. Required info (what to prepare)
 *
 * If missing, appends default guidance automatically.
 */

// Policy-related topic patterns
const POLICY_PATTERNS = {
  TR: [
    /iade|geri\s*al|geri\s*gönder/i,
    /iptal|vazgeç/i,
    /değişik|değiştir/i,
    /garanti|servis/i,
    /şikayet|memnuniyet(sizlik)?/i,
    /kargo\s*sorunu?|hasar/i,
    /ücret\s*iadesi|para\s*iade/i
  ],
  EN: [
    /refund|return|send\s*back/i,
    /cancel|cancellation/i,
    /exchange|swap/i,
    /warranty|repair/i,
    /complaint|dissatisf/i,
    /shipping\s*(issue|problem)|damage/i
  ]
};

// Guidance component patterns
const GUIDANCE_PATTERNS = {
  // Next step indicators
  nextStep: {
    TR: [
      /\d+\s*gün\s*içinde/i,        // "X gün içinde"
      /adım|yapmanız\s*gereken/i,   // "adım", "yapmanız gereken"
      /önce(likle)?|ilk\s*olarak/i, // "önce", "ilk olarak"
      /•|→|>|\-\s+[A-ZÇĞİÖŞÜ]/,    // Bullet points with action
      /formu?\s*(doldur|gönder)/i,  // Form actions
      /başvur|talep\s*(oluştur|et)/i // "başvur", "talep et"
    ],
    EN: [
      /\d+\s*days?\s*(within|to)/i,
      /step|you\s*(need|should)\s*to/i,
      /first(ly)?|to\s*start/i,
      /•|→|>|\-\s+[A-Z]/,
      /fill\s*(out|in)\s*(the)?\s*form/i,
      /submit|apply|request/i
    ]
  },
  // Contact channel indicators
  contactChannel: {
    TR: [
      /ara(yabil|yın)|telefon/i,
      /e-?posta|mail|@/i,
      /whatsapp|mesaj/i,
      /web\s*site(miz)?|sayfa/i,
      /müşteri\s*hizmet/i,
      /destek\s*(hattı|ekibi)/i
    ],
    EN: [
      /call|phone/i,
      /e-?mail|@/i,
      /whatsapp|message/i,
      /website|page/i,
      /customer\s*service/i,
      /support\s*(line|team)/i
    ]
  },
  // Required info indicators
  requiredInfo: {
    TR: [
      /sipariş\s*numara/i,
      /fatura|fiş/i,
      /ad|soyad|isim/i,
      /telefon|numara/i,
      /fotoğraf|görsel|resim/i,
      /yanınız(a|da)\s*bulundur/i
    ],
    EN: [
      /order\s*(number|id)/i,
      /invoice|receipt/i,
      /name/i,
      /phone|number/i,
      /photo|image|picture/i,
      /have\s*(ready|available)/i
    ]
  }
};

// Default guidance to append if missing
const DEFAULT_GUIDANCE = {
  TR: {
    nextStep: 'Birkaç dakika içinde tekrar deneyebilirsiniz.',
    contactChannel: 'Müşteri hizmetlerimizden destek alabilirsiniz.',
    requiredInfo: 'Sipariş numaranızı hazır bulundurun.'
  },
  EN: {
    nextStep: 'You can try again in a few minutes.',
    contactChannel: 'You can contact our customer service for assistance.',
    requiredInfo: 'Please have your order number ready.'
  }
};

/**
 * Check if message is about a policy topic
 */
export function isPolicyTopic(userMessage, language = 'TR') {
  const patterns = POLICY_PATTERNS[language] || POLICY_PATTERNS.TR;
  // Use Turkish locale for proper İ→i conversion
  const text = language === 'TR'
    ? userMessage.toLocaleLowerCase('tr-TR')
    : userMessage.toLowerCase();
  return patterns.some(p => p.test(text));
}

/**
 * Count guidance components in response
 */
function countGuidanceComponents(response, language = 'TR') {
  const patterns = GUIDANCE_PATTERNS;
  const components = { nextStep: false, contactChannel: false, requiredInfo: false };

  const lang = language.toUpperCase() === 'EN' ? 'EN' : 'TR';

  // Check each component
  for (const [component, langPatterns] of Object.entries(patterns)) {
    const checkPatterns = langPatterns[lang] || langPatterns.TR;
    components[component] = checkPatterns.some(p => p.test(response));
  }

  return components;
}

function normalizePolicyLanguage(language = 'TR') {
  return String(language || 'TR').toUpperCase() === 'EN' ? 'EN' : 'TR';
}

function buildPolicyAppendTelemetry({
  mode,
  isPolicyMsg,
  guidanceAdded,
  addedComponents,
  appendLength = 0
}) {
  const normalizedMode = String(mode || 'legacy').toLowerCase();
  const appendKey = addedComponents.length > 0 ? addedComponents.join('+') : null;

  return {
    mode: normalizedMode,
    topic: isPolicyMsg ? 'policy_topic' : 'non_policy',
    append_key: appendKey,
    length: Number.isFinite(appendLength) ? appendLength : 0,
    guidanceAdded: guidanceAdded === true
  };
}

function applyLegacyPolicyGuidance(response, userMessage, language = 'TR') {
  const isPolicyMsg = isPolicyTopic(userMessage, language);
  const lang = normalizePolicyLanguage(language);
  const defaults = DEFAULT_GUIDANCE[lang] || DEFAULT_GUIDANCE.TR;

  // VERBOSE logging
  if (process.env.VERBOSE === 'true') {
    console.log(`📋 [GuidanceGuard:ensurePolicyGuidance] input="${(userMessage || '').substring(0, 60)}"`);
    console.log(`📋 [GuidanceGuard:ensurePolicyGuidance] isPolicyTopic=${isPolicyMsg}`);
  }

  // Only apply to policy topics
  if (!isPolicyMsg) {
    if (process.env.VERBOSE === 'true') {
      console.log('📋 [GuidanceGuard:ensurePolicyGuidance] SKIP - not a policy topic');
    }
    return {
      response,
      guidanceAdded: false,
      addedComponents: [],
      isPolicyTopic: false,
      appendLength: 0
    };
  }

  const components = countGuidanceComponents(response, language);
  const presentCount = Object.values(components).filter(Boolean).length;
  const actionableGuidancePattern = lang === 'TR'
    ? /(destek|iletişim|müşteri\s*hizmetleri|arayabilir|e-?posta|adım)/i
    : /(support|contact|customer\s*service|call|email|step)/i;
  const hasActionableGuidanceSignal = actionableGuidancePattern.test(response || '');

  if (process.env.VERBOSE === 'true') {
    console.log(`📋 [GuidanceGuard:ensurePolicyGuidance] components=${JSON.stringify(components)}, presentCount=${presentCount}`);
  }

  // For policy replies, we require at least one actionable guidance signal.
  // If absent, append deterministic next-step + contact guidance.
  if (!hasActionableGuidanceSignal) {
    const forcedStep = lang === 'TR'
      ? 'İzleyebileceğiniz adım: yeniden inceleme talebi oluşturup sipariş numaranızı paylaşın.'
      : 'Next step: create a review request and share your order number.';
    const appendedText = `${forcedStep} ${defaults.contactChannel}`;
    const enhancedResponse = `${response.trim()}\n\n${appendedText}`;

    return {
      response: enhancedResponse,
      guidanceAdded: true,
      addedComponents: ['nextStep', 'contactChannel'],
      isPolicyTopic: true,
      appendLength: appendedText.length
    };
  }

  // If at least 2 components present, response is OK
  if (presentCount >= 2) {
    if (process.env.VERBOSE === 'true') {
      console.log(`📋 [GuidanceGuard:ensurePolicyGuidance] OK - response already has ${presentCount} components`);
    }
    return {
      response,
      guidanceAdded: false,
      addedComponents: [],
      isPolicyTopic: true,
      appendLength: 0
    };
  }

  // Need to add missing components
  const addedComponents = [];
  const toAdd = [];

  // Add missing components (up to 2 total)
  const needed = 2 - presentCount;
  const componentOrder = ['nextStep', 'contactChannel', 'requiredInfo'];

  for (const comp of componentOrder) {
    if (!components[comp] && toAdd.length < needed) {
      toAdd.push(defaults[comp]);
      addedComponents.push(comp);
    }
  }

  // Append guidance to response
  const guidanceText = toAdd.join(' ');
  const enhancedResponse = `${response.trim()}\n\n${guidanceText}`;

  console.log(`📋 [GuidanceGuard] Added ${addedComponents.length} guidance components: ${addedComponents.join(', ')}`);

  return {
    response: enhancedResponse,
    guidanceAdded: true,
    addedComponents,
    isPolicyTopic: true,
    appendLength: guidanceText.length
  };
}

/**
 * Ensure policy responses have minimum guidance
 *
 * @param {string} response - LLM response text
 * @param {string} userMessage - Original user message (to detect policy topic)
 * @param {string} language - Language code (TR/EN)
 * @param {Object} options
 * @param {number|string|null} options.businessId - business id for canary gating
 * @returns {Object} { response: string, guidanceAdded: boolean, addedComponents: string[] }
 */
export function ensurePolicyGuidance(response, userMessage, language = 'TR', options = {}) {
  const mode = getPolicyAppendMode({ businessId: options?.businessId });
  const legacyResult = applyLegacyPolicyGuidance(response, userMessage, language);

  if (mode === 'legacy') {
    return {
      ...legacyResult,
      policyAppend: buildPolicyAppendTelemetry({
        mode,
        isPolicyMsg: legacyResult.isPolicyTopic,
        guidanceAdded: legacyResult.guidanceAdded,
        addedComponents: legacyResult.addedComponents,
        appendLength: legacyResult.appendLength
      })
    };
  }

  if (mode === 'monitor_only') {
    const wouldAppend = legacyResult.guidanceAdded === true;
    return {
      response,
      guidanceAdded: false,
      addedComponents: [],
      wouldAppend,
      isPolicyTopic: legacyResult.isPolicyTopic,
      policyAppend: {
        ...buildPolicyAppendTelemetry({
          mode,
          isPolicyMsg: legacyResult.isPolicyTopic,
          guidanceAdded: wouldAppend,
          addedComponents: legacyResult.addedComponents || [],
          appendLength: legacyResult.appendLength || 0
        }),
        would_append: wouldAppend
      }
    };
  }

  return {
    response,
    guidanceAdded: false,
    addedComponents: [],
    isPolicyTopic: legacyResult.isPolicyTopic,
    policyAppend: buildPolicyAppendTelemetry({
      mode: 'off',
      isPolicyMsg: legacyResult.isPolicyTopic,
      guidanceAdded: false,
      addedComponents: [],
      appendLength: 0
    })
  };
}

export default {
  getToolFailResponse,
  validateResponseAfterToolFail,
  executeToolWithRetry,
  isRealToolFailure,
  ensurePolicyGuidance,
  isPolicyTopic
};
