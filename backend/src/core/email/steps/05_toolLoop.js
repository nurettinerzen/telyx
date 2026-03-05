/**
 * Step 5: Tool Loop for Email
 *
 * Executes read-only tool lookups before draft generation.
 * This step gathers information that the LLM needs to generate an accurate response.
 *
 * CRITICAL:
 * - Only READ-ONLY operations
 * - Tool result contract MUST include: outcome, data, message
 * - Results are stored for later use in draft generation
 */

import { executeTool } from '../../../tools/index.js';
import { ToolOutcome, ensureMessage, normalizeOutcome } from '../../../tools/toolResult.js';
import { normalizePhone, phoneSearchVariants } from '../../../utils/text.js';
import { tryAutoverify } from '../../../security/autoverify.js';

// Maximum tool calls per email turn
const MAX_TOOL_CALLS = 3;

/**
 * Execute email tool loop (pre-generation lookups)
 *
 * Unlike chat/WhatsApp which does tool calls in LLM loop,
 * email does pre-emptive lookups based on classification.
 *
 * @param {Object} ctx - Pipeline context
 * @returns {Promise<Object>} { success }
 */
export async function executeEmailToolLoop(ctx) {
  const { classification, gatedTools, gatedToolDefs, business, customerEmail, inboundMessage } = ctx;

  ctx.toolResults = [];

  // Skip if no tools available
  if (!gatedTools || gatedTools.length === 0) {
    console.log('📧 [ToolLoop] No tools available, skipping');
    return { success: true };
  }

  // Skip if classification says no tools needed — UNLESS stock/SKU keywords detected
  // P5-FIX: Gemini classifier often sets needs_tools=false for stock queries.
  // Stock keywords in the email body override the classifier's decision.
  if (!classification.needs_tools) {
    const latestBody = inboundMessage?.bodyText || '';
    const latestSubject = inboundMessage?.subject || '';
    const inboundThreadText = (ctx.threadMessages || [])
      .filter(msg => msg.direction === 'INBOUND')
      .map(msg => `${msg.subject || ''}\n${msg.body || msg.bodyText || ''}`)
      .join('\n');
    const signalText = `${latestSubject}\n${latestBody}\n${inboundThreadText}`;

    const hasStockSignal = /(?:stok|stock|ürün\s*durumu|urun|var\s*mı|mevcut)/i.test(signalText) ||
      /\b[A-Z0-9][A-Z0-9\-]{4,}[A-Z0-9]\b/.test(signalText);
    const hasServiceSignal = /(?:servis|service|arıza|ariza|ticket|tamir|onarım|repair)/i.test(signalText);
    const hasIdentifierSignal = Boolean(
      extractOrderNumber(signalText) ||
      extractTicket(signalText) ||
      extractPhone(signalText) ||
      extractVkn(signalText) ||
      extractTc(signalText)
    );
    const intentNeedsFactLookup = ['ORDER', 'BILLING', 'SUPPORT', 'COMPLAINT', 'FOLLOW_UP']
      .includes(String(classification.intent || '').toUpperCase());

    if (!hasIdentifierSignal && !intentNeedsFactLookup && (!hasStockSignal || hasServiceSignal)) {
      console.log('📧 [ToolLoop] Classification indicates no tools needed');
      return { success: true };
    }

    console.log('📧 [ToolLoop] Classification says no tools, but identifier/fact signal detected — overriding');
  }

  try {
    const toolsToRun = determineToolsToRun(classification, gatedTools, inboundMessage, ctx.threadMessages);

    if (toolsToRun.length === 0) {
      console.log('📧 [ToolLoop] No applicable tools for this email');
      return { success: true };
    }

    console.log(`📧 [ToolLoop] Running ${toolsToRun.length} pre-generation lookups`);

    for (const toolConfig of toolsToRun.slice(0, MAX_TOOL_CALLS)) {
      const { name, args } = toolConfig;

      console.log(`📧 [ToolLoop] Executing: ${name}`);

      const startTime = Date.now();

      // Build email-specific state for the tool.
      // Email is stateless across turns, so we synthesize a 'pending' verification
      // state when we detect this is a follow-up email where the customer is providing
      // verification info (name/phone) after being asked for it.
      const emailState = buildEmailToolState(ctx, name, args);

      const result = await executeTool(name, args, business, {
        channel: 'EMAIL',
        fromEmail: ctx.customerEmail || null,  // Email identity signal (separate from channelUserId)
        sessionId: ctx.thread.id,
        messageId: ctx.inboundMessage.id,
        language: ctx.language,
        state: emailState  // Pass state so verification flow works in email
      });

      const executionTime = Date.now() - startTime;

      // ════════════════════════════════════════════════════════════════════
      // CHANNEL IDENTITY PROOF AUTOVERIFY (Email Pipeline)
      // ════════════════════════════════════════════════════════════════════
      // When tool returns VERIFICATION_REQUIRED + _identityContext,
      // attempt autoverify using the sender's email as channel proof.
      // Uses the same shared helper as chat/WA pipeline.
      // ════════════════════════════════════════════════════════════════════
      const autoverifyResult = await tryAutoverify({
        toolResult: result,
        toolName: name,
        business,
        state: emailState,
        language: ctx.language,
        metrics: ctx.metrics
      });

      if (autoverifyResult.applied) {
        console.log('📧 [ToolLoop] Autoverify succeeded — tool result overridden to OK');
      }

      // Ensure message is always present (critical for LLM context)
      const validatedResult = ensureMessage(result, name, generateDefaultMessage(name, result));

      // Store result with full contract
      const toolResult = {
        toolName: name,
        args,
        outcome: normalizeOutcome(validatedResult.outcome) || (validatedResult.success ? ToolOutcome.OK : ToolOutcome.INFRA_ERROR),
        success: validatedResult.success,
        data: validatedResult.data || null,
        message: validatedResult.message, // Now guaranteed to exist
        executionTime,
        _askFor: result._identityContext ? (result.stateEvents?.[0]?.askFor || null) : null  // Preserve askFor for guardrails
      };

      ctx.toolResults.push(toolResult);

      console.log(`📧 [ToolLoop] ${name} result:`, {
        outcome: toolResult.outcome,
        hasData: !!toolResult.data,
        message: toolResult.message?.substring(0, 50)
      });

      // If we got customer data, store it prominently
      if (name === 'customer_data_lookup' && validatedResult.success && validatedResult.data) {
        ctx.customerData = validatedResult.data;
      }
    }

    return { success: true };

  } catch (error) {
    console.error('❌ [ToolLoop] Error:', error);

    // Don't fail pipeline, just record error
    ctx.toolResults.push({
      toolName: 'LOOP_ERROR',
      outcome: ToolOutcome.INFRA_ERROR,
      success: false,
      message: error.message
    });

    return { success: true };
  }
}

