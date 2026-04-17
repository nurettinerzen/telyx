import express from 'express';
import prisma from '../prismaClient.js';
import bcrypt from 'bcrypt';
import { authenticateToken } from '../middleware/auth.js';
import { requireRecentAuth } from '../middleware/reauth.js';
import { validatePasswordPolicy, passwordPolicyMessage } from '../security/passwordPolicy.js';
import { clearSessionCookie, issueSession } from '../security/sessionToken.js';
import {
  hardDeleteSelfUser,
  hardDeleteWorkspaceForOwner,
  isValidDeleteAccountConfirmation,
} from '../services/accountDeletion.js';

const router = express.Router();

const SETTINGS_SUBSCRIPTION_SELECT = {
  id: true,
  businessId: true,
  plan: true,
  status: true,
  paymentProvider: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  balance: true,
  minutesLimit: true,
  minutesUsed: true,
  includedMinutesUsed: true,
  overageMinutes: true,
  concurrentLimit: true,
  assistantsLimit: true,
  phoneNumbersLimit: true
};

function parseAliases(value) {
  if (value == null) return [];

  const candidates = Array.isArray(value)
    ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
    : String(value)
      .split(/[\n,;]+/g)
      .map((entry) => entry.trim())
      .filter(Boolean);

  const deduped = [];
  const seen = new Set();

  for (const candidate of candidates) {
    const normalized = candidate
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(candidate.slice(0, 80));
    if (deduped.length >= 20) break;
  }

  return deduped;
}

function sanitizeIdentitySummary(value) {
  if (value == null) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 600) : null;
}

// GET /api/settings/profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const businessId = req.businessId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        aliases: true,
        identitySummary: true,
        businessType: true,
        language: true,
        country: true,
        timezone: true,
      },
    });

    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      select: SETTINGS_SUBSCRIPTION_SELECT
    });

    // Return in format frontend expects
    res.json({
      name: user?.name || '', // User's actual name
      email: user?.email || '',
      company: business?.name || '',  // Business name as company
      user,
      business,
      subscription,
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /api/settings/profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const businessId = req.businessId;
    const {
      name,
      email,
      company,
      businessName,
      language,
      businessType,
      country,
      timezone,
      aliases,
      businessAliases,
      identitySummary
    } = req.body;

    // Update user name if provided
    let updatedUser = null;
    if (name !== undefined) {
      updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { name },
        select: { id: true, email: true, name: true, role: true }
      });
    }

    // Update business - accept both 'company' and 'businessName' for compatibility
    const newBusinessName = company || businessName;

    const businessUpdateData = {};
    if (newBusinessName !== undefined) businessUpdateData.name = newBusinessName;
    if (language !== undefined) businessUpdateData.language = language.toUpperCase();
    if (businessType !== undefined) businessUpdateData.businessType = businessType.toUpperCase();
    if (country !== undefined) businessUpdateData.country = country.toUpperCase();
    if (timezone !== undefined) businessUpdateData.timezone = timezone;
    if (aliases !== undefined || businessAliases !== undefined) {
      businessUpdateData.aliases = parseAliases(aliases !== undefined ? aliases : businessAliases);
    }
    if (identitySummary !== undefined) {
      businessUpdateData.identitySummary = sanitizeIdentitySummary(identitySummary);
    }

    let updatedBusiness = null;
    if (Object.keys(businessUpdateData).length > 0) {
      updatedBusiness = await prisma.business.update({
        where: { id: businessId },
        data: businessUpdateData,
      });
      console.log(`✅ Business updated: ${updatedBusiness.name} (ID: ${businessId})`, businessUpdateData);
    }

    // Fetch current state to return
    const currentUser = updatedUser || await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true }
    });

    const currentBusiness = updatedBusiness || await prisma.business.findUnique({
      where: { id: businessId }
    });

    res.json({
      message: 'Profile updated successfully',
      user: currentUser,
      business: currentBusiness,
      name: currentUser?.name || '',
      email: currentUser?.email || '',
      company: currentBusiness?.name || '',
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /api/settings/change-password
router.post('/change-password', authenticateToken, requireRecentAuth(15), async (req, res) => {
  try {
    const userId = req.userId;
    const { currentPassword, newPassword, terminateAllSessions = true } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    const passwordValidation = validatePasswordPolicy(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        error: passwordPolicyMessage(),
        code: 'WEAK_PASSWORD',
        requirements: passwordValidation.errors,
      });
    }

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        ...(terminateAllSessions ? { tokenVersion: { increment: 1 } } : {}),
      },
      select: {
        id: true,
        email: true,
        role: true,
        businessId: true,
        tokenVersion: true,
      },
    });

    issueSession(res, updatedUser, { amr: ['pwd'] });

    console.log(`✅ Password changed for user ${userId}`);
    res.json({
      message: 'Password changed successfully',
      sessionsRevoked: Boolean(terminateAllSessions),
    });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

router.post('/delete-account', authenticateToken, requireRecentAuth(15), async (req, res) => {
  try {
    const { currentPassword, confirmationText } = req.body || {};

    if (!currentPassword || !confirmationText) {
      return res.status(400).json({
        error: 'Current password and confirmation text are required',
      });
    }

    if (!isValidDeleteAccountConfirmation(confirmationText)) {
      return res.status(400).json({
        error: 'Confirmation text is incorrect',
        code: 'DELETE_CONFIRMATION_INVALID',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        password: true,
        role: true,
        businessId: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    if (user.role === 'OWNER') {
      await hardDeleteWorkspaceForOwner(user.businessId);
      clearSessionCookie(res);

      return res.json({
        message: 'Workspace and all related data were permanently deleted',
        deletedScope: 'workspace',
      });
    }

    await hardDeleteSelfUser(user.id);
    clearSessionCookie(res);

    return res.json({
      message: 'Account deleted permanently',
      deletedScope: 'account',
    });
  } catch (error) {
    console.error('Delete account error:', error);
    return res.status(500).json({
      error: 'Failed to delete account',
    });
  }
});

export default router;
