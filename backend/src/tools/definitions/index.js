/**
 * Tool Definitions Index
 * Exports all ACTIVE tool definitions
 *
 * Active tools:
 * - create_appointment: Appointments for service businesses
 * - send_order_notification: Order notifications to business owners
 * - get_product_stock: E-commerce product stock (Shopify/WooCommerce)
 * - customer_data_lookup: Universal customer data lookup (Orders, Accounting, Support, etc.)
 * - check_stock_crm: CRM stock lookup
 * - create_callback: Callback scheduling
 *
 * REMOVED (replaced by customer_data_lookup):
 * - check_order_status: REMOVED - use customer_data_lookup instead
 * - get_tracking_info: REMOVED - use customer_data_lookup instead
 * - check_order_status_crm: REMOVED - duplicate of customer_data_lookup CRM order query
 * - check_ticket_status_crm: REMOVED - duplicate of customer_data_lookup CRM ticket query
 */

import createAppointment from './appointment.js';
import sendOrderNotification from './order-notification.js';
import getProductStock from './product-stock.js';
// CRM Tools
import checkStockCrm from './crm-stock.js';
// Customer Data Tool (replaces check_order_status, get_tracking_info, check_order_status_crm, check_ticket_status_crm)
import customerDataLookup from './customer-data-lookup.js';
// Callback Tool
import createCallback from './create-callback.js';

// Export all definitions as an array
export const definitions = [
  createAppointment,
  sendOrderNotification,
  getProductStock,
  // CRM Tools
  checkStockCrm,
  // Customer Data Tool
  customerDataLookup,
  // Callback Tool
  createCallback
];

// Export individual definitions
export {
  createAppointment,
  sendOrderNotification,
  getProductStock,
  // CRM Tools
  checkStockCrm,
  // Customer Data Tool
  customerDataLookup,
  // Callback Tool
  createCallback
};

// Export as default map for easy lookup
const definitionsMap = {};
definitions.forEach(def => {
  definitionsMap[def.name] = def;
});

export default definitionsMap;