/**
 * Determine which tools to run based on classification and email content
 *
 * CRITICAL: Aggregates identifiers from ALL inbound messages in the thread,
 * not just the latest. This is essential for multi-turn email verification:
 *   Email 1: "ORD-12345 siparişim nerede?" → order number extracted
 *   Email 2: "Telefonum 05XX isim Emre Taş" → phone + name extracted
 *   → Tool gets ALL identifiers combined for successful lookup+verification
 *
 * @param {Object} classification
 * @param {Array} availableTools
 * @param {Object} inboundMessage - Latest inbound message
 * @param {Array} threadMessages - All messages in thread (for identifier aggregation)
 * @returns {Array} Tools to run with args
 */
function determineToolsToRun(classification, availableTools, inboundMessage, threadMessages = []) {
  const toolsToRun = [];

  // Aggregate ALL inbound message bodies for identifier extraction
  // Priority: latest message first, then older messages fill gaps
  const latestBody = inboundMessage.bodyText || '';
  const latestSubject = inboundMessage.subject || '';
  const latestContent = `${latestSubject}\n${latestBody}`;

  // Collect all inbound message bodies + subjects (excluding outbound = our replies)
  const allInboundContents = (threadMessages || [])
    .filter(msg => msg.direction === 'INBOUND')
    .map(msg => `${msg.subject || ''}\n${msg.body || msg.bodyText || ''}`)
    .filter(Boolean);

  // Combined text from all inbound messages (for identifier extraction + subject fallback)
  const combinedContent = allInboundContents.join('\n');

  // Extract from latest message first, then fall back to combined thread
  const extractedPhone = extractPhone(latestContent) || extractPhone(combinedContent);
  const extractedOrderNumber = extractOrderNumber(latestContent) || extractOrderNumber(combinedContent);
  const extractedName = extractCustomerName(latestBody) || extractCustomerName(combinedContent);
  const extractedVkn = extractVkn(latestContent) || extractVkn(combinedContent);
  const extractedTc = extractTc(latestContent) || extractTc(combinedContent);
  const extractedTicket = extractTicket(latestContent) || extractTicket(combinedContent);
  // Extract phone last 4 digits from latest message content (follow-up verification answer)
  const extractedLast4 = extractPhoneLast4(latestContent);
  const hasServiceSignal = /(?:servis|service|arıza|ariza|ticket|tamir|onarım|repair|rma)/i.test(latestContent)
    || /(?:servis|service|arıza|ariza|ticket|tamir|onarım|repair|rma)/i.test(combinedContent);
  const hasStockSignal = /(?:stok|stock|ürün\s*(?:durumu|bilgisi)|urun|var\s*mı|mevcut)/i.test(latestContent);

  console.log('📧 [ToolLoop] Extracted identifiers (aggregated from thread):', {
    phone: !!extractedPhone,
    orderNumber: extractedOrderNumber,
    name: extractedName,
    vkn: !!extractedVkn,
    tc: !!extractedTc,
    ticket: extractedTicket,
    last4: extractedLast4,
    threadMessagesCount: allInboundContents.length
  });

  // Determine query_type based on classification intent
  const intentToQueryType = {
    'ORDER': 'siparis',
    'BILLING': 'muhasebe',
    'APPOINTMENT': 'randevu',
    'SUPPORT': 'ariza',
    'COMPLAINT': 'siparis',  // Complaints usually about orders
    'INQUIRY': 'genel',
    'FOLLOW_UP': 'genel',
    'GENERAL': 'genel'
  };

  // customer_data_lookup: The universal lookup tool
  // Runs whenever we have ANY identifier (phone, order number, vkn, tc, ticket)
  if (availableTools.includes('customer_data_lookup')) {
    const actionableIntents = ['ORDER', 'BILLING', 'APPOINTMENT', 'SUPPORT', 'COMPLAINT', 'FOLLOW_UP', 'INQUIRY', 'GENERAL'];
    const hasTicketStatusTool = availableTools.includes('check_ticket_status_crm');

    if (actionableIntents.includes(classification.intent)) {
      const hasAnyIdentifier = extractedPhone || extractedOrderNumber || extractedVkn || extractedTc || extractedTicket;
      const preferTicketTool = hasTicketStatusTool
        && (classification.intent === 'SUPPORT' || hasServiceSignal)
        && (extractedTicket || extractedPhone);

      if (hasAnyIdentifier && !preferTicketTool) {
        const queryType = classification.intent === 'FOLLOW_UP' && extractedOrderNumber
          ? 'siparis'
          : (intentToQueryType[classification.intent] || 'genel');
        const args = { query_type: queryType };

        // Add all found identifiers
        if (extractedPhone) args.phone = extractedPhone;
        if (extractedOrderNumber) args.order_number = extractedOrderNumber;
        if (extractedVkn) args.vkn = extractedVkn;
        if (extractedTc) args.tc = extractedTc;
        if (extractedTicket) args.ticket_number = extractedTicket;
        if (extractedName) args.customer_name = extractedName;

        // Set verification_input for single-pass email verification.
        // Priority: name > last4 > full phone (all accepted by verifyAgainstAnchor).
        // Tool handler uses this ONLY when state.verification.status === 'pending'
        // (which buildEmailToolState synthesizes for email channel).
        if (extractedName) {
          args.verification_input = extractedName;
        } else if (extractedLast4) {
          // Customer sent just 4 digits (phone last 4) as a follow-up verification answer
          args.verification_input = extractedLast4;
        } else if (extractedPhone) {
          // Phone serves double duty: lookup identifier AND verification input.
          // verifyAgainstAnchor accepts full phone (10+ digits) as valid verification.
          args.verification_input = extractedPhone;
        }

        toolsToRun.push({
          name: 'customer_data_lookup',
          args
        });
      }
    }
  }

  // Ticket/service lookup should take precedence in support threads.
  if (availableTools.includes('check_ticket_status_crm')) {
    const supportContext = classification.intent === 'SUPPORT' || hasServiceSignal || !!extractedTicket;

    if (supportContext && (extractedTicket || extractedPhone)) {
      const args = {};
      if (extractedTicket) args.ticket_number = extractedTicket;
      if (extractedPhone) args.phone = extractedPhone;
      if (extractedName) args.verification_input = extractedName;

      toolsToRun.push({
        name: 'check_ticket_status_crm',
        args
      });
    }
  }

  // Stock lookup if product/stock/SKU mentioned and this is NOT a service/ticket context.
  // Prevents "service status" emails from falling into stock fallback.
  if (availableTools.includes('check_stock_crm')) {
    const stockKeywords = /(?:stok|stock|ürün\s*(?:durumu|bilgisi)|urun|var\s*mı|mevcut)/i;
    // SKU pattern: alphanumeric codes with hyphens (e.g. SMOKE-IPH16P, CK212LGT29)
    const skuPattern = /\b([A-Z0-9][A-Z0-9\-]{4,}[A-Z0-9])\b/;
    const hasStockKeyword = hasStockSignal || stockKeywords.test(combinedContent);
    const skuMatch = latestBody.match(skuPattern);
    const isServiceContext = classification.intent === 'SUPPORT' || hasServiceSignal || !!extractedTicket;

    if (!isServiceContext && (hasStockKeyword || skuMatch)) {
      // Try to extract product name or SKU code
      // Strategy 1: SKU code (most reliable)
      let productName = skuMatch ? skuMatch[1].trim() : null;

      // Strategy 2: Text after "stok durumu/bilgisi" keywords
      if (!productName) {
        const productMatch = latestBody.match(/(?:stok|stock)\s*(?:durumu|bilgisi)?[:\s]*(.+?)(?:\?|$)/im);
        if (productMatch) productName = productMatch[1].trim();
      }

      // Strategy 3: Text before "stok" keyword (e.g. "iPhone 16 Pro stokta var mı")
      if (!productName) {
        const beforeStok = latestBody.match(/([A-ZÇĞİÖŞÜa-zçğıöşü0-9\s\-]{3,40}?)\s*(?:stok|stock|var\s*mı)/i);
        if (beforeStok) productName = beforeStok[1].trim();
      }

      if (productName) {
        toolsToRun.push({
          name: 'check_stock_crm',
          args: { product_name: productName }
        });
      }
    }
  }

  // Appointment lookup for appointment intents
  if (availableTools.includes('appointment_lookup')) {
    if (classification.intent === 'APPOINTMENT' && extractedPhone) {
      toolsToRun.push({
        name: 'appointment_lookup',
        args: { phone_number: extractedPhone }
      });
    }
  }

  return toolsToRun;
}

