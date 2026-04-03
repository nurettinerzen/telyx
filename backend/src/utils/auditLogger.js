/**
 * Audit Logger for Business Events
 *
 * Minimal P0 implementation:
 * - invitation_created
 * - invitation_accepted
 * - role_changed
 * - member_removed
 * - login_failed
 */

import prisma from '../prismaClient.js';

/**
 * Log an audit event
 * @param {Object} params
 * @param {string} params.action - Event type
 * @param {number} params.actorUserId - Who performed the action
 * @param {number} params.businessId - Which business
 * @param {number} params.targetUserId - Target user (optional)
 * @param {string} params.targetEmail - Target email (optional)
 * @param {Object} params.metadata - Additional data
 * @param {string} params.ipAddress - IP address
 * @param {string} params.userAgent - User agent
 */
export async function logAuditEvent({
  action,
  actorUserId,
  businessId,
  targetUserId = null,
  targetEmail = null,
  metadata = null,
  ipAddress = null,
  userAgent = null
}) {
  try {
    // For now, log to console + database (if BusinessAuditLog model exists)
    const logEntry = {
      action,
      actorUserId,
      businessId,
      targetUserId,
      targetEmail,
      metadata,
      ipAddress,
      userAgent,
      timestamp: new Date()
    };

    console.log('📝 AUDIT LOG:', JSON.stringify(logEntry, null, 2));

    // Try to save to database (will fail gracefully if model doesn't exist)
    try {
      await prisma.businessAuditLog.create({
        data: {
          action,
          actorUserId,
          businessId,
          targetUserId,
          targetEmail,
          metadata,
          ipAddress,
          userAgent
        }
      });
    } catch (dbError) {
      // Model doesn't exist yet - console log is enough for P0
      if (!dbError.message.includes('Invalid `prisma.businessAuditLog`')) {
        console.error('Audit log DB error:', dbError);
      }
    }
  } catch (error) {
    // Audit logging should NEVER block main operation
    console.error('Audit log error:', error);
  }
}

/**
 * Helper: Log invitation created
 */
export async function logInvitationCreated({ inviterId, businessId, inviteeEmail, role, req }) {
  return logAuditEvent({
    action: 'invitation_created',
    actorUserId: inviterId,
    businessId,
    targetEmail: inviteeEmail,
    metadata: { role },
    ipAddress: req?.ip,
    userAgent: req?.headers?.['user-agent']
  });
}

/**
 * Helper: Log invitation accepted
 */
export async function logInvitationAccepted({ newUserId, businessId, email, role, req }) {
  return logAuditEvent({
    action: 'invitation_accepted',
    actorUserId: newUserId, // Self-action
    businessId,
    targetUserId: newUserId,
    targetEmail: email,
    metadata: { role },
    ipAddress: req?.ip,
    userAgent: req?.headers?.['user-agent']
  });
}

/**
 * Helper: Log role changed
 */
export async function logRoleChanged({ changerId, businessId, targetUserId, oldRole, newRole, req }) {
  return logAuditEvent({
    action: 'role_changed',
    actorUserId: changerId,
    businessId,
    targetUserId,
    metadata: { oldRole, newRole },
    ipAddress: req?.ip,
    userAgent: req?.headers?.['user-agent']
  });
}

/**
 * Helper: Log member removed
 */
export async function logMemberRemoved({ removerId, businessId, removedUserId, removedEmail, req }) {
  return logAuditEvent({
    action: 'member_removed',
    actorUserId: removerId,
    businessId,
    targetUserId: removedUserId,
    targetEmail: removedEmail,
    ipAddress: req?.ip,
    userAgent: req?.headers?.['user-agent']
  });
}

/**
 * Helper: Log login attempt
 */
export async function logLoginAttempt({ userId, email, success, reason, req }) {
  return logAuditEvent({
    action: success ? 'login_success' : 'login_failed',
    actorUserId: userId,
    businessId: null, // Login happens before business context
    targetEmail: email,
    metadata: { success, reason },
    ipAddress: req?.ip,
    userAgent: req?.headers?.['user-agent']
  });
}

export default {
  logAuditEvent,
  logInvitationCreated,
  logInvitationAccepted,
  logRoleChanged,
  logMemberRemoved,
  logLoginAttempt
};
