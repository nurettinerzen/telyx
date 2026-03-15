/**
 * Tool Required Policy
 *
 * Forces tool lookup before draft generation for certain intents.
 * Prevents AI from making up order statuses, appointment times, etc.
 *
 * Policy: If intent requires data and tool didn't run or failed,
 * draft MUST ask for verification info instead of guessing.
 */
import { ToolOutcome, normalizeOutcome } from '../../../tools/toolResult.js';
import { getMessageVariant } from '../../../messages/messageCatalog.js';

/**
 * Intents that REQUIRE tool data before responding
 * If tool fails or no data, draft must ask for verification
 *
 * EXPANDED: Now covers all factual intents (tracking, pricing, stock, returns, etc.)
 */
// NOTE: requiredFields use CANONICAL tool schema names (via fieldNormalizer.js).
// order_number (not order_id), phone (not phone_number), etc.

// Human-readable labels for internal field names (used in NOT_FOUND messages)
const FIELD_LABELS = {
  TR: {
    order_number: 'sipariş numarası',
    phone: 'telefon numarası',
    invoice_number: 'fatura numarası',
    tracking_number: 'kargo takip numarası',
    ticket_number: 'servis numarası',
    product_id: 'ürün kodu',
    product_name: 'ürün adı',
    sku: 'stok kodu',
    return_number: 'iade numarası',
    email: 'e-posta adresi'
  },
  EN: {
    order_number: 'order number',
    phone: 'phone number',
    invoice_number: 'invoice number',
    tracking_number: 'tracking number',
    ticket_number: 'service ticket number',
    product_id: 'product ID',
    product_name: 'product name',
    sku: 'SKU',
    return_number: 'return number',
    email: 'email address'
  }
};

const TOOL_REQUIRED_INTENTS = {
  ORDER: {
    tools: ['customer_data_lookup'],
    fallbackBehavior: 'ASK_VERIFICATION',
    requiredFields: ['order_number', 'phone'],
    messageKey: 'EMAIL_TOOL_REQUIRED_ORDER'
  },
  BILLING: {
    tools: ['customer_data_lookup'],
    fallbackBehavior: 'ASK_VERIFICATION',
    requiredFields: ['phone', 'invoice_number'],
    messageKey: 'EMAIL_TOOL_REQUIRED_BILLING'
  },
  APPOINTMENT: {
    tools: ['customer_data_lookup'],
    fallbackBehavior: 'ASK_VERIFICATION',
    requiredFields: ['phone'],
    messageKey: 'EMAIL_TOOL_REQUIRED_APPOINTMENT'
  },
  SUPPORT: {
    tools: ['customer_data_lookup'],
    fallbackBehavior: 'ASK_VERIFICATION',
    requiredFields: ['ticket_number', 'phone'],
    messageKey: 'EMAIL_TOOL_REQUIRED_SUPPORT'
  },
  COMPLAINT: {
    tools: ['customer_data_lookup'],
    fallbackBehavior: 'ASK_VERIFICATION',
    requiredFields: ['phone', 'order_number'],
    messageKey: 'EMAIL_TOOL_REQUIRED_COMPLAINT'
  },
  TRACKING: {
    tools: ['customer_data_lookup'],
    fallbackBehavior: 'ASK_VERIFICATION',
    requiredFields: ['tracking_number', 'order_number'],
    messageKey: 'EMAIL_TOOL_REQUIRED_TRACKING'
  },
  PRICING: {
    tools: ['get_product_stock', 'check_stock_crm'],
    fallbackBehavior: 'ASK_VERIFICATION',
    requiredFields: ['product_id', 'product_name'],
    messageKey: 'EMAIL_TOOL_REQUIRED_PRICING'
  },
  STOCK: {
    tools: ['get_product_stock', 'check_stock_crm'],
    fallbackBehavior: 'ASK_VERIFICATION',
    requiredFields: ['product_id', 'sku'],
    messageKey: 'EMAIL_TOOL_REQUIRED_STOCK'
  },
  RETURN: {
    tools: ['customer_data_lookup'],
    fallbackBehavior: 'ASK_VERIFICATION',
    requiredFields: ['order_number', 'return_number'],
    messageKey: 'EMAIL_TOOL_REQUIRED_RETURN'
  },
  REFUND: {
    tools: ['customer_data_lookup'],
    fallbackBehavior: 'ASK_VERIFICATION',
    requiredFields: ['order_number', 'phone'],
    messageKey: 'EMAIL_TOOL_REQUIRED_REFUND'
  },
  ACCOUNT: {
    tools: ['customer_data_lookup'],
    fallbackBehavior: 'ASK_VERIFICATION',
    requiredFields: ['phone', 'email'],
    messageKey: 'EMAIL_TOOL_REQUIRED_ACCOUNT'
  }
};