// ════════════════════════════════════════════════════════════════════
// Email State Builder
// ════════════════════════════════════════════════════════════════════

/**
 * Build a synthetic state object for email tool execution.
 *
 * WHY THIS IS NEEDED:
 * Email pipeline is stateless — each turn starts fresh. But the
 * customer_data_lookup tool has an anti-single-shot-bypass security
 * check (line ~463-493 in the tool handler) that:
 *   1. If customer_name is provided AND state.verification.status !== 'pending'
 *   2. It checks name match, but STILL forces VERIFICATION_REQUIRED
 *   3. This prevents chat users from guessing names in a single message
 *
 * For EMAIL, this creates an infinite loop:
 *   Email 1: Customer asks for order → tool returns VERIFICATION_REQUIRED
 *   Email 2: Customer provides name → tool STILL returns VERIFICATION_REQUIRED
 *            (because state.verification.status is never 'pending' in email)
 *   Email 3: Customer provides name again → still VERIFICATION_REQUIRED → ∞
 *
 * SOLUTION: When we detect this is a multi-turn email thread where:
 *   - There are previous outbound messages (we already replied)
 *   - The current message provides verification info (name/phone)
 *   - We have enough identifiers to perform a lookup
 *   Then we synthesize a 'pending' verification state so the tool
 *   processes the verification input instead of looping.
 *
 * SECURITY: This only works when the customer provides CORRECT name
 * matching the anchor record. The tool still validates against the anchor.
 *
 * @param {Object} ctx - Pipeline context
 * @param {string} toolName - Tool being called
 * @param {Object} args - Tool arguments
 * @returns {Object} State object for tool execution
 */
