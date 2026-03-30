import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, verifyBusinessAccess, requireRole } from '../middleware/auth.js';
import { isPhoneInboundEnabledForBusinessRecord } from '../services/phoneInboundGate.js';
import { ASSISTANT_CHANNEL_CAPABILITIES, assistantHasCapability } from '../services/assistantChannels.js';

const router = express.Router();
const prisma = new PrismaClient();

const BUSINESS_SUBSCRIPTION_SELECT = {
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

function parseAliases(value) {
  if (value == null) return [];

  const source = Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : String(value)
      .split(/[\n,;]+/g)
      .map(item => item.trim())
      .filter(Boolean);

  const out = [];
  const seen = new Set();

  for (const item of source) {
    const normalized = item
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(item.slice(0, 80));
    if (out.length >= 20) break;
  }

  return out;
}

function sanitizeIdentitySummary(value) {
  if (value == null) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 600) : null;
}

// 🌍 SUPPORTED LANGUAGES (15+)
const SUPPORTED_LANGUAGES = [
  'EN', 'TR', 'DE', 'FR', 'ES', 'IT', 'PT',
  'RU', 'AR', 'JA', 'KO', 'ZH', 'HI', 'NL', 'PL', 'SV'
];

// Get chat widget settings for business (MUST be before /:businessId route)
router.get('/chat-widget', authenticateToken, async (req, res) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.businessId },
      select: {
        chatEmbedKey: true,
        chatWidgetEnabled: true,
        chatAssistantId: true
      }
    });

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    res.json({
      embedKey: business.chatEmbedKey,
      enabled: business.chatWidgetEnabled,
      chatAssistantId: business.chatAssistantId
    });
  } catch (error) {
    console.error('Get chat widget settings error:', error);
    res.status(500).json({ error: 'Failed to fetch chat widget settings' });
  }
});

// Update chat widget enabled status
router.put('/chat-widget', authenticateToken, async (req, res) => {
  try {
    const { enabled, chatAssistantId } = req.body;
    const updateData = {};

    if (typeof enabled === 'boolean') {
      updateData.chatWidgetEnabled = enabled;
    }

    if (chatAssistantId !== undefined) {
      if (chatAssistantId === null || chatAssistantId === '') {
        updateData.chatAssistantId = null;
      } else {
        const assistant = await prisma.assistant.findFirst({
          where: {
            id: chatAssistantId,
            businessId: req.businessId,
            isActive: true
          }
        });

        if (!assistant) {
          return res.status(400).json({ error: 'Selected chat assistant not found' });
        }

        if (!assistantHasCapability(assistant, ASSISTANT_CHANNEL_CAPABILITIES.CHAT)) {
          return res.status(400).json({ error: 'Selected assistant is not chat-capable' });
        }

        updateData.chatAssistantId = assistant.id;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const business = await prisma.business.update({
      where: { id: req.businessId },
      data: updateData,
      select: {
        chatEmbedKey: true,
        chatWidgetEnabled: true,
        chatAssistantId: true
      }
    });

    res.json({
      embedKey: business.chatEmbedKey,
      enabled: business.chatWidgetEnabled,
      chatAssistantId: business.chatAssistantId
    });
  } catch (error) {
    console.error('Update chat widget settings error:', error);
    res.status(500).json({ error: 'Failed to update chat widget settings' });
  }
});

// Get chat embed key for business (legacy endpoint, kept for backward compatibility)
router.get('/embed-key', authenticateToken, async (req, res) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.businessId },
      select: { chatEmbedKey: true }
    });

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    res.json({ embedKey: business.chatEmbedKey });
  } catch (error) {
    console.error('Get embed key error:', error);
    res.status(500).json({ error: 'Failed to fetch embed key' });
  }
});

// Get business details
router.get('/:businessId', authenticateToken, verifyBusinessAccess, async (req, res) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.businessId },
      select: {
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
          select: BUSINESS_SUBSCRIPTION_SELECT
        },
        users: {
          select: {
            id: true,
            email: true,
            role: true,
            createdAt: true,
          },
        },
        assistants: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            isActive: true,
            assistantType: true,
          },
        },
      },
    });

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    business.phoneInboundEnabled = isPhoneInboundEnabledForBusinessRecord(business);

    res.json(business);
  } catch (error) {
    console.error('Get business error:', error);
    res.status(500).json({ error: 'Failed to fetch business data' });
  }
});

// Update business settings
router.put('/:businessId', authenticateToken, verifyBusinessAccess, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const {
      name,
      language,
      businessType,
      country,
      timezone,
      aliases,
      identitySummary
    } = req.body;

    // 🌍 Validate language if provided
    if (language && !SUPPORTED_LANGUAGES.includes(language.toUpperCase())) {
      return res.status(400).json({
        error: 'Invalid language code',
        supportedLanguages: SUPPORTED_LANGUAGES
      });
    }

    const updatedBusiness = await prisma.business.update({
      where: { id: req.businessId },
      data: {
        ...(name && { name }),
        ...(businessType && { businessType: businessType.toUpperCase() }),
        ...(language && { language: language.toUpperCase() }),
        ...(country && { country: country.toUpperCase() }),
        ...(timezone && { timezone }),
        ...(aliases !== undefined && { aliases: parseAliases(aliases) }),
        ...(identitySummary !== undefined && { identitySummary: sanitizeIdentitySummary(identitySummary) }),
      },
    });

    console.log(`✅ Business updated: ${updatedBusiness.name}, type: ${updatedBusiness.businessType}`);
    res.json(updatedBusiness);
  } catch (error) {
    console.error('Update business error:', error);
    res.status(500).json({ error: 'Failed to update business' });
  }
});

export default router;
