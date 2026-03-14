/**
 * Step 3: Classify Email
 *
 * Classifies the inbound email to determine:
 * - Intent/topic (order, billing, ticket, appointment, general, etc.)
 * - Urgency level
 * - Whether tools are needed
 * - Language confirmation
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Classification prompt
const CLASSIFICATION_PROMPT = `You are an email classifier for a business assistant.

Analyze this email and return a JSON object with:
- intent: One of [ORDER, BILLING, APPOINTMENT, SUPPORT, COMPLAINT, TRACKING, PRICING, STOCK, RETURN, REFUND, ACCOUNT, INQUIRY, FOLLOW_UP, CONFIRMATION, THANK_YOU, GENERAL]
- urgency: One of [LOW, MEDIUM, HIGH, URGENT]
- needs_tools: Boolean - does this email require looking up customer/order data?
- topic: Brief 2-3 word topic description
- sentiment: One of [POSITIVE, NEUTRAL, NEGATIVE]
- actionable: Boolean - does this email require a response or action?

Examples:
- "Where is my order #12345?" → intent: ORDER, needs_tools: true, urgency: MEDIUM
- "B21-ORD-2026-0025 siparişim ne durumda?" → intent: ORDER, needs_tools: true, urgency: MEDIUM
- "Sipariş numarası: ORD-2026-0100" → intent: ORDER, needs_tools: true, urgency: MEDIUM
- "Kargom nerede? Takip numarası: TR123456789" → intent: TRACKING, needs_tools: true, urgency: MEDIUM
- "Bu ürünün fiyatı nedir?" → intent: PRICING, needs_tools: true, urgency: LOW
- "X ürünü stokta var mı?" → intent: STOCK, needs_tools: true, urgency: LOW
- "İade etmek istiyorum" → intent: RETURN, needs_tools: true, urgency: MEDIUM
- "Paramı geri istiyorum" → intent: REFUND, needs_tools: true, urgency: HIGH
- "Hesap bilgilerimi güncellemek istiyorum" → intent: ACCOUNT, needs_tools: true, urgency: LOW
- "Thanks for your help!" → intent: THANK_YOU, needs_tools: false, urgency: LOW
- "I need to reschedule my appointment" → intent: APPOINTMENT, needs_tools: true, urgency: MEDIUM
- "Your service is terrible, I want a refund" → intent: COMPLAINT, needs_tools: true, urgency: HIGH
- "Faturamı görmek istiyorum" → intent: BILLING, needs_tools: true, urgency: MEDIUM

IMPORTANT: If the email contains an order number (like #12345, ORD-xxx, B21-ORD-xxx) or asks about an order, classify as ORDER, not GENERAL.
If the email asks about tracking/shipping, classify as TRACKING.
If the email asks about returns/exchanges, classify as RETURN.
If the email asks about refunds/money back, classify as REFUND.

Return ONLY valid JSON, no markdown or explanation.`;

/**
 * Classify the inbound email
 *
 * @param {Object} ctx - Pipeline context
 * @returns {Promise<Object>} { success, error? }
 */
export async function classifyEmail(ctx) {
  const { inboundMessage, subject, customerName } = ctx;

  try {
    const emailContent = `
From: ${customerName || 'Customer'} <${ctx.customerEmail}>
Subject: ${subject}

${inboundMessage.bodyText || ''}
`.trim();

    // Use Gemini Flash for fast classification
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 500,
        responseMimeType: 'application/json'
      }
    });

    const prompt = `${CLASSIFICATION_PROMPT}

Email to classify:
---
${emailContent}
---

JSON response:`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse JSON response
    let classification;
    try {
      // Clean response — strip markdown, extract JSON object
      let cleanedResponse = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      // If response contains JSON embedded in text, extract it
      if (!cleanedResponse.startsWith('{')) {
        const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleanedResponse = jsonMatch[0];
        }
      }

      classification = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.warn('⚠️ [ClassifyEmail] Failed to parse classification, using defaults. Raw response:', responseText?.substring(0, 200));
      classification = getDefaultClassification();
    }

    // Validate and normalize
    ctx.classification = normalizeClassification(classification);

    // Apply heuristic override for GENERAL/INQUIRY with order/tracking patterns
    const emailText = `${subject || ''} ${inboundMessage?.bodyText || ''}`;
    ctx.classification = applyIntentHeuristic(ctx.classification, emailText);

    console.log(`📧 [ClassifyEmail] Intent: ${ctx.classification.intent}, Urgency: ${ctx.classification.urgency}`);
    console.log(`📧 [ClassifyEmail] Needs tools: ${ctx.classification.needs_tools}, Actionable: ${ctx.classification.actionable}`);

    return { success: true };

  } catch (error) {
    console.error('❌ [ClassifyEmail] Error:', error);

    // Use default classification on error (fail-open for classification)
    ctx.classification = getDefaultClassification();

    console.warn('⚠️ [ClassifyEmail] Using default classification due to error');
    return { success: true }; // Don't fail the pipeline for classification errors
  }
}

