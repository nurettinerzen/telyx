/**
 * Team Management Routes
 * Handles team members, invitations, and role management
 */

import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission, requireOwner } from '../middleware/permissions.js';
import rateLimit from 'express-rate-limit';
import {
  logInvitationCreated,
  logInvitationAccepted,
  logRoleChanged,
  logMemberRemoved
} from '../utils/auditLogger.js';
import { sendTeamInvitationEmail } from '../services/emailService.js';
import { validatePasswordPolicy, passwordPolicyMessage } from '../security/passwordPolicy.js';
import { issueSession } from '../security/sessionToken.js';

const router = express.Router();

// ============================================================================
// RATE LIMITERS
// ============================================================================

// Invitation send rate limiter (10 invites/hour per user)
const invitationSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: (req) => `invite_send:${req.userId}`,
  message: { error: 'Çok fazla davet gönderdiniz. Lütfen 1 saat sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Invitation accept rate limiter (5 attempts/15min per token)
// Note: We limit by token only (not IP) to avoid IPv6 complexity
// since invitation tokens are single-use anyway
const invitationAcceptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  keyGenerator: (req) => {
    const token = req.body?.token || req.params?.token || 'unknown';
    return `invite_accept:${token}`;
  },
  message: { error: 'Çok fazla deneme yaptınız. Lütfen 15 dakika sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Only count failed attempts
});

// ============================================================================
// TEAM MEMBERS
// ============================================================================

/**
 * GET /api/team
 * List all team members for the business
 */
