import express from 'express';
import prisma from '../prismaClient.js';
import rateLimit from 'express-rate-limit';
import { createLead, getLeadConstants } from '../services/leadService.js';

const router = express.Router();
const { LEAD_SOURCE } = getLeadConstants();

const waitlistRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: {
    error: 'Too many submissions. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/', waitlistRateLimiter, async (req, res) => {
  try {
    const { name, email, company, businessType, message } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        error: 'Name and email are required',
        code: 'MISSING_FIELDS'
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await prisma.waitlistEntry.findUnique({
      where: { email: normalizedEmail }
    });

    if (existing) {
      return res.status(409).json({
        error: 'Waitlist application already exists',
        code: 'ALREADY_APPLIED'
      });
    }

    const entry = await prisma.waitlistEntry.create({
      data: {
        email: normalizedEmail,
        name: String(name).trim(),
        company: company?.trim() || null,
        businessType: businessType?.trim() || null,
        message: message?.trim() || null,
        status: 'pending'
      }
    });

    try {
      await createLead({
        source: LEAD_SOURCE.WEBSITE_WAITLIST,
        name: entry.name,
        email: entry.email,
        company: entry.company,
        businessType: entry.businessType,
        message: entry.message,
        formName: 'waitlist_form',
        rawPayload: req.body
      });
      console.log(`🧲 Waitlist lead created for: ${entry.email}`);
    } catch (leadError) {
      console.error('⚠️ Waitlist lead creation failed:', leadError.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Waitlist application received successfully'
    });
  } catch (error) {
    console.error('Waitlist submission error:', error);
    return res.status(500).json({
      error: 'Failed to submit waitlist application',
      code: 'SERVER_ERROR'
    });
  }
});

export default router;
