import express from 'express';
import prisma from '../prismaClient.js';
import elevenLabsService from '../services/elevenlabs.js';

const router = express.Router();

// Demo configuration from environment variables
const DEMO_CONFIG = {
  agentId: process.env.ELEVENLABS_DEMO_AGENT_ID,
  phoneNumberId: process.env.ELEVENLABS_DEMO_PHONE_NUMBER_ID
};

// Demo request endpoint - Initiate outbound call to user using 11Labs
router.post('/demo/request-call', async (req, res) => {
  try {
    const { phoneNumber, language = 'TR', name } = req.body;

    // Validate phone number
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Telefon numarasi gereklidir'
      });
    }

    // Clean phone number - ensure E.164 format
    let cleanPhone = phoneNumber.replace(/\D/g, '');

    // Add country code if not present (assume Turkey for now)
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '90' + cleanPhone.substring(1);
    }
    if (!cleanPhone.startsWith('90') && cleanPhone.length === 10) {
      cleanPhone = '90' + cleanPhone;
    }
    cleanPhone = '+' + cleanPhone;

    // Check if demo is configured
    if (!DEMO_CONFIG.agentId || !DEMO_CONFIG.phoneNumberId) {
      console.log('📞 Demo call requested but not configured:', {
        hasAgentId: !!DEMO_CONFIG.agentId,
        hasPhoneNumberId: !!DEMO_CONFIG.phoneNumberId
      });
      return res.status(400).json({
        success: false,
        error: 'Demo sistemi henuz yapilandirilmadi. Lutfen daha sonra tekrar deneyin.'
      });
    }

    console.log('📞 Initiating demo outbound call:', {
      to: cleanPhone.slice(0, -4) + '****',
      language,
      name
    });

    // P0.2: Demo calls bypass capacity management (special business ID = 0)
    // But we still use safeCallInitiator for 429 handling
    // NOTE: Create a demo subscription if doesn't exist
    const DEMO_BUSINESS_ID = 999999; // Reserved for demo calls

    // Ensure demo business exists
    await prisma.business.upsert({
      where: { id: DEMO_BUSINESS_ID },
      update: {},
      create: {
        id: DEMO_BUSINESS_ID,
        name: 'DEMO_CALLS',
        language: 'TR',
        country: 'TR'
      }
    });

    // Ensure demo subscription exists (unlimited concurrency for demo)
    await prisma.subscription.upsert({
      where: { businessId: DEMO_BUSINESS_ID },
      update: {},
      create: {
        businessId: DEMO_BUSINESS_ID,
        plan: 'ENTERPRISE',
        status: 'ACTIVE',
        concurrentLimit: 999 // High limit for demos
      }
    });

    // P0.2: Use safeCallInitiator
    const { initiateOutboundCallSafe } = await import('../services/safeCallInitiator.js');

    const result = await initiateOutboundCallSafe({
      businessId: DEMO_BUSINESS_ID,
      agentId: DEMO_CONFIG.agentId,
      phoneNumberId: DEMO_CONFIG.phoneNumberId,
      toNumber: cleanPhone,
      clientData: {
        caller_name: name || 'Demo User',
        language: language,
        demo: true
      }
    });

    if (!result.success) {
      // Demo hit capacity limit (very rare)
      return res.status(503).json({
        success: false,
        error: 'System capacity reached. Please try again in a moment.',
        retryAfter: result.retryAfter
      });
    }

    console.log('✅ Demo call initiated:', result.call);

    res.json({
      success: true,
      message: 'Demo araması başlatıldı! Telefonunuz birazdan çalacak.',
      callId: result.call.call_sid || result.call.conversation_id,
      callType: 'outbound'
    });

  } catch (error) {
    console.error('Demo call error:', error.response?.data || error.message);

    // P0.2: Handle capacity errors
    const { CapacityError } = await import('../services/safeCallInitiator.js');
    if (error instanceof CapacityError) {
      return res.status(503).json({
        success: false,
        error: 'Demo araması başlatılamadı. Lütfen tekrar deneyin.',
        retryAfter: error.retryAfter
      });
    }

    // Generic error
    res.status(500).json({
      success: false,
      error: 'Demo araması başlatılırken bir hata oluştu. Lütfen tekrar deneyin.'
    });
  }
});

// Demo feedback endpoint
router.post('/demo/feedback', async (req, res) => {
  try {
    const { callId, rating, feedback, wouldRecommend } = req.body;

    console.log('📝 Demo feedback received:', {
      callId,
      rating,
      feedback,
      wouldRecommend
    });

    // TODO: Store feedback in database for analytics

    res.json({
      success: true,
      message: 'Geri bildiriminiz icin tesekkurler!'
    });

  } catch (error) {
    console.error('Demo feedback error:', error);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

// Legacy demo request endpoint (for landing page form - simple contact form)
router.post('/demo-request', async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    console.log('📞 Demo request received (contact form):', { name, email, phone });

    // TODO: Store demo requests in database and/or send notification

    res.json({
      success: true,
      message: 'Demo talebiniz alındı. En kısa sürede sizinle iletişime geçeceğiz!'
    });
  } catch (error) {
    console.error('Demo request error:', error);
    res.status(500).json({ error: 'Demo talebi işlenemedi' });
  }
});

export default router;
