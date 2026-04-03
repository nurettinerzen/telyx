/**
 * Feature Flags for Controlled Rollout
 *
 * Manages pilot business allowlist for gradual RAG/snippet deployment.
 * Supports single-business, cohort, and global rollback.
 */

import prisma from '../../prismaClient.js';

/**
 * Check if a feature is enabled for a business
 *
 * @param {string} businessId - Business ID
 * @param {string} feature - Feature name ('RAG_PILOT', 'SNIPPET_PILOT', 'AUTO_DRAFT')
 * @returns {Promise<boolean>} True if feature enabled
 */
export async function isFeatureEnabled(businessId, feature) {
  try {
    // Check if business is in pilot allowlist
    const pilot = await prisma.pilotBusiness.findFirst({
      where: {
        businessId,
        feature
      }
    });

    if (!pilot) {
      return false; // Not in pilot → feature disabled
    }

    // Check business-level flag (double-check)
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        emailRagEnabled: true,
        emailSnippetsEnabled: true,
        emailAutoSend: true
      }
    });

    if (!business) {
      return false;
    }

    // Feature-specific checks
    if (feature === 'RAG_PILOT') {
      return business.emailRagEnabled || false;
    }

    if (feature === 'SNIPPET_PILOT') {
      return business.emailSnippetsEnabled || false;
    }

    if (feature === 'AUTO_DRAFT') {
      return business.emailAutoSend || false;
    }

    return false;

  } catch (error) {
    console.error(`❌ [FeatureFlags] Error checking feature ${feature} for business ${businessId}:`, error);
    return false; // Fail closed (feature disabled on error)
  }
}

/**
 * Add business to pilot allowlist
 *
 * @param {Object} params
 * @param {string} params.businessId - Business ID
 * @param {string} params.feature - Feature name
 * @param {string} params.enabledBy - Admin user who enabled
 * @param {string} params.notes - Optional notes
 * @returns {Promise<Object>} Created pilot record
 */
export async function enableFeatureForBusiness({ businessId, feature, enabledBy, notes }) {
  try {
    // Insert into pilot allowlist
    const pilot = await prisma.pilotBusiness.create({
      data: {
        businessId,
        feature,
        enabledBy,
        notes: notes || null
      }
    });

    console.log(`✅ [FeatureFlags] Enabled ${feature} for business ${businessId} by ${enabledBy}`);

    // Update business-level flag
    const updates = {};
    if (feature === 'RAG_PILOT') {
      updates.emailRagEnabled = true;
    } else if (feature === 'SNIPPET_PILOT') {
      updates.emailSnippetsEnabled = true;
    } else if (feature === 'AUTO_DRAFT') {
      updates.emailAutoSend = true;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.business.update({
        where: { id: businessId },
        data: updates
      });
    }

    return pilot;

  } catch (error) {
    console.error(`❌ [FeatureFlags] Error enabling feature ${feature} for business ${businessId}:`, error);
    throw error;
  }
}

/**
 * Remove business from pilot allowlist (rollback)
 *
 * @param {string} businessId - Business ID
 * @param {string} feature - Feature name
 * @returns {Promise<number>} Number of records deleted
 */
export async function disableFeatureForBusiness(businessId, feature) {
  try {
    // Delete pilot entry
    const result = await prisma.pilotBusiness.deleteMany({
      where: {
        businessId,
        feature
      }
    });

    console.log(`🚨 [FeatureFlags] Disabled ${feature} for business ${businessId}`);

    // Update business-level flag
    const updates = {};
    if (feature === 'RAG_PILOT') {
      updates.emailRagEnabled = false;
    } else if (feature === 'SNIPPET_PILOT') {
      updates.emailSnippetsEnabled = false;
    } else if (feature === 'AUTO_DRAFT') {
      updates.emailAutoSend = false;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.business.update({
        where: { id: businessId },
        data: updates
      });
    }

    return result.count;

  } catch (error) {
    console.error(`❌ [FeatureFlags] Error disabling feature ${feature} for business ${businessId}:`, error);
    throw error;
  }
}

/**
 * EMERGENCY ROLLBACK: Disable feature globally
 * Removes ALL pilot businesses for a feature
 *
 * @param {string} feature - Feature name to disable
 * @param {string} reason - Reason for rollback (logged)
 * @returns {Promise<number>} Number of businesses affected
 */
export async function disableFeatureGlobally(feature, reason) {
  console.log(`🚨 [FeatureFlags] GLOBAL ROLLBACK: Disabling ${feature} - Reason: ${reason}`);

  try {
    // Delete all pilot entries for this feature
    const result = await prisma.pilotBusiness.deleteMany({
      where: { feature }
    });

    console.log(`✅ [FeatureFlags] Disabled ${feature} for ${result.count} businesses`);

    // Disable business-level flags for all
    const updates = {};
    if (feature === 'RAG_PILOT') {
      updates.emailRagEnabled = false;
    } else if (feature === 'SNIPPET_PILOT') {
      updates.emailSnippetsEnabled = false;
    } else if (feature === 'AUTO_DRAFT') {
      updates.emailAutoSend = false;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.business.updateMany({
        data: updates
      });
    }

    // Log rollback incident
    console.error(`🚨🚨🚨 [FeatureFlags] EMERGENCY ROLLBACK EXECUTED: ${feature} - ${reason} - Affected ${result.count} businesses`);

    return result.count;

  } catch (error) {
    console.error(`❌ [FeatureFlags] CRITICAL: Failed to execute global rollback for ${feature}:`, error);
    throw error;
  }
}

/**
 * Get all pilot businesses for a feature
 *
 * @param {string} feature - Feature name
 * @returns {Promise<Array>} List of pilot businesses
 */
export async function getPilotBusinesses(feature) {
  try {
    const pilots = await prisma.pilotBusiness.findMany({
      where: { feature },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            emailRagEnabled: true,
            emailSnippetsEnabled: true
          }
        }
      },
      orderBy: { enabledAt: 'asc' }
    });

    return pilots;

  } catch (error) {
    console.error(`❌ [FeatureFlags] Error getting pilot businesses for ${feature}:`, error);
    return [];
  }
}

/**
 * Get pilot status for a business
 *
 * @param {string} businessId - Business ID
 * @returns {Promise<Object>} Pilot status { features: [...], isPilot: boolean }
 */
export async function getPilotStatus(businessId) {
  try {
    const pilots = await prisma.pilotBusiness.findMany({
      where: { businessId }
    });

    return {
      isPilot: pilots.length > 0,
      features: pilots.map(p => ({
        feature: p.feature,
        enabledAt: p.enabledAt,
        enabledBy: p.enabledBy,
        notes: p.notes
      }))
    };

  } catch (error) {
    console.error(`❌ [FeatureFlags] Error getting pilot status for business ${businessId}:`, error);
    return { isPilot: false, features: [] };
  }
}

export default {
  isFeatureEnabled,
  enableFeatureForBusiness,
  disableFeatureForBusiness,
  disableFeatureGlobally,
  getPilotBusinesses,
  getPilotStatus
};
