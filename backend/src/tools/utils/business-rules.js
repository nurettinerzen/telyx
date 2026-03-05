/**
 * Business Rules for Tool Access
 * Defines which business types can access which tools
 *
 * ACTIVE TOOLS (tested, production-ready):
 * - create_appointment: Creates appointments, saves to DB + Google Calendar
 * - send_order_notification: Sends order notification to business owner
 * - check_order_status: E-commerce order lookup (Shopify/WooCommerce via aggregator)
 * - get_product_stock: E-commerce product stock check (Shopify/WooCommerce via aggregator)
 * - get_tracking_info: E-commerce shipping tracking (Shopify/WooCommerce via aggregator)
 * - check_stock_crm: CRM stock lookup (custom webhook)
 * - customer_data_lookup: Customer data lookup (from Excel/CSV import) + CRM order/ticket lookup
 * - create_callback: Create callback request (geri arama talebi)
 *
 * REMOVED:
 * - check_order_status_crm: REMOVED - duplicate of customer_data_lookup CRM order query
 * - check_ticket_status_crm: REMOVED - duplicate of customer_data_lookup CRM ticket query
 *
 * NOTE: Paraşüt is NOT an AI tool - it's a dashboard feature for business owners.
 * Payment tools (iyzico) are disabled until explicitly needed.
 */

// Business type -> allowed tools mapping
export const BUSINESS_TYPE_TOOLS = {
  RESTAURANT: [
    'create_appointment',      // Table reservation - ✅ WORKING
    'send_order_notification', // Food orders - ✅ WORKING
    'customer_data_lookup',    // ✅ Customer data lookup
    'create_callback'          // ✅ Geri arama talebi
  ],
  SALON: [
    'create_appointment',      // Hair/beauty appointments - ✅ WORKING
    'customer_data_lookup',    // ✅ Customer data lookup
    'create_callback'          // ✅ Geri arama talebi
  ],
  CLINIC: [
    'create_appointment',      // Medical appointments - ✅ WORKING
    'customer_data_lookup',    // ✅ Customer data lookup
    'create_callback'          // ✅ Geri arama talebi
  ],
  SERVICE: [
    'create_appointment',      // Service appointments - ✅ WORKING
    'check_stock_crm',         // ✅ CRM stock
    'customer_data_lookup',    // ✅ Customer data lookup + CRM orders/tickets
    'create_callback'          // ✅ Geri arama talebi
  ],
  ECOMMERCE: [
    'check_order_status',      // ✅ Shopify/WooCommerce via aggregator
    'get_product_stock',       // ✅ Shopify/WooCommerce via aggregator
    'get_tracking_info',       // ✅ Shopify/WooCommerce via aggregator
    'check_stock_crm',         // ✅ CRM stock
    'customer_data_lookup',    // ✅ Customer data lookup + CRM orders/tickets
    'create_callback'          // ✅ Geri arama talebi
  ],
  OTHER: [
    'create_appointment',      // Generic appointments - ✅ WORKING
    'check_stock_crm',         // ✅ CRM stock
    'customer_data_lookup',    // ✅ Customer data lookup + CRM orders/tickets
    'create_callback'          // ✅ Geri arama talebi
  ]
};

// Integration type -> tools that require it
// Tools are only enabled if the business has the corresponding integration active
export const INTEGRATION_REQUIRED_TOOLS = {
  'GOOGLE_CALENDAR': [],
  'SHOPIFY': ['check_order_status', 'get_product_stock', 'get_tracking_info'],
  'WOOCOMMERCE': ['check_order_status', 'get_product_stock', 'get_tracking_info'],
  'IKAS': ['check_order_status', 'get_product_stock', 'get_tracking_info'],
  'IDEASOFT': ['check_order_status', 'get_product_stock', 'get_tracking_info'],
  'TICIMAX': ['check_order_status', 'get_product_stock', 'get_tracking_info'],
  'CRM_WEBHOOK': ['check_stock_crm']
};

// Tools that work without any specific integration
export const STANDALONE_TOOLS = [
  'create_appointment',
  'send_order_notification',
  'customer_data_lookup',  // ✅ Always available - handler checks for data and returns appropriate message
  'create_callback'        // ✅ Geri arama talebi - tüm iş tiplerine açık
];

/**
 * Get active tool names for a business type
 * @param {string} businessType - Business type (RESTAURANT, SALON, etc.)
 * @returns {string[]} - Array of tool names allowed for this business type
 */
export function getToolsForBusinessType(businessType) {
  return BUSINESS_TYPE_TOOLS[businessType] || BUSINESS_TYPE_TOOLS['OTHER'];
}

/**
 * Filter tools based on active integrations
 * @param {string[]} toolNames - Array of tool names to filter
 * @param {Object[]} integrations - Array of active integrations
 * @param {Object} crmWebhook - CRM webhook object (optional)
 * @param {Object} crmDataCounts - CRM data counts { orders, stock, tickets }
 * @param {Object} customerDataCount - Customer data count (optional)
 * @returns {string[]} - Filtered array of tool names that have required integrations
 */
export function filterToolsByIntegrations(toolNames, integrations = [], crmWebhook = null, crmDataCounts = null, customerDataCount = 0) {
  const activeIntegrationTypes = integrations
    .filter(i => i.isActive && i.connected)
    .map(i => i.type);

  // Add CRM_WEBHOOK if CRM webhook is active
  // Note: Data existence is checked by handlers at runtime (return notFound if no data)
  if (crmWebhook?.isActive) {
    activeIntegrationTypes.push('CRM_WEBHOOK');
  }

  return toolNames.filter(toolName => {
    // Standalone tools always available
    if (STANDALONE_TOOLS.includes(toolName)) {
      return true;
    }

    // CRM tools: Enable if CRM_WEBHOOK integration is active
    // Handlers check data existence at runtime and return appropriate notFound messages
    const crmTools = ['check_stock_crm'];
    if (crmTools.includes(toolName)) {
      return activeIntegrationTypes.includes('CRM_WEBHOOK');
    }

    // Check if any required integration is active
    for (const [integrationType, requiredTools] of Object.entries(INTEGRATION_REQUIRED_TOOLS)) {
      if (requiredTools.includes(toolName) && activeIntegrationTypes.includes(integrationType)) {
        return true;
      }
    }

    return false;
  });
}

/**
 * Get active tool names for a business (combining business type and integrations)
 * @param {Object} business - Business object with businessType, integrations, crmWebhook, crmDataCounts, and customerDataCount
 * @returns {string[]} - Array of active tool names
 */
export function getActiveToolNames(business) {
  const businessType = business.businessType || 'OTHER';
  const integrations = business.integrations || [];
  const crmWebhook = business.crmWebhook || null;
  const crmDataCounts = business.crmDataCounts || null;
  const customerDataCount = business.customerDataCount || 0;

  // Get tools allowed for business type
  const allowedTools = getToolsForBusinessType(businessType);

  // Filter by active integrations (including CRM webhook and customer data)
  return filterToolsByIntegrations(allowedTools, integrations, crmWebhook, crmDataCounts, customerDataCount);
}

export default {
  BUSINESS_TYPE_TOOLS,
  INTEGRATION_REQUIRED_TOOLS,
  STANDALONE_TOOLS,
  getToolsForBusinessType,
  filterToolsByIntegrations,
  getActiveToolNames
};