/**
 * Get default classification for fallback
 */
function getDefaultClassification() {
  // CRITICAL: needs_tools MUST be true in default/fallback classification.
  // When Gemini classification fails (API key error, timeout, etc.),
  // we fall back to this default. If needs_tools is false, the email
  // tool loop is skipped entirely → no CRM data fetched → LLM hallucinates.
  // Tools have their own security controls (verification, gating), so
  // letting them run on fallback is safe. Better to run tools unnecessarily
  // than to skip them and produce hallucinated responses.
  return {
    intent: 'GENERAL',
    urgency: 'MEDIUM',
    needs_tools: true,
    topic: 'General inquiry',
    sentiment: 'NEUTRAL',
    actionable: true,
    confidence: 0.5
  };
}

/**
 * Normalize and validate classification
 */
// Post-classification heuristic: override GENERAL when order/tracking patterns are present
const ORDER_NUMBER_PATTERN = /\b(?:B\d+-ORD-\d{4}-\d+|ORD-\d{4}-\d+|#\d{4,}|sipari[sş]\s*(?:no|numaras[ıi])\s*[:.]?\s*\S+)/i;
const TRACKING_NUMBER_PATTERN = /\b(?:TR\d{9,}|kargo\s*takip|tracking\s*(?:number|no|id))\b/i;
const RETURN_PATTERN = /\b(?:iade|return|exchange|değişim|degisim)\b/i;
const REFUND_PATTERN = /\b(?:refund|para\s*iade|geri\s*(?:ödeme|odeme)|paramı?\s*geri)\b/i;

function applyIntentHeuristic(classification, emailText) {
  if (classification.intent !== 'GENERAL' && classification.intent !== 'INQUIRY') {
    return classification;
  }

  const text = String(emailText || '');

  if (ORDER_NUMBER_PATTERN.test(text)) {
    console.log('📧 [ClassifyEmail] Heuristic override: GENERAL → ORDER (order number detected)');
    return { ...classification, intent: 'ORDER', needs_tools: true };
  }
  if (TRACKING_NUMBER_PATTERN.test(text)) {
    console.log('📧 [ClassifyEmail] Heuristic override: GENERAL → TRACKING (tracking pattern detected)');
    return { ...classification, intent: 'TRACKING', needs_tools: true };
  }
  if (REFUND_PATTERN.test(text)) {
    console.log('📧 [ClassifyEmail] Heuristic override: GENERAL → REFUND (refund pattern detected)');
    return { ...classification, intent: 'REFUND', needs_tools: true };
  }
  if (RETURN_PATTERN.test(text)) {
    console.log('📧 [ClassifyEmail] Heuristic override: GENERAL → RETURN (return pattern detected)');
    return { ...classification, intent: 'RETURN', needs_tools: true };
  }

  return classification;
}

function normalizeClassification(raw) {
  const validIntents = ['ORDER', 'BILLING', 'APPOINTMENT', 'SUPPORT', 'COMPLAINT', 'TRACKING', 'PRICING', 'STOCK', 'RETURN', 'REFUND', 'ACCOUNT', 'INQUIRY', 'FOLLOW_UP', 'CONFIRMATION', 'THANK_YOU', 'GENERAL'];
  const validUrgencies = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  const validSentiments = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'];

  return {
    intent: validIntents.includes(raw.intent?.toUpperCase())
      ? raw.intent.toUpperCase()
      : 'GENERAL',
    urgency: validUrgencies.includes(raw.urgency?.toUpperCase())
      ? raw.urgency.toUpperCase()
      : 'MEDIUM',
    needs_tools: Boolean(raw.needs_tools),
    topic: raw.topic || 'General',
    sentiment: validSentiments.includes(raw.sentiment?.toUpperCase())
      ? raw.sentiment.toUpperCase()
      : 'NEUTRAL',
    actionable: raw.actionable !== false, // Default to actionable
    confidence: raw.confidence || 0.8
  };
}

export default { classifyEmail };
