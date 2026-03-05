/**
 * Tool Handlers Index
 * Exports all ACTIVE tool handlers with their execute functions
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

import appointmentHandler from './appointment.js';
import orderNotificationHandler from './order-notification.js';
import productStockHandler from './product-stock.js';
// CRM Handlers
import crmStockHandler from './crm-stock.js';
// Customer Data Handler - State-based verification (replaces check_order_status, get_tracking_info, check_order_status_crm, check_ticket_status_crm)
import customerDataLookupHandler from './customer-data-lookup.js';
// Callback Handler
import createCallbackHandler from './create-callback.js';

// Tool name -> handler mapping
const handlers = {
  'create_appointment': appointmentHandler,
  'send_order_notification': orderNotificationHandler,
  'get_product_stock': productStockHandler,
  // CRM Handlers
  'check_stock_crm': crmStockHandler,
  // Customer Data Handler (state-based verification)
  'customer_data_lookup': customerDataLookupHandler,
  // Callback Handler
  'create_callback': createCallbackHandler
};

export default handlers;

// Also export individual handlers for direct access
export {
  appointmentHandler,
  orderNotificationHandler,
  productStockHandler,
  // CRM Handlers
  crmStockHandler,
  // Customer Data Handler
  customerDataLookupHandler,
  // Callback Handler
  createCallbackHandler
};
