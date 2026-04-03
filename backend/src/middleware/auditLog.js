/**
 * Admin Audit Logging Middleware
 *
 * P0-C: Track all enterprise admin actions for compliance & security
 *
 * Events tracked:
 * - enterprise_config_created
 * - enterprise_config_updated
 * - enterprise_approved
 * - enterprise_stripe_price_created
 * - enterprise_plan_changed
 */

import prisma from '../prismaClient.js';

/**
 * Create admin audit log entry
 *
 * @param {Object} adminUser - Admin user object { id, email, role }
 * @param {string} event - Event name (enterprise_config_created, etc.)
 * @param {Object} data - Event data
 * @param {string} data.entityType - 'Subscription', 'Business', etc.
 * @param {string|number} data.entityId - Entity ID
 * @param {Object} data.changes - Before/after changes { field: { old, new } }
 * @param {Object} data.metadata - Additional context
 * @param {string} data.ipAddress - Request IP
 * @param {string} data.userAgent - Request user agent
 * @returns {Promise<void>}
 */
export async function createAdminAuditLog(adminUser, event, data) {
  try {
    // Map event to AuditAction enum
    const actionMap = {
      enterprise_config_created: 'CREATE',
      enterprise_config_updated: 'UPDATE',
      enterprise_approved: 'PLAN_CHANGE',
      enterprise_stripe_price_created: 'CREATE',
      enterprise_plan_changed: 'PLAN_CHANGE',
      enterprise_downgrade: 'PLAN_CHANGE',
      enterprise_config_access_denied: 'ACCESS_DENIED',
      enterprise_stripe_access_denied: 'ACCESS_DENIED'
    };

    const action = actionMap[event] || 'UPDATE';

    await prisma.auditLog.create({
      data: {
        adminId: adminUser.id.toString(),
        adminEmail: adminUser.email,
        action,
        entityType: data.entityType || 'Subscription',
        entityId: data.entityId.toString(),
        changes: data.changes || {},
        metadata: {
          event,
          ...data.metadata,
          timestamp: new Date().toISOString()
        },
        ipAddress: data.ipAddress,
        userAgent: data.userAgent
      }
    });

    console.log(`✅ Audit log: ${event} by ${adminUser.email} on ${data.entityType}:${data.entityId}`);
  } catch (error) {
    // CRITICAL: Don't fail the operation if audit log fails
    // But log the error prominently
    console.error('❌ AUDIT LOG FAILED:', error.message);
    console.error('Event:', event);
    console.error('Admin:', adminUser.email);
    console.error('Entity:', data.entityType, data.entityId);

    // TODO: Alert monitoring system (Sentry, CloudWatch, etc.)
  }
}

/**
 * Calculate changes between old and new objects
 *
 * @param {Object} oldObj - Old state
 * @param {Object} newObj - New state
 * @param {string[]} fields - Fields to track
 * @returns {Object} Changes object { field: { old, new } }
 */
export function calculateChanges(oldObj, newObj, fields) {
  const changes = {};

  for (const field of fields) {
    const oldValue = oldObj?.[field];
    const newValue = newObj?.[field];

    // Only record if value actually changed
    if (oldValue !== newValue) {
      changes[field] = {
        old: oldValue === undefined ? null : oldValue,
        new: newValue === undefined ? null : newValue
      };
    }
  }

  return changes;
}

/**
 * Express middleware: Capture request context for audit
 * Usage: router.post('/endpoint', adminAuth, auditContext, handler)
 */
export function auditContext(req, res, next) {
  // Add helper to request object
  req.audit = {
    log: (event, data) => createAdminAuditLog(
      req.adminUser,
      event,
      {
        ...data,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent')
      }
    )
  };

  next();
}

export default {
  createAdminAuditLog,
  calculateChanges,
  auditContext
};