function buildEmailToolState(ctx, toolName, args) {
  const state = {};

  // Only applies to customer_data_lookup with verification_input
  if (toolName !== 'customer_data_lookup' || !args.verification_input) {
    return state;
  }

  const outboundMessages = (ctx.threadMessages || []).filter(msg => msg.direction === 'OUTBOUND');
  const hasOutboundHistory = outboundMessages.length > 0;
  const hasPriorVerificationPrompt = outboundMessages.some((msg) => {
    const text = `${msg.subject || ''} ${msg.body || ''} ${msg.content || ''}`.toLowerCase();
    return /(?:doğrulama|verification|son\s*4|last\s*(?:4|four)|kimlik\s*doğrulama|registered phone|kayıtlı telefon|ad\s*soyad|isim\s*soyisim|full name|name and surname|adınızı|isminizi)/i.test(text);
  });

  const verificationDigits = String(args.verification_input).replace(/\D/g, '');
  const looksNumericVerification = verificationDigits.length === 4 || verificationDigits.length >= 10;
  const shouldAllowNameFollowUp = !looksNumericVerification && hasPriorVerificationPrompt;
  const shouldAllowNumericFollowUp = looksNumericVerification && hasOutboundHistory;

  if (!shouldAllowNameFollowUp && !shouldAllowNumericFollowUp) {
    // SECURITY: block single-shot bypass on first email turn.
    // Name follow-up is allowed only after an explicit verification prompt.
    return state;
  }

  console.log('📧 [ToolLoop] Email channel — synthesizing pending verification state for follow-up');
  state.verification = {
    status: 'pending',
    pendingField: looksNumericVerification
      ? (verificationDigits.length === 4 ? 'phone_last4' : 'phone')
      : 'name',
    attempts: 0
  };

  return state;
}

