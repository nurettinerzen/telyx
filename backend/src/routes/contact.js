import express from 'express';
import prisma from '../prismaClient.js';
import rateLimit from 'express-rate-limit';
import { getPublicContactProfile } from '../services/businessPhoneRouting.js';

const router = express.Router();

// Rate limiter: 3 submissions per minute per IP
const contactRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: {
    error: 'Too many submissions. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /api/contact/info - Public contact info for the brand/admin business
router.get('/info', async (_req, res) => {
  try {
    const contactProfile = await getPublicContactProfile(prisma);

    res.json({
      email: contactProfile.email,
      phone: contactProfile.phone
    });
  } catch (error) {
    console.error('Contact info fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch contact info',
      code: 'SERVER_ERROR'
    });
  }
});

// POST /api/contact - Submit contact message
router.post('/', contactRateLimiter, async (req, res) => {
  try {
    const { email, name, company, phone, businessType, message } = req.body;

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

    // Create contact message
    const entry = await prisma.contactMessage.create({
      data: {
        email: email.toLowerCase().trim(),
        name: name.trim(),
        company: company?.trim() || null,
        phone: phone?.trim() || null,
        businessType: businessType?.trim() || null,
        message: message?.trim() || null,
        status: 'new'
      }
    });

    console.log('📩 New contact message:', {
      id: entry.id,
      email: entry.email,
      name: entry.name,
      company: entry.company
    });

    res.status(201).json({
      success: true,
      message: 'Message received successfully'
    });

  } catch (error) {
    console.error('Contact submission error:', error);
    res.status(500).json({
      error: 'Failed to submit message',
      code: 'SERVER_ERROR'
    });
  }
});

export default router;