/**
 * Intents that do NOT require tool data
 * AI can respond based on knowledge base alone
 */
const TOOL_OPTIONAL_INTENTS = [
  'INQUIRY',
  'GENERAL',
  'THANK_YOU',
  'CONFIRMATION',
  'FOLLOW_UP'
];

function getFieldLabel(fieldName, language = 'TR') {
  const lang = String(language || '').toUpperCase() === 'EN' ? 'EN' : 'TR';
  return FIELD_LABELS[lang]?.[fieldName] || FIELD_LABELS.TR?.[fieldName] || fieldName;
}

function buildNeedMinInfoQuestion({
  language = 'TR',
  requiredFields = [],
  reason = 'NO_TOOLS_CALLED'
}) {
  const lang = String(language || '').toUpperCase() === 'EN' ? 'EN' : 'TR';
  const normalizedFields = (Array.isArray(requiredFields) ? requiredFields : []).filter(Boolean);
  const firstField = normalizedFields[0] || 'order_number';
  const fieldLabel = getFieldLabel(firstField, lang);

  if (lang === 'EN') {
    if (reason === 'NOT_FOUND') {
      return `I could not find a matching record with the provided details. Could you share your ${fieldLabel}?`;
    }
    return `Could you share your ${fieldLabel} so I can continue?`;
  }

  if (reason === 'NOT_FOUND') {
    return `Paylaşılan bilgilerle eşleşen kayıt bulamadım. Devam edebilmem için ${fieldLabel} paylaşır mısınız?`;
  }
  return `Devam edebilmem için ${fieldLabel} paylaşır mısınız?`;
}

/**
 * Enforce tool required policy
 *
 * @param {Object} params
 * @param {Object} params.classification - Email classification
 * @param {Array} params.toolResults - Tool execution results
 * @param {string} params.language - Language code (TR/EN)
 * @returns {Object} { enforced, action, message? }
 */
export function enforceToolRequiredPolicy({ classification, toolResults, language }) {
  const intent = classification?.intent;

  // Check if this intent requires tools
  const policy = TOOL_REQUIRED_INTENTS[intent];

  if (!policy) {
    // Intent doesn't require tools
    return {
      enforced: false,
      action: 'PROCEED'
    };
  }

  // Check if required tools were called
  const toolsCalled = toolResults?.map(r => r.toolName) || [];
  const requiredTools = policy.tools;
  const calledRequiredTools = requiredTools.filter(t => toolsCalled.includes(t));

  if (calledRequiredTools.length === 0) {
    // LLM-FIRST: LLM sees tool outcomes and decides how to respond.
    // Don't override draft with deterministic question — LLM already knows
    // no tools were called and will ask for needed info naturally.
    console.log(`⚪ [ToolRequired] Intent ${intent} — no required tools called, LLM-first passthrough`);
    return {
      enforced: false,
      action: 'LLM_FIRST_PASSTHROUGH',
      reason: 'NO_TOOLS_CALLED'
    };
  }

  // Check if any required tool succeeded
  const successfulTools = toolResults?.filter(r =>
    requiredTools.includes(r.toolName) && normalizeOutcome(r.outcome) === ToolOutcome.OK
  ) || [];

  if (successfulTools.length === 0) {
    // Tools were called but none succeeded
    const failedOutcomes = toolResults
      ?.filter(r => requiredTools.includes(r.toolName))
      ?.map(r => ({ tool: r.toolName, outcome: normalizeOutcome(r.outcome) })) || [];

    // Check specific outcomes
    const hasNotFound = failedOutcomes.some(r => r.outcome === ToolOutcome.NOT_FOUND);
    const hasVerificationRequired = failedOutcomes.some(r => r.outcome === ToolOutcome.VERIFICATION_REQUIRED);
    const hasSystemError = failedOutcomes.some(r => r.outcome === ToolOutcome.INFRA_ERROR);

    if (hasSystemError) {
      // System error - use special message
      return {
        enforced: true,
        action: 'SYSTEM_ERROR_FALLBACK',
        message: getMessageVariant('EMAIL_SYSTEM_ERROR_FALLBACK', {
          language,
          directiveType: 'SYSTEM_FALLBACK',
          severity: 'warning',
          intent
        }).text,
        reason: 'SYSTEM_ERROR'
      };
    }

    if (hasVerificationRequired) {
      // Use the tool's own message + askFor when available.
      // This prevents re-asking for data already provided (e.g. order number).
      const verificationToolResult = toolResults?.find(r =>
        requiredTools.includes(r.toolName) && normalizeOutcome(r.outcome) === ToolOutcome.VERIFICATION_REQUIRED
      );
      const toolMessage = verificationToolResult?.message;
      const askFor = verificationToolResult?.askFor || verificationToolResult?._askFor;

      // If tool provided a specific message, use it instead of the generic catalog message.
      // The tool message already knows which field is missing (e.g. phone_last4 only).
      const message = toolMessage || getMessageVariant(policy.messageKey, {
        language,
        directiveType: 'ASK_VERIFICATION',
        severity: 'info',
        intent
      }).text;

      return {
        enforced: true,
        action: 'NEED_MIN_INFO_FOR_TOOL',
        message,
        askFor,   // e.g. 'phone_last4' — propagated for guardrail awareness
        requiredFields: askFor ? [askFor] : policy.requiredFields,
        reason: 'VERIFICATION_REQUIRED'
      };
    }

    if (hasNotFound) {
      // LLM-FIRST: LLM sees NOT_FOUND outcome and responds naturally.
      // No deterministic override — LLM knows the record wasn't found.
      console.log(`⚪ [ToolRequired] Intent ${intent} — NOT_FOUND, LLM-first passthrough`);
      return {
        enforced: false,
        action: 'LLM_FIRST_PASSTHROUGH',
        reason: 'NOT_FOUND'
      };
    }
  }

  // At least one required tool succeeded
  return {
    enforced: false,
    action: 'PROCEED',
    successfulTools: successfulTools.map(t => t.toolName)
  };
}

