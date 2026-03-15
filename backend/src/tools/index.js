/**
 * Central Tool System
 * Main entry point for all tool operations
 *
 * Usage:
 *   import { getActiveTools, executeTool } from '../tools/index.js';
 *
 *   // Get tools for OpenAI function calling
 *   const tools = getActiveTools(business);
 *
 *   // Execute a tool
 *   const result = await executeTool('create_appointment', args, business, { channel: 'PHONE' });
 */

import registry from './registry.js';
import { getActiveToolNames } from './utils/business-rules.js';
import { normalizeToolArguments } from './argumentNormalizer.js';

const LEGACY_TOOL_ALIASES = Object.freeze({
  check_order_status: 'customer_data_lookup',
  check_order_status_crm: 'customer_data_lookup',
  get_tracking_info: 'customer_data_lookup',
  order_search: 'customer_data_lookup',
  appointment_lookup: 'customer_data_lookup',
  search_products: 'get_product_stock',
  product_lookup: 'get_product_stock',
  inventory_check: 'check_stock_crm',
  price_check: 'check_stock_crm'
});

const LEGACY_TOOL_DEFAULT_ARGS = Object.freeze({
  check_order_status: { query_type: 'siparis' },
  check_order_status_crm: { query_type: 'siparis' },
  get_tracking_info: { query_type: 'siparis' },
  order_search: { query_type: 'siparis' },
  appointment_lookup: { query_type: 'randevu' }
});

function resolveLegacyToolAlias(toolName, args) {
  const requestedToolName = String(toolName || '').trim();
  const resolvedToolName = LEGACY_TOOL_ALIASES[requestedToolName] || requestedToolName;
  const aliasApplied = requestedToolName !== resolvedToolName;
  const resolvedArgs = { ...(args || {}) };

  if (resolvedToolName === 'customer_data_lookup' && !resolvedArgs.query_type) {
    const defaults = LEGACY_TOOL_DEFAULT_ARGS[requestedToolName];
    if (defaults?.query_type) {
      resolvedArgs.query_type = defaults.query_type;
    }
  }

  return { requestedToolName, resolvedToolName, aliasApplied, resolvedArgs };
}

/**
 * Get active tool definitions for a business (OpenAI format)
 * Filters tools based on business type and active integrations
 *
 * @param {Object} business - Business object with businessType and integrations
 * @returns {Object[]} - Array of OpenAI function calling format tool definitions
 */
export function getActiveTools(business) {
  const activeToolNames = getActiveToolNames(business);
  return registry.getDefinitions(activeToolNames);
}

/**
 * Get active tool definitions for 11Labs Conversational AI
 * 11Labs format uses webhook-based tools with different structure
 *
 * @param {Object} business - Business object with businessType and integrations
 * @param {string} serverUrl - Optional server URL (defaults to BACKEND_URL)
 * @returns {Object[]} - Array of tool definitions in 11Labs format
 */
export function getActiveToolsForElevenLabs(business, serverUrl = null, agentId = null) {
  const baseTools = getActiveTools(business);
  const backendUrl = serverUrl || process.env.BACKEND_URL || 'https://api.aicallcenter.app';

  // Include agentId in URL so we can identify the business when tool is called
  // 11Labs webhook doesn't send agent_id in the body, only the tool parameters
  const webhookUrl = agentId
    ? `${backendUrl}/api/elevenlabs/webhook?agentId=${agentId}`
    : `${backendUrl}/api/elevenlabs/webhook`;

  // Convert OpenAI format to 11Labs webhook format
  // Include tool_name in body so webhook knows which tool was called
  return baseTools.map(tool => ({
    type: 'webhook',
    name: tool.function.name,
    description: tool.function.description,
    response_timeout_secs: 20,
    api_schema: {
      url: webhookUrl,
      method: 'POST',
      request_body_schema: {
        type: 'object',
        properties: {
          tool_name: {
            type: 'string',
            description: 'Tool name',
            default: tool.function.name
          },
          ...tool.function.parameters.properties
        },
        required: tool.function.parameters.required || []
      }
    }
  }));
}