router.get('/', authenticateToken, checkPermission('team:view'), async (req, res) => {
  try {
    const members = await prisma.user.findMany({
      where: { businessId: req.businessId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        invitedAt: true,
        acceptedAt: true,
        createdAt: true,
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: [
        { role: 'asc' }, // OWNER first
        { createdAt: 'asc' }
      ]
    });

    res.json({
      success: true,
      members,
      count: members.length
    });
  } catch (error) {
    console.error('Get team members error:', error);
    res.status(500).json({ error: 'Ekip üyeleri alınamadı' });
  }
});

/**
 * PUT /api/team/:userId/role
 * Change a team member's role (OWNER only)
 */
router.put('/:userId/role', authenticateToken, requireOwner, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    const targetUserId = parseInt(userId);

    // Validate role
    if (!['MANAGER', 'STAFF'].includes(role)) {
      return res.status(400).json({ error: 'Geçersiz rol. MANAGER veya STAFF seçin.' });
    }

    // Cannot change own role
    if (targetUserId === req.userId) {
      return res.status(400).json({ error: 'Kendi rolünüzü değiştiremezsiniz' });
    }

    // Check if target user belongs to same business
    const targetUser = await prisma.user.findFirst({
      where: {
        id: targetUserId,
        businessId: req.businessId
      }
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    // Cannot change another OWNER's role
    if (targetUser.role === 'OWNER') {
      return res.status(403).json({ error: 'İşletme sahibinin rolü değiştirilemez' });
    }

    // Update role
    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: { role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    });

    // Audit log: Role changed
    await logRoleChanged({
      changerId: req.userId,
      businessId: req.businessId,
      targetUserId,
      oldRole: targetUser.role,
      newRole: role,
      req
    });

    res.json({
      success: true,
      message: 'Rol başarıyla güncellendi',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Rol güncellenemedi' });
  }
});

/**
 * DELETE /api/team/:userId
 * Remove a team member (OWNER only)
 */
router.delete('/:userId', authenticateToken, requireOwner, async (req, res) => {
  try {
    const { userId } = req.params;
    const targetUserId = parseInt(userId);

    // Cannot remove self
    if (targetUserId === req.userId) {
      return res.status(400).json({ error: 'Kendinizi ekipten çıkaramazsınız' });
    }

    // Check if target user belongs to same business
    const targetUser = await prisma.user.findFirst({
      where: {
        id: targetUserId,
        businessId: req.businessId
      }
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    // Cannot remove another OWNER
    if (targetUser.role === 'OWNER') {
      return res.status(403).json({ error: 'İşletme sahibi ekipten çıkarılamaz' });
    }

    // Delete user
    await prisma.user.delete({
      where: { id: targetUserId }
    });

    // Audit log: Member removed
    await logMemberRemoved({
      removerId: req.userId,
      businessId: req.businessId,
      removedUserId: targetUserId,
      removedEmail: targetUser.email,
      req
    });

    res.json({
      success: true,
      message: 'Kullanıcı ekipten çıkarıldı'
    });
  } catch (error) {
    console.error('Remove team member error:', error);
    res.status(500).json({ error: 'Kullanıcı ekipten çıkarılamadı' });
  }
});

// ============================================================================
// INVITATIONS
// ============================================================================

/**
 * GET /api/team/invitations
 * List pending invitations
 */
router.get('/invitations', authenticateToken, checkPermission('team:view'), async (req, res) => {
  try {
    const invitations = await prisma.invitation.findMany({
      where: {
        businessId: req.businessId,
        acceptedAt: null,
        expiresAt: { gt: new Date() }
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        expiresAt: true,
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      invitations,
      count: invitations.length
    });
  } catch (error) {
    console.error('Get invitations error:', error);
    res.status(500).json({ error: 'Davetler alınamadı' });
  }
});

/**
 * POST /api/team/invite
 * Send an invitation to join the team
 * SECURITY: Rate limited (10/hour), validated email/role
 */
router.post('/invite', authenticateToken, checkPermission('team:invite'), invitationSendLimiter, async (req, res) => {
  try {
    const { email, role } = req.body;

    // Validate input
    if (!email || !role) {
      return res.status(400).json({ error: 'Email ve rol gerekli' });
    }

    // Validate role (can only invite MANAGER or STAFF)
    if (!['MANAGER', 'STAFF'].includes(role)) {
      return res.status(400).json({ error: 'Geçersiz rol. MANAGER veya STAFF seçin.' });
    }

    // Check if email already registered in this business
    const existingUser = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        businessId: req.businessId
      }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Bu email zaten ekibinizde kayıtlı' });
    }

    // Check if there's already a pending invitation
    const existingInvitation = await prisma.invitation.findFirst({
      where: {
        email: email.toLowerCase(),
        businessId: req.businessId,
        acceptedAt: null,
        expiresAt: { gt: new Date() }
      }
    });

    if (existingInvitation) {
      return res.status(400).json({
        error: 'Bu email için bekleyen bir davet zaten var',
        existingInvitation: {
          id: existingInvitation.id,
          createdAt: existingInvitation.createdAt,
          expiresAt: existingInvitation.expiresAt
        }
      });
    }

    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');

    // Create invitation (7 days expiry)
    const invitation = await prisma.invitation.create({
      data: {
        email: email.toLowerCase(),
        businessId: req.businessId,
        role,
        token,
        invitedById: req.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      },
      include: {
        business: {
          select: { name: true }
        },
        invitedBy: {
          select: { name: true, email: true }
        }
      }
    });

    // Generate invitation link
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const inviteLink = `${frontendUrl}/invitation#token=${token}`;

    // Send invitation email
    try {
      await sendTeamInvitationEmail({
        email: invitation.email,
        inviterName: invitation.invitedBy.name || invitation.invitedBy.email,
        businessName: invitation.business.name,
        role: invitation.role,
        invitationUrl: inviteLink
      });
      console.log(`✅ Davet emaili gönderildi: ${email}`);
    } catch (emailError) {
      // Email failure should NOT block invitation creation
      console.error('⚠️ Davet emaili gönderilemedi:', emailError);
      console.log(`📧 Manuel davet linki: ${inviteLink}`);
    }

    // Audit log: Invitation created
    await logInvitationCreated({
      inviterId: req.userId,
      businessId: req.businessId,
      inviteeEmail: email,
      role,
      req
    });

    res.status(201).json({
      success: true,
      message: 'Davet başarıyla gönderildi',
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt
      },
      inviteLink // Include for testing purposes
    });
  } catch (error) {
    console.error('Send invitation error:', error);
    res.status(500).json({ error: 'Davet gönderilemedi' });
  }
});

/**
 * DELETE /api/team/invitations/:id
 * Cancel a pending invitation
 */
router.delete('/invitations/:id', authenticateToken, checkPermission('team:invite'), async (req, res) => {
  try {
    const { id } = req.params;
    const invitationId = parseInt(id);

    // Check if invitation belongs to this business
    const invitation = await prisma.invitation.findFirst({
      where: {
        id: invitationId,
        businessId: req.businessId,
        acceptedAt: null
      }
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Davet bulunamadı' });
    }

    // Delete invitation
    await prisma.invitation.delete({
      where: { id: invitationId }
    });

    res.json({
      success: true,
      message: 'Davet iptal edildi'
    });
  } catch (error) {
    console.error('Cancel invitation error:', error);
    res.status(500).json({ error: 'Davet iptal edilemedi' });
  }
});

/**
 * POST /api/team/invitations/:id/resend
 * Resend an invitation (generates new token & expiry)
 */
router.post('/invitations/:id/resend', authenticateToken, checkPermission('team:invite'), async (req, res) => {
  try {
    const { id } = req.params;
    const invitationId = parseInt(id);

    // Check if invitation belongs to this business
    const invitation = await prisma.invitation.findFirst({
      where: {
        id: invitationId,
        businessId: req.businessId,
        acceptedAt: null
      }
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Davet bulunamadı' });
    }

    // Generate new token and extend expiry
    const newToken = crypto.randomBytes(32).toString('hex');

    const updatedInvitation = await prisma.invitation.update({
      where: { id: invitationId },
      data: {
        token: newToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      },
      include: {
        business: { select: { name: true } },
        invitedBy: { select: { name: true, email: true } }
      }
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const inviteLink = `${frontendUrl}/invitation#token=${newToken}`;

    // Resend invitation email
    try {
      await sendTeamInvitationEmail({
        email: updatedInvitation.email,
        inviterName: updatedInvitation.invitedBy.name || updatedInvitation.invitedBy.email,
        businessName: updatedInvitation.business.name,
        role: updatedInvitation.role,
        invitationUrl: inviteLink
      });
      console.log(`✅ Davet emaili yeniden gönderildi: ${updatedInvitation.email}`);
    } catch (emailError) {
      console.error('⚠️ Davet emaili gönderilemedi:', emailError);
      console.log(`📧 Manuel davet linki: ${inviteLink}`);
    }

    res.json({
      success: true,
      message: 'Davet yeniden gönderildi',
      inviteLink
    });
  } catch (error) {
    console.error('Resend invitation error:', error);
    res.status(500).json({ error: 'Davet yeniden gönderilemedi' });
  }
});

// ============================================================================
// PUBLIC INVITATION ENDPOINTS (No auth required)
// ============================================================================

async function findActiveInvitationByToken(token) {
  if (!token) return null;
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: {
      business: {
        select: { name: true }
      },
      invitedBy: {
        select: { name: true, email: true }
      }
    }
  });

  if (!invitation || invitation.acceptedAt || new Date() > invitation.expiresAt) {
    return null;
  }

  return invitation;
}

/**
 * POST /api/team/invitation/lookup
 * Get invitation details by token (public, token in body)
 * SECURITY: Normalized error messages (anti-enumeration)
 */
router.post('/invitation/lookup', async (req, res) => {
  try {
    const { token } = req.body || {};
    const invitation = await findActiveInvitationByToken(token);

    // Normalize error messages (anti-enumeration)
    if (!invitation) {
      return res.status(400).json({
        error: 'Davet linki geçersiz veya süresi dolmuş'
      });
    }

    // Check if email is already registered
    const existingUser = await prisma.user.findFirst({
      where: { email: invitation.email }
    });

    res.json({
      success: true,
      invitation: {
        email: invitation.email,
        role: invitation.role,
        businessName: invitation.business.name,
        invitedBy: invitation.invitedBy.name || invitation.invitedBy.email,
        expiresAt: invitation.expiresAt
      },
      existingUser: !!existingUser
    });
  } catch (error) {
    console.error('Get invitation error:', error);
    res.status(500).json({ error: 'Davet bilgisi alınamadı' });
  }
});

/**
 * POST /api/team/invitation/accept
 * Accept an invitation (public, token in body)
 * SECURITY: Rate limited (5/15min), replay prevention, transaction, normalized errors
 * - If user is logged in: Just add to business
 * - If new user: Requires name and password
 */
router.post('/invitation/accept', invitationAcceptLimiter, async (req, res) => {
  try {
    const { token, name, password } = req.body || {};

    const invitation = await findActiveInvitationByToken(token);

    // Normalize error messages (anti-enumeration + replay prevention)
    if (!invitation) {
      return res.status(400).json({ error: 'Davet linki geçersiz veya süresi dolmuş' });
    }

    // Check if email is already registered
    const existingUser = await prisma.user.findFirst({
      where: { email: invitation.email }
    });

    let user;

    if (existingUser) {
      // User already exists - check if they're in another business
      if (existingUser.businessId !== invitation.businessId) {
        // User is in a different business - for now, prevent this
        // In the future, you might want to support multiple businesses
        return res.status(400).json({
          error: 'Bu email başka bir işletmede kayıtlı. Lütfen farklı bir email kullanın.'
        });
      }

      // User already in this business (shouldn't happen, but handle gracefully)
      return res.status(400).json({
        error: 'Bu email zaten bu işletmede kayıtlı'
      });
    } else {
      // New user - require name and password
      if (!name || !password) {
        return res.status(400).json({
          error: 'Yeni kullanıcı için isim ve şifre gerekli'
        });
      }

      const passwordValidation = validatePasswordPolicy(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          error: passwordPolicyMessage(),
          code: 'WEAK_PASSWORD',
          requirements: passwordValidation.errors,
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // TRANSACTION: Create user + invalidate invitation atomically
      // SECURITY: Prevents race conditions and ensures replay protection
      const result = await prisma.$transaction(async (tx) => {
        // Create new user
        const newUser = await tx.user.create({
          data: {
            email: invitation.email,
            password: hashedPassword,
            name,
            role: invitation.role,
            businessId: invitation.businessId,
            invitedById: invitation.invitedById,
            invitedAt: invitation.createdAt,
            acceptedAt: new Date(),
            onboardingCompleted: true // Skip onboarding for invited team members
          }
        });

        // Hard invalidate token (replay prevention)
        await tx.invitation.update({
          where: { id: invitation.id },
          data: {
            acceptedAt: new Date(),
            token: null // 🔒 Hard invalidate - prevents replay attacks
          }
        });

        return newUser;
      });

      user = result;
    }

    // Audit log: Invitation accepted
    await logInvitationAccepted({
      newUserId: user.id,
      businessId: invitation.businessId,
      email: invitation.email,
      role: invitation.role,
      req
    });

    const jwtToken = issueSession(res, user);

    res.status(201).json({
      success: true,
      message: 'Daveti kabul ettiniz! Hoş geldiniz.',
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      business: {
        id: invitation.business.id,
        name: invitation.business.name
      }
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({ error: 'Davet kabul edilemedi' });
  }
});

export default router;