// ════════════════════════════════════════════════════════════════════
// Identifier Extraction Helpers
// ════════════════════════════════════════════════════════════════════

/**
 * Extract phone number from text
 * Supports Turkish (+90/0XXX), US (+1XXX), and other international formats.
 *
 * Strategy: Try patterns from most specific to most general.
 * We normalize and return the first match.
 */
function extractPhone(text) {
  if (!text) return null;

  // Pattern 1: International with + prefix: +1 424 527 5089, +90 532 123 4567, +44 7911 123456
  const intlMatch = text.match(/\+\d[\d\s\-().]{7,18}\d/);
  if (intlMatch) return normalizePhone(intlMatch[0]);

  // Pattern 2: Turkish mobile/landline: 0532 123 45 67 or 532 123 45 67
  const trMatch = text.match(/(?:0)?[2-5]\d{2}[\s\-.]?\d{3}[\s\-.]?\d{2}[\s\-.]?\d{2}/);
  if (trMatch) return normalizePhone(trMatch[0]);

  // Pattern 3: North American: (424) 527-5089, 424-527-5089, 424 527 5089
  const naMatch = text.match(/\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/);
  if (naMatch) return normalizePhone(naMatch[0]);

  // Pattern 4: Bare digits that look like phone (10-15 digits, possibly with spaces/dashes)
  const bareMatch = text.match(/\d[\d\s\-]{8,17}\d/);
  if (bareMatch) {
    const digits = bareMatch[0].replace(/\D/g, '');
    // Only accept if 10-15 digits (plausible phone number length)
    if (digits.length >= 10 && digits.length <= 15) {
      return normalizePhone(bareMatch[0]);
    }
  }

  return null;
}

