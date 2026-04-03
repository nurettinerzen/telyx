/**
 * Email Snippet Service
 *
 * Manages and selects curated email snippets/templates.
 * Snippets provide consistent, approved responses.
 *
 * SELECTION RULES:
 * 1. Intent + urgency + language match
 * 2. Max 1-3 snippets per draft
 * 3. Variable availability check
 * 4. If required variables missing → skip or use verification template
 */

import prisma from '../../../prismaClient.js';
import { preventPIILeak } from '../policies/piiPreventionPolicy.js';
import { stripRecipientMentions } from '../policies/recipientOwnershipPolicy.js';

// Built-in variables that can be derived from context
const DERIVED_VARIABLES = {
  customer_name: (ctx) => ctx.customerName || ctx.customerData?.name,
  customer_email: (ctx) => ctx.customerEmail || ctx.customerData?.email,
  customer_phone: (ctx) => ctx.customerData?.phone,
  order_number: (ctx) => ctx.toolResults?.find(r => r.data?.order_id)?.data?.order_id,
  tracking_number: (ctx) => ctx.toolResults?.find(r => r.data?.tracking_number)?.data?.tracking_number,
  business_name: (ctx) => ctx.business?.name,
  date: () => new Date().toLocaleDateString('tr-TR'),
  time: () => new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
};

/**
 * Get all snippets for a business
 */
export async function getBusinessSnippets(businessId) {
  return prisma.emailSnippet.findMany({
    where: {
      businessId,
      enabled: true
    },
    orderBy: [
      { intent: 'asc' },
      { usageCount: 'desc' }
    ]
  });
}

/**
 * Get snippet by ID
 */
export async function getSnippetById(snippetId) {
  return prisma.emailSnippet.findUnique({
    where: { id: snippetId }
  });
}

/**
 * Create a new snippet
 */
export async function createSnippet({
  businessId,
  name,
  intent,
  language = 'TR',
  tone = 'professional',
  urgency,
  subject,
  body,
  variables = [],
  optionalVars = [],
  createdBy
}) {
  // Validate required fields
  if (!businessId || !name || !intent || !body) {
    throw new Error('Missing required fields: businessId, name, intent, body');
  }

  // Extract variables from body if not provided
  const extractedVars = extractVariablesFromTemplate(body);
  const allVars = [...new Set([...variables, ...extractedVars])];

  return prisma.emailSnippet.create({
    data: {
      businessId,
      name,
      intent: intent.toUpperCase(),
      language,
      tone,
      urgency: urgency?.toUpperCase(),
      subject,
      body,
      variables: allVars.filter(v => !optionalVars.includes(v)),
      optionalVars,
      createdBy
    }
  });
}

/**
 * Update a snippet
 */
export async function updateSnippet(snippetId, updates) {
  return prisma.emailSnippet.update({
    where: { id: snippetId },
    data: {
      ...updates,
      updatedAt: new Date()
    }
  });
}

/**
 * Delete a snippet
 */
export async function deleteSnippet(snippetId) {
  return prisma.emailSnippet.delete({
    where: { id: snippetId }
  });
}

/**
 * Extract variable names from template body
 * Matches: {variable_name}
 */
export function extractVariablesFromTemplate(template) {
  if (!template) return [];

  const matches = template.match(/\{([a-z_]+)\}/gi) || [];
  return [...new Set(matches.map(m => m.slice(1, -1).toLowerCase()))];
}

/**
 * Select best matching snippets for context
 *
 * @param {Object} params
 * @param {number} params.businessId
 * @param {Object} params.classification
 * @param {string} params.language
 * @param {Object} params.ctx - Pipeline context for variable resolution
 * @param {number} params.maxSnippets
 * @returns {Promise<Array>} Selected snippets with resolved variables
 */