/**
 * Get tool requirement for an intent
 */
export function getToolRequirement(intent) {
  return TOOL_REQUIRED_INTENTS[intent] || null;
}

/**
 * Check if intent requires tool data
 */
export function intentRequiresTool(intent) {
  return intent in TOOL_REQUIRED_INTENTS;
}

/**
 * RAG Fact Grounding Policy
 *
 * Even with RAG examples, tool-required intents MUST have tool data.
 * RAG provides STYLE guidance, NOT factual data.
 *
 * @param {Object} params
 * @param {Object} params.classification
 * @param {Array} params.toolResults
 * @param {Array} params.ragExamples
 * @returns {Object} { allowRAG, mustUseVerification, reason }
 */
export function enforceFactGrounding({ classification, toolResults, ragExamples }) {
  const intent = classification?.intent;

  // If intent requires tools
  if (intentRequiresTool(intent)) {
    const hasSuccessfulTool = toolResults?.some(r => r.outcome === ToolOutcome.OK);

    if (!hasSuccessfulTool) {
      // Even with RAG, we CANNOT use factual claims
      // RAG examples are for STYLE only, not for order/billing data
      return {
        allowRAG: true,  // Can use for style
        mustUseVerification: true,  // But MUST ask for verification
        ragUsage: 'STYLE_ONLY',  // Instruction to LLM
        reason: 'TOOL_DATA_REQUIRED_FOR_FACTS'
      };
    }
  }

  // Tool data available or not required
  return {
    allowRAG: true,
    mustUseVerification: false,
    ragUsage: 'FULL',
    reason: null
  };
}

/**
 * Get fact grounding instructions for LLM prompt
 */
export function getFactGroundingInstructions(factGrounding, language) {
  if (!factGrounding?.mustUseVerification) {
    return '';
  }

  const instructions = language === 'TR'
    ? `
### FACT GROUNDING (ZORUNLU)
- Sipariş/fatura/randevu bilgisi için TOOL DATA GEREKLİ
- RAG örnekleri SADECE ÜSLUP için kullanılabilir
- Somut veri (sipariş durumu, fiyat, tarih) UYDURMA
- Müşteriden doğrulama bilgisi iste`
    : `
### FACT GROUNDING (REQUIRED)
- Tool data REQUIRED for order/billing/appointment info
- RAG examples are for STYLE ONLY
- Do NOT fabricate specific data (order status, prices, dates)
- Ask customer for verification info`;

  return instructions;
}

export default {
  enforceToolRequiredPolicy,
  getToolRequirement,
  intentRequiresTool,
  enforceFactGrounding,
  getFactGroundingInstructions,
  TOOL_REQUIRED_INTENTS,
  TOOL_OPTIONAL_INTENTS
};