/**
 * Extract order number from text (multiple patterns)
 */
function extractOrderNumber(text) {
  if (!text) return null;

  // Pattern 1: Explicit order prefix (ORD-12345, SIP-12345, etc.)
  // Most reliable — always check first
  const prefixMatch = text.match(/\b(ORD-[\w-]+|SIP-[\w-]+|SP-[\w-]+)\b/i);
  if (prefixMatch) return prefixMatch[1].trim();

  // Pattern 2: "sipariş no: 12345" or "order number: 12345"
  // Requires a separator (: # - or whitespace) after "no/numarası" keyword
  // The number must start with a digit to avoid matching words like "Merhaba"
  const keywordMatch = text.match(
    /(?:sipariş|order|siparis)\s*(?:no|numarası|numarasi|number|num)[:\s#-]+(\d[\w-]{3,})/i
  );
  if (keywordMatch) return keywordMatch[1].trim();

  // Pattern 3: "sipariş numaranız 202620321" or "sipariş 202620321"
  // Number must start with a digit (prevents matching regular Turkish words)
  const directMatch = text.match(
    /(?:sipariş|order|siparis)\s*(?:numaranız|numaraniz|numarası|numarasi)?\s*[:;]?\s*(\d[\w-]{5,})/i
  );
  if (directMatch) return directMatch[1].trim();

  // Pattern 3.5: "3769479 sipariş nolu" / "123456 order no"
  const reverseKeywordMatch = text.match(
    /\b(\d[\w-]{4,})\s*(?:(?:nolu|numaralı|numarali|numarası|numarasi|no(?:lu|su)?)\s*)?(?:sipariş|siparis|order)\b/i
  );
  if (reverseKeywordMatch) return reverseKeywordMatch[1].trim();
  const reverseKeywordMatchTrailing = text.match(
    /\b(\d[\w-]{4,})\s*(?:sipariş|siparis|order)\s*(?:nolu|numaralı|numarali|numarası|numarasi|no(?:lu|su)?)\b/i
  );
  if (reverseKeywordMatchTrailing) return reverseKeywordMatchTrailing[1].trim();

  // Pattern 4: Hashtag format (#12345)
  // Number must start with a digit
  const hashMatch = text.match(/#\s*(\d[\w-]{3,})/i);
  if (hashMatch) return hashMatch[1].trim();

  return null;
}

/**
 * Extract customer name from text
 *
 * Supports patterns:
 * - "ismim Emre" / "adım Emre"
 * - "isim Emre soyadım Taş" / "isim Emre soyad Taş"
 * - "ben Emre Taş"
 * - "adım Emre Taş"
 * - "Merve Aktaş" (when preceded by "isim" or "ad" context)
 */
function extractCustomerName(text) {
  if (!text) return null;

  // Pattern 1: "isim X soyadım Y" / "ismim X soyadım Y"
  const fullNameMatch = text.match(
    /(?:ismim|isim|adım|adim)\s+([A-ZÇĞİÖŞÜa-zçğıöşü]+)\s+(?:soyadım|soyadim|soyad|soyadi|soyadı)\s+([A-ZÇĞİÖŞÜa-zçğıöşü]+)/i
  );
  if (fullNameMatch) {
    return `${fullNameMatch[1].trim()} ${fullNameMatch[2].trim()}`;
  }

  // Pattern 2: "ismim X Y" / "adım X Y" / "ben X Y" (2-3 word name)
  const nameMatch = text.match(
    /(?:ismim|adım|adim|ben)\s+([A-ZÇĞİÖŞÜa-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜa-zçğıöşü]+){0,2})/i
  );
  if (nameMatch) {
    // Clean: strip trailing words that are NOT part of a name (e.g. "ben Emre telefon" → "Emre")
    let name = nameMatch[1].trim();
    // Remove trailing keywords that aren't names
    const trailingKeywords = /\s+(telefon|numara|sipariş|siparis|soyadım|soyadim|ve|ile|email|mail)\b.*$/i;
    name = name.replace(trailingKeywords, '').trim();
    return name || null;
  }

  return null;
}

/**
 * Extract phone last 4 digits from text.
 * Matches standalone 4-digit numbers (not part of a longer number).
 * Used for follow-up verification emails where customer sends just "8674".
 */
function extractPhoneLast4(text) {
  if (!text) return null;
  // Match a standalone 4-digit number (not adjacent to other digits)
  const match = text.match(/(?<!\d)\d{4}(?!\d)/);
  if (!match) return null;
  // Avoid false positives: if text also contains a full phone or order number, skip
  // Only return last4 when the text is very short (likely just the 4 digits)
  // or the 4 digits appear with verification-related context
  const trimmed = text.trim();
  // Short message (< 20 chars): very likely a verification answer
  if (trimmed.length < 20) return match[0];
  // Contains verification context keywords
  if (/(?:son\s*4|last\s*4|doğrulama|verification|telefon.*hane)/i.test(text)) {
    return match[0];
  }
  return null;
}

/**
 * Extract VKN (10-digit tax ID) from text
 */
function extractVkn(text) {
  if (!text) return null;
  const match = text.match(/(?:vkn|vergi\s*(?:kimlik)?(?:\s*no)?)[:\s]*(\d{10})\b/i);
  return match ? match[1] : null;
}

/**
 * Extract TC (11-digit national ID) from text
 */
function extractTc(text) {
  if (!text) return null;
  const match = text.match(/(?:tc|t\.?c\.?\s*(?:kimlik)?(?:\s*no)?)[:\s]*(\d{11})\b/i);
  return match ? match[1] : null;
}

/**
 * Extract ticket/service number from text
 */
function extractTicket(text) {
  if (!text) return null;
  const match = text.match(/(?:arıza|ariza|servis|ticket|bilet)\s*(?:no|numarası|numarasi|number)?[:\s#-]*([A-Z0-9][\w-]{3,})/i);
  return match ? match[1].trim() : null;
}

/**
 * Generate a default message for tool results that lack one
 * This ensures the LLM always has context about what happened
 */
function generateDefaultMessage(toolName, result) {
  const outcome = normalizeOutcome(result.outcome) || (result.success ? ToolOutcome.OK : ToolOutcome.INFRA_ERROR);

  switch (outcome) {
    case ToolOutcome.OK:
      if (result.data) {
        return `${toolName} lookup successful. Data retrieved.`;
      }
      return `${toolName} completed successfully.`;

    case ToolOutcome.NOT_FOUND:
      return `${toolName}: No matching record found. The customer may need to provide additional information for verification.`;

    case ToolOutcome.VALIDATION_ERROR:
      return `${toolName}: Invalid input provided. Please check the format and try again.`;

    case ToolOutcome.VERIFICATION_REQUIRED:
      return `${toolName}: Customer identity verification is required before accessing this information.`;

    case ToolOutcome.INFRA_ERROR:
      return `${toolName}: A technical issue occurred. The customer should be informed that we're looking into it.`;

    default:
      return `${toolName} completed with status: ${outcome}`;
  }
}

export default { executeEmailToolLoop };
