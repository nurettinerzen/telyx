/**
 * Embed Security Management Routes
 * Authenticated endpoints for managing embed keys
 */

import express from 'express';
import crypto from 'crypto';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission, requireOwner } from '../middleware/permissions.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/embed-security/info
 * Get current embed key info (masked)
 */
router.get('/info', checkPermission('assistant', 'read'), async (req, res) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.businessId },
      select: {
        chatEmbedKey: true,
        chatWidgetEnabled: true,
        createdAt: true
      }
    });

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Mask the embed key (show last 8 chars)
    const maskedKey = business.chatEmbedKey
      ? `***${business.chatEmbedKey.slice(-8)}`
      : null;

    res.json({
      hasKey: !!business.chatEmbedKey,
      maskedKey,
      widgetEnabled: business.chatWidgetEnabled,
      keyCreatedAt: business.createdAt
    });
  } catch (error) {
    console.error('❌ Get embed info error:', error);
    res.status(500).json({ error: 'Failed to get embed key info' });
  }
});

/**
 * POST /api/embed-security/rotate
 * Rotate (regenerate) embed key
 * SECURITY: Requires OWNER permission
 */
router.post('/rotate', requireOwner, async (req, res) => {
  try {
    const { confirmRotation } = req.body;

    if (!confirmRotation) {
      return res.status(400).json({
        error: 'Confirmation required',
        message: 'Set confirmRotation: true to rotate embed key. This will invalidate all existing embeds.'
      });
    }

    // Generate new cryptographically secure embed key (64 hex chars = 32 bytes)
    const newEmbedKey = crypto.randomBytes(32).toString('hex');

    const business = await prisma.business.update({
      where: { id: req.businessId },
      data: {
        chatEmbedKey: newEmbedKey
      },
      select: {
        chatEmbedKey: true,
        chatWidgetEnabled: true
      }
    });

    console.log(`✅ Embed key rotated for business ${req.businessId}`);

    res.json({
      success: true,
      message: 'Embed key rotated successfully',
      newKey: business.chatEmbedKey,
      widgetEnabled: business.chatWidgetEnabled,
      warning: 'Update all embedded widgets with the new key'
    });
  } catch (error) {
    console.error('❌ Rotate embed key error:', error);
    res.status(500).json({ error: 'Failed to rotate embed key' });
  }
});

/**
 * DELETE /api/embed-security/revoke
 * Revoke (delete) embed key
 * SECURITY: Requires OWNER permission
 */
router.delete('/revoke', requireOwner, async (req, res) => {
  try {
    const { confirmRevocation } = req.body;

    if (!confirmRevocation) {
      return res.status(400).json({
        error: 'Confirmation required',
        message: 'Set confirmRevocation: true to revoke embed key. This will disable all embeds.'
      });
    }

    await prisma.business.update({
      where: { id: req.businessId },
      data: {
        chatEmbedKey: null,
        chatWidgetEnabled: false
      }
    });

    console.log(`✅ Embed key revoked for business ${req.businessId}`);

    res.json({
      success: true,
      message: 'Embed key revoked successfully',
      warning: 'All embedded widgets are now disabled'
    });
  } catch (error) {
    console.error('❌ Revoke embed key error:', error);
    res.status(500).json({ error: 'Failed to revoke embed key' });
  }
});

/**
 * POST /api/embed-security/generate
 * Generate initial embed key if none exists
 * SECURITY: Requires OWNER permission
 */
router.post('/generate', requireOwner, async (req, res) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.businessId },
      select: { chatEmbedKey: true }
    });

    if (business.chatEmbedKey) {
      return res.status(400).json({
        error: 'Embed key already exists',
        message: 'Use /rotate to generate a new key'
      });
    }

    // Generate new embed key
    const newEmbedKey = crypto.randomBytes(32).toString('hex');

    await prisma.business.update({
      where: { id: req.businessId },
      data: {
        chatEmbedKey: newEmbedKey
      }
    });

    console.log(`✅ Embed key generated for business ${req.businessId}`);

    res.json({
      success: true,
      message: 'Embed key generated successfully',
      embedKey: newEmbedKey
    });
  } catch (error) {
    console.error('❌ Generate embed key error:', error);
    res.status(500).json({ error: 'Failed to generate embed key' });
  }
});

/**
 * GET /api/embed-security/usage
 * Get embed usage statistics
 */
router.get('/usage', checkPermission('assistant', 'read'), async (req, res) => {
  try {
    // Count embed-based conversations (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const embedUsage = await prisma.chatLog.count({
      where: {
        businessId: req.businessId,
        createdAt: { gte: thirtyDaysAgo },
        // Add embed-specific filter if you track source
      }
    });

    res.json({
      embedConversations: embedUsage,
      period: 'Last 30 days'
    });
  } catch (error) {
    console.error('❌ Get embed usage error:', error);
    res.status(500).json({ error: 'Failed to get usage statistics' });
  }
});

export default router;
