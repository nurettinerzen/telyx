/**
 * Step 4: Tool Gating for Email
 *
 * Determines which tools are available for this email draft.
 *
 * CRITICAL RULES:
 * 1. Only READ-ONLY tools during draft generation
 * 2. No write operations (create_callback, create_appointment, etc.)
 * 3. Tools gated by:
 *    - Classification (needs_tools)
 *    - Business integrations
 *    - Confidence level
 */

import { getActiveTools } from '../../../tools/index.js';

// Tools that are READ-ONLY and safe for email draft generation
const EMAIL_SAFE_TOOLS = [
  'customer_data_lookup',
  'get_product_stock',
  'check_stock_crm',
  'check_order_status_crm',
  'appointment_lookup',
  'crm_contact_lookup',
  'crm_deal_lookup'
];

// Tools that are WRITE operations - NOT allowed during draft
const EMAIL_BLOCKED_TOOLS = [
  'create_callback',
  'create_appointment',
  'update_appointment',
  'cancel_appointment',
  'order_notification',
  'crm_create_contact',
  'crm_update_contact',
  'crm_create_deal',
  'crm_update_deal'
];

/**
 * Gate tools for email draft generation
 *
 * @param {Object} ctx - Pipeline context
 * @returns {Promise<Object>} { success }
 */
export async function gateEmailTools(ctx) {
  const { business, classification } = ctx;

  try {
    // Get all active tools for this business
    const allTools = getActiveTools(business);

    if (!allTools || allTools.length === 0) {
      ctx.gatedTools = [];
      ctx.gatedToolDefs = [];
      console.log('📧 [ToolGating] No tools available for this business');
      return { success: true };
    }

    // Filter to only email-safe tools
    let gatedTools = allTools.filter(tool => {
      const toolName = tool.function?.name || tool.name;
      return EMAIL_SAFE_TOOLS.includes(toolName) && !EMAIL_BLOCKED_TOOLS.includes(toolName);
    });

    // LLM-FIRST: Even if classifier says needs_tools=false, keep read-only tools available.
    // All EMAIL_SAFE_TOOLS are read-only so there's no risk — LLM decides if it needs data.
    // This prevents classifier parse failures from blocking legitimate tool usage.
    if (!classification.needs_tools) {
      console.log('📧 [ToolGating] Classification says no tools needed — keeping read-only tools available (LLM-first)');
    }

    // NOTE: Confidence-based gating removed for email.
    // All EMAIL_SAFE_TOOLS are already read-only, so additional confidence
    // gating was overly aggressive — it blocked stock/order lookups even when
    // the classifier correctly identified needs_tools: true.
    if (classification.confidence < 0.4) {
      console.log('📧 [ToolGating] Very low confidence (<0.4) - limiting to customer lookup only');
      gatedTools = gatedTools.filter(tool => {
        const toolName = tool.function?.name || tool.name;
        return toolName === 'customer_data_lookup';
      });
    }

    // Extract tool names for logging and state
    ctx.gatedTools = gatedTools.map(t => t.function?.name || t.name);
    ctx.gatedToolDefs = gatedTools;

    console.log(`📧 [ToolGating] Gated tools: ${ctx.gatedTools.join(', ') || 'none'}`);

    // Log blocked tools for debugging
    const requestedButBlocked = allTools
      .filter(t => {
        const name = t.function?.name || t.name;
        return EMAIL_BLOCKED_TOOLS.includes(name);
      })
      .map(t => t.function?.name || t.name);

    if (requestedButBlocked.length > 0) {
      console.log(`📧 [ToolGating] Blocked write tools: ${requestedButBlocked.join(', ')}`);
    }

    return { success: true };

  } catch (error) {
    console.error('❌ [ToolGating] Error:', error);

    // Fail-closed: no tools on error
    ctx.gatedTools = [];
    ctx.gatedToolDefs = [];

    return { success: true }; // Don't fail pipeline, just disable tools
  }
}

/**
 * Check if a specific tool is allowed for email
 *
 * @param {string} toolName
 * @returns {boolean}
 */
export function isToolAllowedForEmail(toolName) {
  return EMAIL_SAFE_TOOLS.includes(toolName) && !EMAIL_BLOCKED_TOOLS.includes(toolName);
}

export default { gateEmailTools, isToolAllowedForEmail };