export async function selectSnippetsForContext({
  businessId,
  classification,
  language = 'TR',
  ctx = {},
  maxSnippets = 2
}) {
  console.log(`🔍 [Snippet] Selecting for intent=${classification?.intent}, lang=${language}`);

  try {
    // Build filter conditions
    const whereConditions = {
      businessId,
      enabled: true
    };

    // Intent filter
    if (classification?.intent) {
      whereConditions.intent = classification.intent.toUpperCase();
    }

    // Language filter
    if (language) {
      whereConditions.language = language;
    }

    // Urgency filter (optional match)
    // We'll prioritize matching urgency but include all

    // Fetch candidates
    const candidates = await prisma.emailSnippet.findMany({
      where: whereConditions,
      orderBy: [
        { usageCount: 'desc' }
      ],
      take: maxSnippets * 2 // Get extra for filtering
    });

    if (candidates.length === 0) {
      console.log('ℹ️ [Snippet] No matching snippets found');
      return [];
    }

    // Score and filter candidates
    const scored = candidates.map(snippet => {
      let score = 1.0;

      // Boost for urgency match
      if (classification?.urgency && snippet.urgency === classification.urgency) {
        score += 0.3;
      }

      // Check variable availability
      const { available, missing } = checkVariableAvailability(snippet, ctx);

      if (missing.length > 0) {
        // Penalize for missing required variables
        score -= (missing.length * 0.5);
      }

      return {
        ...snippet,
        score,
        availableVars: available,
        missingVars: missing
      };
    });

    // Filter out snippets with missing required variables
    const validSnippets = scored
      .filter(s => s.missingVars.length === 0 || s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSnippets);

    console.log(`✅ [Snippet] Selected ${validSnippets.length} snippets`);

    return validSnippets;

  } catch (error) {
    console.error('❌ [Snippet] Selection failed:', error);
    return [];
  }
}

/**
 * Check if required variables are available in context
 */
function checkVariableAvailability(snippet, ctx) {
  const available = {};
  const missing = [];

  const requiredVars = snippet.variables || [];
  const optionalVars = snippet.optionalVars || [];

  for (const varName of requiredVars) {
    const value = resolveVariable(varName, ctx);
    if (value !== null && value !== undefined) {
      available[varName] = value;
    } else {
      missing.push(varName);
    }
  }

  // Also resolve optional vars
  for (const varName of optionalVars) {
    const value = resolveVariable(varName, ctx);
    if (value !== null && value !== undefined) {
      available[varName] = value;
    }
  }

  return { available, missing };
}

/**
 * Resolve a variable from context
 */
function resolveVariable(varName, ctx) {
  // Check derived variables first
  if (DERIVED_VARIABLES[varName]) {
    return DERIVED_VARIABLES[varName](ctx);
  }

  // Check explicit variable mappings in ctx
  if (ctx.variables && ctx.variables[varName]) {
    return ctx.variables[varName];
  }

  // Check tool results for data
  if (ctx.toolResults) {
    for (const result of ctx.toolResults) {
      if (result.data && result.data[varName]) {
        return result.data[varName];
      }
    }
  }

  // Check customer data
  if (ctx.customerData && ctx.customerData[varName]) {
    return ctx.customerData[varName];
  }

  return null;
}

/**
 * Sanitize variable value to prevent injection attacks
 * - Strip header injection attempts (newlines, CRLF)
 * - Strip recipient manipulation
 * - Apply PII scrubbing
 */
function sanitizeVariableValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  let sanitized = String(value);

  // 1. Strip header injection (CRLF, newlines that could inject headers)
  sanitized = sanitized
    .replace(/\r\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ');

  // 2. Strip any recipient manipulation attempts
  const recipientResult = stripRecipientMentions(sanitized);
  if (recipientResult.wasModified) {
    console.warn('⚠️ [Snippet] Stripped recipient injection from variable');
    sanitized = recipientResult.content;
  }

  // 3. PII scrub (non-strict - replace, don't block)
  const piiResult = preventPIILeak(sanitized, { strict: false });
  if (piiResult.modified) {
    console.warn('⚠️ [Snippet] PII scrubbed from variable value');
    sanitized = piiResult.content;
  }

  // 4. Limit length to prevent prompt injection via long values
  const MAX_VAR_LENGTH = 500;
  if (sanitized.length > MAX_VAR_LENGTH) {
    sanitized = sanitized.substring(0, MAX_VAR_LENGTH) + '...';
  }

  return sanitized;
}

