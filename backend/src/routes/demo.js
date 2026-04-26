import express from 'express';
import { initiateDemoCall } from '../services/demoCallService.js';
import { createLead, getLeadConstants } from '../services/leadService.js';

const router = express.Router();
const { LEAD_SOURCE } = getLeadConstants();

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

    const result = await initiateDemoCall({ phoneNumber, language, name });

    if (!result.success && result.reason === 'not_configured') {
      return res.status(400).json({
        success: false,
        error: 'Demo sistemi henuz yapilandirilmadi. Lutfen daha sonra tekrar deneyin.'
      });
    }

    if (!result.success) {
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
      callId: result.callId,
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
    const { name, email, phone, company, businessType, message } = req.body;

    console.log('📞 Demo request received (contact form):', { name, email, phone });

    await createLead({
      source: LEAD_SOURCE.WEBSITE_DEMO,
      name: name || 'Demo Lead',
      email: email || null,
      phone: phone || null,
      company: company || null,
      businessType: businessType || null,
      message: message || null,
      formName: 'demo_request_form',
      rawPayload: req.body
    });

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
