import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Complete onboarding
router.post('/complete', authenticateToken, async (req, res) => {
  try {
    const now = new Date();
    const updates = [
      prisma.user.update({
        where: { id: req.userId },
        data: { onboardingCompleted: true },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          businessId: true,
          onboardingCompleted: true,
        },
      })
    ];

    // Business-level completion timestamp should be set by owner completion.
    if (req.userRole === 'OWNER' && req.businessId) {
      updates.push(
        prisma.business.update({
          where: { id: req.businessId },
          data: { onboardingCompletedAt: now },
          select: { id: true, onboardingCompletedAt: true }
        })
      );
    }

    const [user, business] = await prisma.$transaction(updates);

    res.json({
      success: true,
      message: 'Onboarding completed',
      user,
      business: business || null
    });
  } catch (error) {
    console.error('Onboarding complete error:', error);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

export default router;
