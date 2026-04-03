import express from 'express';
import prisma from '../prismaClient.js';
import rateLimit from 'express-rate-limit';
import { sendWaitlistNotificationEmail } from '../services/emailService.js';

const router = express.Router();

// SECURITY: Rate limiter for email enumeration prevention
// Limits email checks to 5 requests per minute per IP
const emailCheckRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
  message: {
    error: 'Too many email checks. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  // Consistent timing to prevent timing attacks
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many email checks. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }
});

// POST /api/waitlist - Submit waitlist application
router.post('/', async (req, res) => {
  try {
    const { email, name, company, businessType, message } = req.body;

    // Validation
    if (!email || !name) {
      return res.status(400).json({
        error: 'Email and name are required',
        code: 'MISSING_FIELDS'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email address',
        code: 'INVALID_EMAIL'
      });
    }

    // Check for existing application
    const existingEntry = await prisma.waitlistEntry.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingEntry) {
      return res.status(409).json({
        error: 'An application with this email already exists',
        code: 'ALREADY_APPLIED'
      });
    }

    // Create waitlist entry
    const entry = await prisma.waitlistEntry.create({
      data: {
        email: email.toLowerCase(),
        name,
        company: company || null,
        businessType: businessType || null,
        message: message || null,
        status: 'pending'
      }
    });

    // Send notification email to admin
    try {
      await sendWaitlistNotificationEmail({ name, email, company, businessType, message });
      console.log(`📧 Waitlist notification sent for: ${email}`);
    } catch (emailError) {
      console.error('⚠️ Waitlist notification email failed:', emailError.message);
      // Don't fail the request if email fails — entry is already saved
    }

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      id: entry.id
    });

  } catch (error) {
    console.error('Waitlist submission error:', error);
    res.status(500).json({
      error: 'Failed to submit application',
      code: 'SERVER_ERROR'
    });
  }
});

// GET /api/waitlist/check/:email - Check if email is already on waitlist
// SECURITY: Rate limited to prevent email enumeration attacks
router.get('/check/:email', emailCheckRateLimiter, async (req, res) => {
  try {
    const { email } = req.params;

    // Add consistent timing delay to prevent timing attacks
    const startTime = Date.now();

    const entry = await prisma.waitlistEntry.findUnique({
      where: { email: email.toLowerCase() }
    });

    // Ensure response takes at least 200ms to prevent timing-based enumeration
    const elapsed = Date.now() - startTime;
    if (elapsed < 200) {
      await new Promise(resolve => setTimeout(resolve, 200 - elapsed));
    }

    res.json({
      exists: !!entry,
      status: entry?.status || null
    });

  } catch (error) {
    console.error('Waitlist check error:', error);
    res.status(500).json({ error: 'Failed to check waitlist status' });
  }
});

export default router;