/**
 * Apply variables to snippet template
 * Variables are sanitized before application
 */
export function applyVariablesToSnippet(snippet, variables) {
  let body = snippet.body;
  let subject = snippet.subject;

  for (const [varName, rawValue] of Object.entries(variables)) {
    // Sanitize each variable value
    const value = sanitizeVariableValue(rawValue);

    const pattern = new RegExp(`\\{${varName}\\}`, 'gi');
    body = body.replace(pattern, value);
    if (subject) {
      subject = subject.replace(pattern, value);
    }
  }

  // Final safety check on resolved content
  const bodyPII = preventPIILeak(body, { strict: false });
  const subjectPII = preventPIILeak(subject, { strict: false });

  return {
    ...snippet,
    resolvedBody: bodyPII.content || body,
    resolvedSubject: subjectPII.content || subject,
    sanitized: true
  };
}

/**
 * Format snippets for LLM prompt
 */
export function formatSnippetsForPrompt(snippets) {
  if (!snippets || snippets.length === 0) {
    return '';
  }

  let formatted = '\n=== APPROVED RESPONSE TEMPLATES (use when appropriate) ===\n\n';

  for (const snippet of snippets) {
    formatted += `[Template: ${snippet.name}]\n`;
    formatted += `Intent: ${snippet.intent}\n`;
    formatted += `Tone: ${snippet.tone || 'professional'}\n`;

    // Show the resolved body if available
    const body = snippet.resolvedBody || snippet.body;
    formatted += `Template:\n${body}\n\n`;
  }

  formatted += '=== END TEMPLATES ===\n';
  formatted += 'Note: Use these templates as a base. You may adapt the wording while keeping the key information.\n';

  return formatted;
}

/**
 * Record snippet usage for analytics
 */
export async function recordSnippetUsage(snippetId) {
  try {
    await prisma.emailSnippet.update({
      where: { id: snippetId },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date()
      }
    });
  } catch (error) {
    console.error('⚠️ [Snippet] Failed to record usage:', error);
  }
}

/**
 * Get verification template (fallback when data missing)
 */
export async function getVerificationSnippet(businessId, language = 'TR') {
  // First try to find a custom verification snippet
  const customSnippet = await prisma.emailSnippet.findFirst({
    where: {
      businessId,
      intent: 'VERIFICATION',
      language,
      enabled: true
    }
  });

  if (customSnippet) {
    return customSnippet;
  }

  // Return default verification template
  const defaults = {
    TR: {
      name: 'Varsayılan Doğrulama',
      intent: 'VERIFICATION',
      language: 'TR',
      body: `Merhaba {customer_name},

Talebinizi inceleyebilmem için aşağıdaki bilgilerden birini paylaşmanızı rica ederim:
- Sipariş numaranız
- Kayıtlı telefon numaranız

Bu bilgi ile size daha hızlı yardımcı olabilirim.

Teşekkürler,
{business_name}`
    },
    EN: {
      name: 'Default Verification',
      intent: 'VERIFICATION',
      language: 'EN',
      body: `Hello {customer_name},

To help you with your request, I'll need one of the following:
- Your order number
- Your registered phone number

This will help me assist you more quickly.

Thank you,
{business_name}`
    }
  };

  return defaults[language] || defaults.EN;
}

export default {
  getBusinessSnippets,
  getSnippetById,
  createSnippet,
  updateSnippet,
  deleteSnippet,
  selectSnippetsForContext,
  applyVariablesToSnippet,
  formatSnippetsForPrompt,
  recordSnippetUsage,
  getVerificationSnippet,
  extractVariablesFromTemplate
};
