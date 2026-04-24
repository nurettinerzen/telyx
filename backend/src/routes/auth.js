import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRecentAuth } from '../middleware/reauth.js';
import {
  sendVerificationEmail,
  sendEmailChangeVerification,
  sendPasswordResetEmail,
  sendAdminMfaCodeEmail,
  sendNewSignupNotificationEmail
} from '../services/emailService.js';
import { generateOAuthState, validateOAuthState } from '../middleware/oauthState.js';
import { safeRedirect } from '../middleware/redirectWhitelist.js';
import { isPhoneInboundEnabledForBusinessRecord } from '../services/phoneInboundGate.js';
import { validatePasswordPolicy, passwordPolicyMessage } from '../security/passwordPolicy.js';
import { clearSessionCookie, issueSession } from '../security/sessionToken.js';
import { ADMIN_BOOTSTRAP_EMAILS, isAdmin, requireAdminMfa } from '../middleware/adminAuth.js';
import { safeCompareStrings } from '../security/constantTime.js';
import { authRateLimiter, apiRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Strict rate limit middleware for brute-force sensitive endpoints (10 req/min)
const strictRateLimit = authRateLimiter.middleware();

const FRONTEND_URL = process.env.FRONTEND_URL;
const OOB_TOKEN_TTL_MS = 10 * 60 * 1000;
const isBootstrapAdminEmail = (email = '') => ADMIN_BOOTSTRAP_EMAILS.includes(String(email || '').toLowerCase());

const AUTH_ME_SUBSCRIPTION_SELECT = {
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
  trialMinutesUsed: true,
  trialChatExpiry: true,
  includedMinutesUsed: true,
  overageMinutes: true,
  overageRate: true,
  overageLimit: true,
  overageLimitReached: true,
  creditMinutes: true,
  creditMinutesUsed: true,
  concurrentLimit: true,
  assistantsLimit: true,
  phoneNumbersLimit: true,
  enterpriseMinutes: true,
  enterpriseSupportInteractions: true,
  enterprisePrice: true,
  enterpriseConcurrent: true,
  enterpriseAssistants: true,
  enterpriseStartDate: true,
  enterpriseEndDate: true,
  enterprisePaymentStatus: true,
  enterpriseNotes: true
};

const AUTH_BUSINESS_SELECT = {
  id: true,
  name: true,
  aliases: true,
  identitySummary: true,
  businessType: true,
  language: true,
  country: true,
  timezone: true,
  phoneInboundEnabled: true,
  chatEmbedKey: true,
  chatWidgetEnabled: true,
  chatAssistantId: true,
  subscription: {
    select: AUTH_ME_SUBSCRIPTION_SELECT
  }
};

// Rate limit tracking for resend verification (in-memory, for production use Redis)
const resendRateLimits = new Map();

/**
 * Helper: Generate verification token
 */
const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Helper: Generate unique chat embed key for business
 */
const generateChatEmbedKey = () => {
  return `emb_${crypto.randomBytes(16).toString('hex')}`;
};

const generateMfaCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

function hashMfaCode(adminId, code) {
  const pepper = process.env.ADMIN_MFA_PEPPER || process.env.JWT_SECRET || '';
  return crypto
    .createHash('sha256')
    .update(`${adminId}:${code}:${pepper}`, 'utf8')
    .digest('hex');
}

/**
 * Helper: Create and send verification email
 */
const createAndSendVerificationEmail = async (userId, email, businessName) => {
  // Delete any existing tokens for this user
  await prisma.emailVerificationToken.deleteMany({
    where: { userId }
  });

  // Create new token (10 minute validity)
  const token = generateVerificationToken();
  const expiresAt = new Date(Date.now() + OOB_TOKEN_TTL_MS);

  await prisma.emailVerificationToken.create({
    data: {
      userId,
      token,
      expiresAt
    }
  });

  // Send verification email
  const verificationUrl = `${FRONTEND_URL}/auth/verify-email#token=${token}`;
  await sendVerificationEmail(email, verificationUrl, businessName);

  return token;
};

const sendPostSignupEmails = async ({
  userId,
  email,
  businessName,
  userName = null,
  businessType = null,
  country = 'TR',
  plan = 'TRIAL',
  source = 'register'
}) => {
  const tasks = [
    {
      label: 'verification email',
      promise: createAndSendVerificationEmail(userId, email, businessName)
    },
    {
      label: 'signup notification email',
      promise: sendNewSignupNotificationEmail({
        userName,
        email,
        businessName,
        businessType,
        country,
        plan,
        source
      })
    }
  ];

  const results = await Promise.allSettled(tasks.map((task) => task.promise));
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Failed to send ${tasks[index].label}:`, result.reason);
    }
  });
};

// Register - Creates Business, Owner User, and Free Subscription
router.post('/register', strictRateLimit, async (req, res) => {
  try {
    const { email, password, businessName } = req.body;

    // Validation
    if (!email || !password || !businessName) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const passwordValidation = validatePasswordPolicy(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        error: passwordPolicyMessage(),
        code: 'WEAK_PASSWORD',
        requirements: passwordValidation.errors,
      });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create business, user, and subscription in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create business with user
      const business = await tx.business.create({
        data: {
          name: businessName,
          chatEmbedKey: generateChatEmbedKey(),
          businessType: req.body.businessType || 'OTHER',
          country: req.body.country?.toUpperCase() || 'TR',
          users: {
            create: {
              email,
              password: hashedPassword,
              role: 'OWNER'
            }
          }
        },
        include: {
          users: true
        }
      });

      // Get the created user
      const user = business.users[0];

      // Create trial subscription - 15 dk telefon, 7 gün chat/whatsapp
      const trialChatExpiry = new Date();
      trialChatExpiry.setDate(trialChatExpiry.getDate() + 7); // 7 gün chat/whatsapp

      const subscription = await tx.subscription.create({
        data: {
          businessId: business.id,
          plan: 'TRIAL',
          status: 'ACTIVE',
          trialStartDate: new Date(),
          trialMinutesUsed: 0,
          trialChatExpiry: trialChatExpiry,
          minutesLimit: 15,
          assistantsLimit: 1,
          phoneNumbersLimit: 1,
          concurrentLimit: 1
        },
      });

      return { user, business, subscription };
    });

    const token = issueSession(res, result.user);

    await sendPostSignupEmails({
      userId: result.user.id,
      email: result.user.email,
      businessName: result.business.name,
      userName: result.user.name || null,
      businessType: result.business.businessType || req.body.businessType || null,
      country: result.business.country || req.body.country?.toUpperCase() || 'TR',
      plan: result.subscription?.plan || 'TRIAL',
      source: 'register'
    });

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        businessId: result.user.businessId,
        emailVerified: false,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});


// Signup (alias for register)
router.post("/signup", strictRateLimit, async (req, res) => {
  try {
    const { email, password, fullName, businessName } = req.body;

    // Validation
    if (!email || !password || !fullName || !businessName) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const passwordValidation = validatePasswordPolicy(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        error: passwordPolicyMessage(),
        code: 'WEAK_PASSWORD',
        requirements: passwordValidation.errors,
      });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: businessName,
          chatEmbedKey: generateChatEmbedKey()
        }
      });
      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          name: fullName || null, // Save user's full name
          role: "OWNER",
          businessId: business.id
        }
      });
      // Create trial subscription - 15 dk telefon, 7 gün chat/whatsapp
      const trialChatExpiry = new Date();
      trialChatExpiry.setDate(trialChatExpiry.getDate() + 7);

      await tx.subscription.create({
        data: {
          businessId: business.id,
          plan: "TRIAL",
          status: "ACTIVE",
          trialStartDate: new Date(),
          trialMinutesUsed: 0,
          trialChatExpiry: trialChatExpiry,
          minutesLimit: 15,
          assistantsLimit: 1,
          phoneNumbersLimit: 1,
          concurrentLimit: 1
        }
      });

      return { user, business };
    });
    const token = issueSession(res, result.user);

    await sendPostSignupEmails({
      userId: result.user.id,
      email: result.user.email,
      businessName: result.business.name,
      userName: result.user.name || fullName || null,
      businessType: result.business.businessType || null,
      country: result.business.country || 'TR',
      plan: 'TRIAL',
      source: 'signup'
    });

    res.status(201).json({
      token,
      user: { id: result.user.id, email: result.user.email, name: result.user.name, role: result.user.role, businessId: result.business.id, emailVerified: false },
      business: { id: result.business.id, name: result.business.name }
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Signup failed" });
  }
});
// Login
router.post('/login', strictRateLimit, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user with business and subscription
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        business: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = issueSession(res, user);

    if (user.business) {
      user.business.phoneInboundEnabled = isPhoneInboundEnabledForBusinessRecord(user.business);
    }

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: 'Login successful',
      token,
      user: {
        ...userWithoutPassword,
        emailVerified: user.emailVerified,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        businessId: true,
        tokenVersion: true,
        onboardingCompleted: true,
        emailVerified: true,
        emailVerifiedAt: true,
        acceptedAt: true,
        createdAt: true,
        updatedAt: true,
        business: {
          select: AUTH_BUSINESS_SELECT
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const normalizedEmail = String(user.email || '').toLowerCase();
    const adminUser = normalizedEmail
      ? await prisma.adminUser.findUnique({
          where: { email: normalizedEmail },
          select: { role: true, isActive: true },
        })
      : null;
    const isAdminUser = adminUser?.isActive === true || isBootstrapAdminEmail(normalizedEmail);
    const adminRole = adminUser?.isActive === true
      ? adminUser.role
      : (isBootstrapAdminEmail(normalizedEmail) ? 'SUPER_ADMIN' : null);

    if (user.business) {
      user.business.phoneInboundEnabled = isPhoneInboundEnabledForBusinessRecord(user.business);
    }

    res.json({
      ...user,
      subscription: user.business?.subscription || null,
      plan: user.business?.subscription?.plan || null,
      isAdmin: isAdminUser,
      adminRole,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
});

// Logout (revokes all active sessions for this user)
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.userId },
      data: { tokenVersion: { increment: 1 } },
    });

    clearSessionCookie(res);
    return res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ error: 'Logout failed' });
  }
});

// Explicit step-up authentication for sensitive transactions
router.post('/reauthenticate', authenticateToken, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        role: true,
        businessId: true,
        tokenVersion: true,
        password: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const amr = Array.isArray(req.auth?.amr) && req.auth.amr.length > 0
      ? req.auth.amr
      : ['pwd'];

    issueSession(res, user, { amr });
    return res.json({ message: 'Re-authentication successful' });
  } catch (error) {
    console.error('Re-authenticate error:', error);
    return res.status(500).json({ error: 'Failed to re-authenticate' });
  }
});

// Admin MFA challenge (email OTP)
router.post('/admin-mfa/challenge', authenticateToken, isAdmin, async (req, res) => {
  try {
    const admin = await prisma.adminUser.findUnique({
      where: { email: String(req.user.email || '').toLowerCase() },
      select: { id: true, email: true, name: true, isActive: true },
    });

    if (!admin || !admin.isActive) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Clean stale and previous pending challenges for this user
    await prisma.adminMfaChallenge.deleteMany({
      where: {
        adminId: admin.id,
        OR: [
          { expiresAt: { lt: new Date() } },
          { usedAt: { not: null } },
        ],
      },
    });

    const code = generateMfaCode();
    const expiresAt = new Date(Date.now() + OOB_TOKEN_TTL_MS);
    const codeHash = hashMfaCode(admin.id, code);

    const challenge = await prisma.adminMfaChallenge.create({
      data: {
        adminId: admin.id,
        adminEmail: admin.email,
        userId: req.userId,
        codeHash,
        expiresAt,
      },
      select: {
        id: true,
        expiresAt: true,
      },
    });

    const mfaRecipient = process.env.ADMIN_MFA_NOTIFY_EMAIL || admin.email;
    console.log('[MFA] admin.email:', JSON.stringify(admin.email), 'recipient:', JSON.stringify(mfaRecipient));
    await sendAdminMfaCodeEmail(mfaRecipient, code, expiresAt);
    console.log('[MFA] Code sent successfully');

    return res.json({
      challengeId: challenge.id,
      expiresAt: challenge.expiresAt,
      delivery: 'email',
      ...(process.env.NODE_ENV !== 'production' ? { debugCode: code } : {}),
    });
  } catch (error) {
    console.error('Admin MFA challenge error:', error);
    return res.status(500).json({ error: 'Failed to create MFA challenge' });
  }
});

// Admin MFA verify
router.post('/admin-mfa/verify', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { challengeId, code } = req.body || {};
    if (!challengeId || !code) {
      return res.status(400).json({ error: 'challengeId and code are required' });
    }

    const admin = await prisma.adminUser.findUnique({
      where: { email: String(req.user.email || '').toLowerCase() },
      select: { id: true, email: true, isActive: true },
    });

    if (!admin || !admin.isActive) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const challenge = await prisma.adminMfaChallenge.findUnique({
      where: { id: String(challengeId) },
      select: {
        id: true,
        adminId: true,
        userId: true,
        codeHash: true,
        attempts: true,
        expiresAt: true,
        usedAt: true,
      },
    });

    if (!challenge || challenge.adminId !== admin.id || challenge.userId !== req.userId) {
      return res.status(400).json({ error: 'Invalid challenge' });
    }

    if (challenge.usedAt) {
      return res.status(400).json({ error: 'Challenge already used' });
    }

    if (new Date() > challenge.expiresAt) {
      await prisma.adminMfaChallenge.delete({ where: { id: challenge.id } });
      return res.status(400).json({ error: 'Challenge expired', code: 'MFA_EXPIRED' });
    }

    if (challenge.attempts >= 5) {
      return res.status(429).json({ error: 'Too many attempts', code: 'MFA_TOO_MANY_ATTEMPTS' });
    }

    const expectedHash = hashMfaCode(admin.id, String(code));
    const valid = safeCompareStrings(challenge.codeHash, expectedHash);

    if (!valid) {
      await prisma.adminMfaChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      return res.status(401).json({ error: 'Invalid code', code: 'MFA_INVALID_CODE' });
    }

    await prisma.adminMfaChallenge.update({
      where: { id: challenge.id },
      data: { usedAt: new Date() },
    });

    const mfaIssuedAt = Date.now();
    issueSession(res, req.user, {
      amr: ['pwd', 'otp'],
      adminMfaAt: mfaIssuedAt,
    });

    return res.json({
      message: 'Admin MFA verified',
      verifiedAt: new Date(mfaIssuedAt).toISOString(),
    });
  } catch (error) {
    console.error('Admin MFA verify error:', error);
    return res.status(500).json({ error: 'Failed to verify MFA code' });
  }
});

router.get('/admin-route-state', authenticateToken, isAdmin, requireAdminMfa, (_req, res) => {
  return res.status(204).end();
});

// Admin MFA status
router.get('/admin-mfa/status', authenticateToken, isAdmin, async (req, res) => {
  const maxAgeMinutes = parseInt(process.env.ADMIN_MFA_MAX_AGE_MINUTES || '15', 10);
  const maxAgeMs = Math.max(1, maxAgeMinutes) * 60 * 1000;
  const adminMfaAt = req.auth?.adminMfaAt ? Number(req.auth.adminMfaAt) : 0;
  const amr = Array.isArray(req.auth?.amr) ? req.auth.amr : [];
  const mfaVerified = amr.includes('otp') && adminMfaAt > 0 && (Date.now() - adminMfaAt) <= maxAgeMs;

  return res.json({
    mfaVerified,
    verifiedAt: adminMfaAt ? new Date(adminMfaAt).toISOString() : null,
    maxAgeMinutes: Math.max(1, maxAgeMinutes),
  });
});

// ============================================================================
// EMAIL VERIFICATION ENDPOINTS
// ============================================================================

// Verify email with token
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body || {};

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Find token
    const verificationToken = await prisma.emailVerificationToken.findUnique({
      where: { token },
      include: { user: true }
    });

    if (!verificationToken) {
      return res.status(400).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
    }

    // Check if token expired
    if (new Date() > verificationToken.expiresAt) {
      // Delete expired token
      await prisma.emailVerificationToken.delete({ where: { id: verificationToken.id } });
      return res.status(400).json({ error: 'Token has expired', code: 'TOKEN_EXPIRED' });
    }

    // Verify email
    await prisma.$transaction([
      prisma.user.update({
        where: { id: verificationToken.userId },
        data: {
          emailVerified: true,
          emailVerifiedAt: new Date()
        }
      }),
      prisma.emailVerificationToken.delete({ where: { id: verificationToken.id } })
    ]);

    res.json({
      message: 'Email verified successfully',
      email: verificationToken.user.email
    });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

// Resend verification email
router.post('/resend-verification', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { business: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    // Rate limit check (3 minutes)
    const rateLimitKey = `resend_${user.id}`;
    const lastSent = resendRateLimits.get(rateLimitKey);
    const now = Date.now();
    const RATE_LIMIT_MS = 3 * 60 * 1000; // 3 minutes

    if (lastSent && (now - lastSent) < RATE_LIMIT_MS) {
      const remainingSeconds = Math.ceil((RATE_LIMIT_MS - (now - lastSent)) / 1000);
      return res.status(429).json({
        error: 'Please wait before requesting another email',
        remainingSeconds,
        code: 'RATE_LIMITED'
      });
    }

    // Update rate limit
    resendRateLimits.set(rateLimitKey, now);

    // Send verification email
    await createAndSendVerificationEmail(user.id, user.email, user.business?.name);

    res.json({
      message: 'Verification email sent',
      nextResendAt: new Date(now + RATE_LIMIT_MS).toISOString()
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

// ============================================================================
// GOOGLE OAUTH ENDPOINTS
// ============================================================================

// Google OAuth - Handle Google sign-in/sign-up
router.post('/google', async (req, res) => {
  try {
    const { credential, clientId } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Google credential is required' });
    }

    // Verify the Google token
    const { OAuth2Client } = await import('google-auth-library');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (verifyError) {
      console.error('Google token verification failed:', verifyError);
      return res.status(401).json({ error: 'Invalid Google credential' });
    }

    const { email, name, picture, email_verified } = payload;

    if (!email) {
      return res.status(400).json({ error: 'Email not provided by Google' });
    }

    // Check if user exists
    let user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        business: {
          select: AUTH_BUSINESS_SELECT
        },
      },
    });

    let isNewUser = false;

    if (user) {
      // Existing user - link Google account if not already verified
      // Update emailVerified to true if Google verified it
      if (email_verified && !user.emailVerified) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            emailVerified: true,
            emailVerifiedAt: new Date(),
          },
        });
        user.emailVerified = true;
      }

      // Clean up any verification tokens
      await prisma.emailVerificationToken.deleteMany({
        where: { userId: user.id }
      });
    } else {
      // New user - create account
      isNewUser = true;

      // Generate a random password for Google users (they won't use it)
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      const result = await prisma.$transaction(async (tx) => {
        // Create business with user
        const business = await tx.business.create({
          data: {
            name: name || 'My Business',
            chatEmbedKey: generateChatEmbedKey(),
            users: {
              create: {
                email: email.toLowerCase(),
                password: hashedPassword,
                name: name || null,
                role: 'OWNER',
                emailVerified: email_verified || false,
                emailVerifiedAt: email_verified ? new Date() : null,
              },
            },
          },
          include: {
            users: true,
          },
        });

        // Get the created user
        const newUser = business.users[0];

        // Create trial subscription - 15 dk telefon, 7 gün chat/whatsapp
        const trialChatExpiry = new Date();
        trialChatExpiry.setDate(trialChatExpiry.getDate() + 7);

        await tx.subscription.create({
          data: {
            businessId: business.id,
            plan: 'TRIAL',
            status: 'ACTIVE',
            trialStartDate: new Date(),
            trialMinutesUsed: 0,
            trialChatExpiry: trialChatExpiry,
            minutesLimit: 15,
            assistantsLimit: 1,
            phoneNumbersLimit: 1,
            concurrentLimit: 1
          },
        });

        return { user: newUser, business };
      });

      user = await prisma.user.findUnique({
        where: { id: result.user.id },
        include: {
          business: {
            select: AUTH_BUSINESS_SELECT
          },
        },
      });
    }

    const token = issueSession(res, user);

    if (isNewUser) {
      await sendPostSignupEmails({
        userId: user.id,
        email: user.email,
        businessName: user.business?.name || name || 'My Business',
        userName: user.name || name || null,
        businessType: user.business?.businessType || null,
        country: user.business?.country || 'TR',
        plan: user.business?.subscription?.plan || 'TRIAL',
        source: 'google_oauth'
      });
    }

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: isNewUser ? 'Account created successfully' : 'Login successful',
      token,
      user: {
        ...userWithoutPassword,
        emailVerified: user.emailVerified,
      },
      isNewUser,
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: 'Google authentication failed' });
  }
});

// ============================================================================
// MICROSOFT OAUTH CALLBACK (for Outlook email integration)
// ============================================================================

// Microsoft OAuth Callback - redirects to email route handler
// Azure Portal'da kayıtlı redirect URI: /api/auth/microsoft/callback
import outlookService from '../services/outlook.js';

router.get('/microsoft/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      console.error('Microsoft OAuth error:', oauthError);
      return safeRedirect(res, '/dashboard/integrations?error=outlook-denied');
    }

    if (!code || !state) {
      console.error('Microsoft callback: missing code or state');
      return safeRedirect(res, '/dashboard/integrations?error=outlook-invalid');
    }

    // SECURITY: Validate state token (CSRF protection)
    const validation = await validateOAuthState(state, null, 'outlook');

    if (!validation.valid) {
      console.error('❌ Microsoft callback: Invalid state:', validation.error);
      return safeRedirect(res, '/dashboard/integrations?error=outlook-csrf');
    }

    const businessId = validation.businessId;
    const codeVerifier = validation.metadata?.codeVerifier;

    await outlookService.handleCallback(code, businessId, codeVerifier);

    console.log(`✅ Outlook connected for business ${businessId}`);

    // Trigger style analysis in background
    import('../services/email-style-analyzer.js').then((module) => {
      module.analyzeWritingStyle(businessId).catch((err) => {
        console.error('Background style analysis failed:', err);
      });
    });

    safeRedirect(res, '/dashboard/integrations?success=outlook');
  } catch (error) {
    console.error('❌ Microsoft callback error:', error);
    safeRedirect(res, '/dashboard/integrations?error=outlook-failed');
  }
});

// Google OAuth - Handle authorization code flow
router.post('/google/code', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    const { OAuth2Client } = await import('google-auth-library');
    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'postmessage' // For popup flow
    );

    let tokens;
    try {
      const response = await client.getToken(code);
      tokens = response.tokens;
    } catch (tokenError) {
      console.error('Google token exchange failed:', tokenError);
      return res.status(401).json({ error: 'Invalid authorization code' });
    }

    // Verify the ID token
    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (verifyError) {
      console.error('Google ID token verification failed:', verifyError);
      return res.status(401).json({ error: 'Invalid Google credential' });
    }

    const { email, name, picture, email_verified } = payload;

    if (!email) {
      return res.status(400).json({ error: 'Email not provided by Google' });
    }

    // Check if user exists
    let user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        business: {
          select: AUTH_BUSINESS_SELECT
        },
      },
    });

    let isNewUser = false;

    if (user) {
      // Existing user - link Google account if not already verified
      if (email_verified && !user.emailVerified) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            emailVerified: true,
            emailVerifiedAt: new Date(),
          },
        });
        user.emailVerified = true;
      }

      // Clean up any verification tokens
      await prisma.emailVerificationToken.deleteMany({
        where: { userId: user.id }
      });
    } else {
      // New user - create account
      isNewUser = true;

      const randomPassword = crypto.randomBytes(32).toString('hex');
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      const result = await prisma.$transaction(async (tx) => {
        const business = await tx.business.create({
          data: {
            name: name || 'My Business',
            chatEmbedKey: generateChatEmbedKey(),
            users: {
              create: {
                email: email.toLowerCase(),
                password: hashedPassword,
                name: name || null,
                role: 'OWNER',
                emailVerified: email_verified || false,
                emailVerifiedAt: email_verified ? new Date() : null,
              },
            },
          },
          include: {
            users: true,
          },
        });

        const newUser = business.users[0];

        const trialChatExpiry = new Date();
        trialChatExpiry.setDate(trialChatExpiry.getDate() + 7);

        await tx.subscription.create({
          data: {
            businessId: business.id,
            plan: 'TRIAL',
            status: 'ACTIVE',
            trialStartDate: new Date(),
            trialMinutesUsed: 0,
            trialChatExpiry: trialChatExpiry,
            minutesLimit: 15,
            assistantsLimit: 1,
            phoneNumbersLimit: 1,
            concurrentLimit: 1
          },
        });

        return { user: newUser, business };
      });

      user = await prisma.user.findUnique({
        where: { id: result.user.id },
        include: {
          business: {
            select: AUTH_BUSINESS_SELECT
          },
        },
      });
    }

    const token = issueSession(res, user);

    if (isNewUser) {
      await sendPostSignupEmails({
        userId: user.id,
        email: user.email,
        businessName: user.business?.name || name || 'My Business',
        userName: user.name || name || null,
        businessType: user.business?.businessType || null,
        country: user.business?.country || 'TR',
        plan: user.business?.subscription?.plan || 'TRIAL',
        source: 'google_oauth'
      });
    }

    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: isNewUser ? 'Account created successfully' : 'Login successful',
      token,
      user: {
        ...userWithoutPassword,
        emailVerified: user.emailVerified,
      },
      isNewUser,
    });
  } catch (error) {
    console.error('Google auth code error:', error);
    res.status(500).json({ error: 'Google authentication failed' });
  }
});

// ============================================================================
// PASSWORD RESET ENDPOINTS
// ============================================================================

// Forgot password - request password reset
router.post('/forgot-password', strictRateLimit, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

    // Delete any existing tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id }
    });

    // Create new token (10 minute validity)
    const token = generateVerificationToken();
    const expiresAt = new Date(Date.now() + OOB_TOKEN_TTL_MS);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt
      }
    });

    // Send password reset email
    const resetUrl = `${FRONTEND_URL}/reset-password#token=${token}`;
    await sendPasswordResetEmail(user.email, resetUrl);

    res.json({
      message: 'If an account with that email exists, a password reset link has been sent.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Reset password with token
router.post('/reset-password', strictRateLimit, async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    // Validate password strength
    const passwordValidation = validatePasswordPolicy(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        error: passwordPolicyMessage(),
        code: 'WEAK_PASSWORD',
        requirements: passwordValidation.errors,
      });
    }

    // Find token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true }
    });

    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
    }

    // Check if token expired
    if (new Date() > resetToken.expiresAt) {
      await prisma.passwordResetToken.delete({ where: { id: resetToken.id } });
      return res.status(400).json({ error: 'Token has expired', code: 'TOKEN_EXPIRED' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    const terminateAllSessions = req.body?.terminateAllSessions !== false;

    // Update password and delete token
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: {
          password: hashedPassword,
          ...(terminateAllSessions ? { tokenVersion: { increment: 1 } } : {}),
        }
      }),
      prisma.passwordResetToken.delete({ where: { id: resetToken.id } })
    ]);

    res.json({
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Change email and resend verification
router.post('/change-email', authenticateToken, requireRecentAuth(15), async (req, res) => {
  try {
    const { newEmail, password } = req.body;

    if (!newEmail || !password) {
      return res.status(400).json({ error: 'New email and password are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { business: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Check if email is already in use
    const existingUser = await prisma.user.findUnique({
      where: { email: newEmail.toLowerCase() }
    });

    if (existingUser && existingUser.id !== user.id) {
      return res.status(400).json({ error: 'Email is already in use' });
    }

    // Update email and reset verification status
    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: newEmail.toLowerCase(),
        emailVerified: false,
        emailVerifiedAt: null
      }
    });

    // Send verification email to new address
    await createAndSendVerificationEmail(user.id, newEmail.toLowerCase(), user.business?.name);

    res.json({
      message: 'Email changed. Please verify your new email address.',
      email: newEmail.toLowerCase()
    });
  } catch (error) {
    console.error('Change email error:', error);
    res.status(500).json({ error: 'Failed to change email' });
  }
});

export default router;