/**
 * Execute a tool
 *
 * @param {string} toolName - Name of the tool to execute
 * @param {Object} args - Tool arguments from AI
 * @param {Object} business - Business object with integrations
 * @param {Object} context - Execution context
 * @param {string} context.channel - Channel type: 'PHONE' | 'WHATSAPP' | 'CHAT' | 'EMAIL'
 * @param {string} context.conversationId - Optional conversation ID
 * @param {string} context.messageId - Optional message ID
 * @returns {Object} - Result object with success, data/error, and message
 */
export async function executeTool(toolName, args, business, context = {}) {
  const {
    requestedToolName,
    resolvedToolName,
    aliasApplied,
    resolvedArgs
  } = resolveLegacyToolAlias(toolName, args);

  if (aliasApplied) {
    console.log(`♻️ [Tools] Legacy alias mapped: ${requestedToolName} -> ${resolvedToolName}`);
  }

  // Get handler
  const handler = registry.getHandler(resolvedToolName);

  if (!handler) {
    console.error(`❌ No handler found for tool: ${resolvedToolName}`);
    return {
      success: false,
      error: `Unknown tool: ${requestedToolName}`
    };
  }

  // Verify business has access to this tool
  const activeToolNames = getActiveToolNames(business);

  if (!activeToolNames.includes(resolvedToolName)) {
    console.warn(`⚠️ Tool "${resolvedToolName}" not allowed for business type "${business.businessType}"`);
    return {
      success: false,
      error: business.language === 'TR'
        ? 'Bu işlem mevcut değil.'
        : 'This operation is not available.'
    };
  }

  // NORMALIZATION LAYER: Fill missing args from extractedSlots
  const toolDefinition = registry.getDefinition(resolvedToolName);
  const { normalizedArgs, filledCount } = normalizeToolArguments(
    resolvedToolName,
    resolvedArgs,
    toolDefinition,
    context
  );

  // Use normalized args for execution
  const finalArgs = normalizedArgs;

  // Add normalization metrics to context for observability
  if (filledCount > 0) {
    context._normalizedArgsCount = filledCount;
  }

  // Execute handler
  try {
    const result = await handler.execute(finalArgs, business, context);
    return result;
  } catch (error) {
    console.error(`❌ Tool execution error for ${resolvedToolName}:`, error);

    // Persist to ErrorLog (non-blocking)
    import('../services/errorLogger.js')
      .then(({ logToolError }) => {
        logToolError(resolvedToolName, error, {
          businessId: business?.id,
          endpoint: context?.endpoint || null,
        }).catch(() => {});
      })
      .catch(() => {});

    return {
      success: false,
      error: business.language === 'TR'
        ? 'İşlem sırasında bir hata oluştu.'
        : 'An error occurred during the operation.'
    };
  }
}

/**
 * Get tool definition by name (OpenAI format)
 *
 * @param {string} toolName - Tool name
 * @returns {Object|null} - Tool definition or null
 */
export function getToolDefinition(toolName) {
  return registry.getDefinition(toolName);
}

/**
 * Check if a tool exists
 *
 * @param {string} toolName - Tool name
 * @returns {boolean}
 */
export function hasTool(toolName) {
  return registry.has(toolName);
}

/**
 * Get all registered tool names
 *
 * @returns {string[]} - Array of tool names
 */
export function getAllToolNames() {
  return registry.getAllToolNames();
}

// Export registry for advanced use cases
export { registry };

// Export business rules utilities
export { getActiveToolNames } from './utils/business-rules.js';

// Default export with all functions
export default {
  getActiveTools,
  getActiveToolsForElevenLabs,
  executeTool,
  getToolDefinition,
  hasTool,
  getAllToolNames,
  registry
};
