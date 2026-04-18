// ============================================================================
// PHONE NUMBER ROUTES
// ============================================================================
// Phone number management with 11Labs integration
// Supports: 11Labs Twilio numbers + Netgsm Turkey 0850 SIP trunk
// ============================================================================

import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import netgsmService from '../services/netgsm.js';
import elevenLabsService from '../services/elevenlabs.js';
import { getProvidersForCountry } from '../config/sip-providers.js';
import { resolvePhoneOutboundAccessForBusinessId } from '../services/phoneOutboundAccess.js';
import { isPhoneInboundEnabledForBusinessRecord } from '../services/phoneInboundGate.js';
import {
  hasBrandPhoneOverride,
  isPhoneRoutingFlagColumnMissingError,
  reconcilePhoneNumberUsage,
  resolveEffectivePhoneNumberLimit,
  setPhoneNumberRoutingFlags,
  syncLegacyBusinessPhoneFields
} from '../services/businessPhoneRouting.js';

const router = express.Router();

router.use(authenticateToken);

// ============================================================================
// COUNTRY TO PROVIDER MAPPING
// ============================================================================
const COUNTRY_PROVIDER_MAP = {
  'TR': 'NETGSM_ELEVENLABS',  // Turkey → NetGSM 0850 + 11Labs SIP Trunk
  'US': 'ELEVENLABS',         // USA → 11Labs (via Twilio import)
  // Future additions:
  // 'UK': 'ELEVENLABS',
  // 'CA': 'ELEVENLABS',
};

const PRICING = {
  ELEVENLABS: {
    monthlyCost: 5.00,  // $5/month
    currency: 'USD'
  },
  NETGSM: {
    monthlyCost: 0.46,  // ~$0.46/month (191 TL/year)
    annualCost: 5.50,   // ~$5.50/year
    displayMonthly: 20, // ₺20/month displayed to customer (with markup)
    currency: 'TRY'
  }
};

const PHONE_ASSIGNMENT_DISABLED_V1_ERROR = {
  error: 'PHONE_ASSIGNMENT_DISABLED_V1',
  message: 'V1 sürümünde telefon numarası-assistant assignment kapalıdır.'
};

const PHONE_INBOUND_ASSIGNMENT_DISABLED_ERROR = {
  error: 'PHONE_INBOUND_ASSIGNMENT_DISABLED',
  message: 'Bu işletmede gelen arama asistanı ataması kapalıdır.'
};

async function listPhoneNumbersWithCompatibility(businessId) {
  try {
    const phoneNumbers = await prisma.phoneNumber.findMany({
      where: { businessId },
      select: {
        id: true,
        phoneNumber: true,
        countryCode: true,
        provider: true,
        status: true,
        assistantId: true,
        monthlyCost: true,
        nextBillingDate: true,
        createdAt: true,
        elevenLabsPhoneId: true,
        isDefaultInbound: true,
        isDefaultOutbound: true,
        isPublicContact: true,
        assistant: {
          select: {
            id: true,
            name: true,
            isActive: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return { phoneNumbers, routingFlagsAvailable: true };
  } catch (error) {
    if (!isPhoneRoutingFlagColumnMissingError(error)) {
      throw error;
    }

    console.warn('⚠️ /api/phone-numbers is using legacy compatibility because routing flag columns are missing.');

    const phoneNumbers = await prisma.phoneNumber.findMany({
      where: { businessId },
      select: {
        id: true,
        phoneNumber: true,
        countryCode: true,
        provider: true,
        status: true,
        assistantId: true,
        monthlyCost: true,
        nextBillingDate: true,
        createdAt: true,
        elevenLabsPhoneId: true,
        assistant: {
          select: {
            id: true,
            name: true,
            isActive: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return {
      routingFlagsAvailable: false,
      phoneNumbers: phoneNumbers.map((phoneNumber) => ({
        ...phoneNumber,
        isDefaultInbound: false,
        isDefaultOutbound: false,
        isPublicContact: false
      }))
    };
  }
}

// ============================================================================
// GET ALL PHONE NUMBERS
// ============================================================================
router.get('/', async (req, res) => {
  try {
    const businessId = req.businessId;

    if (!businessId) {
      return res.json({ phoneNumbers: [], count: 0, limit: 0, canAddMore: false, hasAdminPhoneOverride: false });
    }

    const [{ phoneNumbers, routingFlagsAvailable }, limit, hasAdminPhoneOverride] = await Promise.all([
      listPhoneNumbersWithCompatibility(businessId),
      resolveEffectivePhoneNumberLimit(prisma, businessId),
      hasBrandPhoneOverride(prisma, businessId)
    ]);

    const activeCount = phoneNumbers.filter((pn) => pn.status === 'ACTIVE').length;
    const canAddMore = limit === -1 || activeCount < limit;

    res.json({
      phoneNumbers: phoneNumbers.map(pn => ({
        id: pn.id,
        phoneNumber: pn.phoneNumber,
        countryCode: pn.countryCode,
        provider: pn.provider,
        status: pn.status,
        assistantId: pn.assistant?.isActive ? pn.assistantId : null,
        assistantName: pn.assistant?.isActive ? pn.assistant.name : null,
        monthlyCost: pn.monthlyCost,
        nextBillingDate: pn.nextBillingDate,
        createdAt: pn.createdAt,
        elevenLabsPhoneId: pn.elevenLabsPhoneId,
        isDefaultInbound: pn.isDefaultInbound,
        isDefaultOutbound: pn.isDefaultOutbound,
        isPublicContact: pn.isPublicContact
      })),
      count: phoneNumbers.length,
      limit,
      canAddMore,
      hasAdminPhoneOverride,
      routingFlagsAvailable,
      inboundEnabled: isPhoneInboundEnabledForBusinessRecord(req.user?.business)
    });

  } catch (error) {
    console.error('❌ List phone numbers error:', error);
    res.status(500).json({
      error: 'Failed to list phone numbers',
      details: error.message
    });
  }
});

// ============================================================================
// PROVISION NEW PHONE NUMBER (AUTO-DETECT PROVIDER)
// ============================================================================
router.post('/provision', async (req, res) => {
  try {
    const { countryCode, assistantId } = req.body;
    const businessId = req.businessId;

    console.log('📞 Provisioning phone number...', { countryCode, assistantId, businessId });

    // Validate inputs
    if (!countryCode) {
      return res.status(400).json({
        error: 'Country code is required',
        example: { countryCode: 'TR or US' }

      });
    }

    // Check subscription limits
    const subscription = await prisma.subscription.findUnique({
      where: { businessId }
    });

    if (!subscription || subscription.plan === 'FREE') {
      return res.status(403).json({
        error: 'Phone numbers are not available on FREE plan',
        upgradeRequired: true
      });
    }

    // Check effective phone number limit
    const [existingNumbers, effectiveLimit] = await Promise.all([
      prisma.phoneNumber.count({
        where: { businessId, status: 'ACTIVE' }
      }),
      resolveEffectivePhoneNumberLimit(prisma, businessId)
    ]);

    if (effectiveLimit > 0 && existingNumbers >= effectiveLimit) {
      return res.status(403).json({
        error: `Phone number limit reached (${effectiveLimit} numbers)`,
        upgrade: 'Consider upgrading your plan'
      });
    }

    // Determine provider based on country
    const provider = COUNTRY_PROVIDER_MAP[countryCode.toUpperCase()];

    if (!provider) {
      return res.status(400).json({
        error: `Country ${countryCode} is not supported yet`,
        supportedCountries: Object.keys(COUNTRY_PROVIDER_MAP)
      });
    }

    if (assistantId) {
      return res.status(403).json(PHONE_ASSIGNMENT_DISABLED_V1_ERROR);
    }

    console.log(`✅ Using provider: ${provider} for ${countryCode}`);

    let result;

    // ========== NETGSM + 11LABS SIP TRUNK (Turkey) ==========
    if (provider === 'NETGSM_ELEVENLABS') {
      result = await provisionNetgsmElevenLabsNumber(businessId);
    }
    // ========== 11LABS (USA - via Twilio) ==========
    else if (provider === 'ELEVENLABS') {
      result = await provisionElevenLabsNumber(businessId, countryCode);
    }
    // ========== NETGSM (uses 11Labs SIP trunk) ==========
    else if (provider === 'NETGSM') {
      result = await provisionNetgsmElevenLabsNumber(businessId);
    }
    else {
      return res.status(400).json({
        error: `Provider ${provider} not implemented yet`
      });
    }

    await prisma.$transaction(async (tx) => {
      await syncLegacyBusinessPhoneFields(tx, businessId);
      await reconcilePhoneNumberUsage(tx, businessId);
    });

    console.log('✅ Phone number provisioned successfully:', result.phoneNumber);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('❌ Provision phone number error:', error);
    res.status(500).json({
      error: 'Failed to provision phone number',
      details: error.message
    });
  }
});

// ============================================================================
// HELPER: PROVISION NETGSM NUMBER + 11LABS SIP TRUNK (TURKEY)
// ============================================================================
async function provisionNetgsmElevenLabsNumber(businessId) {
  console.log('🇹🇷 Provisioning Netgsm 0850 number with 11Labs SIP Trunk...');

  // Step 1: Purchase 0850 number from Netgsm
  const netgsmResult = await netgsmService.purchaseNumber();
  console.log('✅ Netgsm number purchased:', netgsmResult.phoneNumber);

  // Step 2: Get SIP credentials
  const sipCredentials = await netgsmService.getSipCredentials(netgsmResult.numberId);
  console.log('✅ SIP credentials obtained');

  // Step 3: Import to 11Labs as SIP Trunk (no assistant assignment in V1)
  const formattedNumber = netgsmService.formatPhoneNumber(netgsmResult.phoneNumber);
  let elevenLabsPhoneId = null;
  try {
    const elevenLabsResult = await elevenLabsService.importSipTrunkNumber({
      phoneNumber: formattedNumber,
      sipServer: sipCredentials.sipServer,  // Just hostname, no sip: prefix
      sipUsername: sipCredentials.sipUsername,
      sipPassword: sipCredentials.sipPassword,
      transport: 'tcp',  // UDP not supported by 11Labs
      mediaEncryption: 'disabled',
      label: `Netgsm TR - ${formattedNumber}`
    });

    elevenLabsPhoneId = elevenLabsResult.phone_number_id;
    console.log('✅ Number imported to 11Labs SIP Trunk:', elevenLabsPhoneId);
  } catch (error) {
    console.error('❌ Failed to import to 11Labs:', error.message);
    throw new Error(`Failed to import phone number to 11Labs: ${error.message}`);
  }

  // Step 4: Save to database
  const phoneNumber = await prisma.phoneNumber.create({
    data: {
      businessId: businessId,
      phoneNumber: formattedNumber,
      countryCode: 'TR',
      provider: 'ELEVENLABS',  // Use ELEVENLABS as provider since that's where it's connected
      netgsmNumberId: netgsmResult.numberId,
      elevenLabsPhoneId: elevenLabsPhoneId,
      sipUsername: sipCredentials.sipUsername,
      sipPassword: sipCredentials.sipPassword,
      sipServer: sipCredentials.sipServer,
      assistantId: null,
      status: 'ACTIVE',
      monthlyCost: netgsmResult.monthlyCost,
      nextBillingDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
    }
  });

  return {
    id: phoneNumber.id,
    phoneNumber: phoneNumber.phoneNumber,
    provider: 'ELEVENLABS',
    countryCode: 'TR',
    status: 'ACTIVE',
    monthlyCost: phoneNumber.monthlyCost,
    elevenLabsPhoneId: elevenLabsPhoneId
  };
}

// ============================================================================
// HELPER: PROVISION 11LABS NUMBER (via Twilio import)
// ============================================================================
async function provisionElevenLabsNumber(businessId, countryCode = 'US') {
  console.log(`🎙️ Provisioning 11Labs number for ${countryCode}...`);

  // For now, 11Labs requires Twilio phone number to be imported
  // First, we need to get the phone number from Twilio
  // This is a simplified version - in production you'd need Twilio SDK

  // Option 1: Use existing Twilio number (user provides it)
  // Option 2: Buy from Twilio and import to 11Labs

  // For now, we'll create a placeholder entry and let user configure Twilio
  // The actual 11Labs import happens when Twilio credentials are provided

  const phoneNumber = await prisma.phoneNumber.create({
    data: {
      businessId: businessId,
      phoneNumber: `pending-${Date.now()}`,  // Placeholder until Twilio is configured
      countryCode: countryCode,
      provider: 'ELEVENLABS',
      assistantId: null,
      status: 'ACTIVE',
      monthlyCost: PRICING.ELEVENLABS.monthlyCost,
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });

  console.log('✅ 11Labs phone number entry created (pending Twilio configuration)');

  return {
    id: phoneNumber.id,
    phoneNumber: phoneNumber.phoneNumber,
    provider: 'ELEVENLABS',
    countryCode: countryCode,
    status: 'PENDING_CONFIGURATION',
    monthlyCost: phoneNumber.monthlyCost,
    elevenLabsPhoneId: null,
    message: 'Please configure Twilio credentials to complete phone number setup'
  };
}

// ============================================================================
// IMPORT TWILIO NUMBER TO 11LABS
// ============================================================================
router.post('/:id/import-twilio', async (req, res) => {
  try {
    const { id } = req.params;
    const { twilioPhoneNumber, twilioAccountSid, twilioAuthToken } = req.body;
    const businessId = req.businessId;

    console.log('📞 Importing Twilio number to 11Labs:', twilioPhoneNumber);

    // Validate inputs
    if (!twilioPhoneNumber || !twilioAccountSid || !twilioAuthToken) {
      return res.status(400).json({
        error: 'Missing required Twilio credentials',
        required: ['twilioPhoneNumber', 'twilioAccountSid', 'twilioAuthToken']
      });
    }

    // Get phone number record
    const phoneNumber = await prisma.phoneNumber.findFirst({
      where: { id, businessId }
    });

    if (!phoneNumber) {
      return res.status(404).json({ error: 'Phone number record not found' });
    }

    // Import to 11Labs (V1: no assistant assignment)
    const elevenLabsResult = await elevenLabsService.importPhoneNumber({
      phoneNumber: twilioPhoneNumber,
      twilioAccountSid,
      twilioAuthToken,
      label: `Business ${businessId} - ${twilioPhoneNumber}`
    });

    // Update database
    const updated = await prisma.phoneNumber.update({
      where: { id },
      data: {
        phoneNumber: twilioPhoneNumber,
        elevenLabsPhoneId: elevenLabsResult.phone_number_id,
        status: 'ACTIVE'
      }
    });

    console.log('✅ Phone number imported to 11Labs:', elevenLabsResult.phone_number_id);

    res.json({
      success: true,
      phoneNumber: updated.phoneNumber,
      elevenLabsPhoneId: updated.elevenLabsPhoneId,
      status: 'ACTIVE'
    });

  } catch (error) {
    console.error('❌ Import Twilio error:', error);
    res.status(500).json({
      error: 'Failed to connect phone number',
      details: error.message
    });
  }
});

// ============================================================================
// IMPORT SIP TRUNK NUMBER (for NetGSM Turkey, etc.)
// ============================================================================
router.post('/import-sip', async (req, res) => {
  try {
    const {
      phoneNumber,
      sipServer,
      sipUsername,
      sipPassword,
      sipTransport = 'TCP',  // UDP not supported by 11Labs, only TCP/TLS
      assistantId,
      provider = 'other'
    } = req.body;
    const businessId = req.businessId;

    console.log('📞 Importing SIP trunk number...', { phoneNumber, sipServer, businessId });

    // Validate inputs
    if (!phoneNumber || !sipServer || !sipUsername || !sipPassword) {
      return res.status(400).json({
        error: 'Eksik bilgi',
        required: ['phoneNumber', 'sipServer', 'sipUsername', 'sipPassword'],
        message: 'Telefon numarası ve SIP bilgileri gereklidir'
      });
    }

    if (assistantId) {
      return res.status(403).json(PHONE_ASSIGNMENT_DISABLED_V1_ERROR);
    }

    // Check subscription limits
    const subscription = await prisma.subscription.findUnique({
      where: { businessId }
    });

    if (!subscription || subscription.plan === 'FREE') {
      return res.status(403).json({
        error: 'Telefon numaraları FREE planda kullanılamaz',
        upgradeRequired: true
      });
    }

    // Check effective phone number limit
    const limitCheck = await prisma.$transaction(async (tx) => {
      await tx.business.findUnique({
        where: { id: businessId },
        select: { id: true }
      });

      const existingNumbers = await tx.phoneNumber.count({
        where: { businessId, status: 'ACTIVE' }
      });
      const limit = await resolveEffectivePhoneNumberLimit(tx, businessId);

      return { existingNumbers, limit };
    });

    if (limitCheck.limit > 0 && limitCheck.existingNumbers >= limitCheck.limit) {
      return res.status(403).json({
        error: 'PHONE_NUMBER_LIMIT_REACHED',
        message: `Şu anda işletme başına ${limitCheck.limit} telefon numarası destekleniyor`,
        currentCount: limitCheck.existingNumbers,
        limit: limitCheck.limit
      });
    }

    // Format phone number to E.164
    let formattedNumber = phoneNumber.replace(/\D/g, '');
    if (!formattedNumber.startsWith('+')) {
      if (formattedNumber.startsWith('90')) {
        formattedNumber = '+' + formattedNumber;
      } else if (formattedNumber.startsWith('0')) {
        formattedNumber = '+90' + formattedNumber.substring(1);
      } else {
        formattedNumber = '+90' + formattedNumber;
      }
    }

    // Validate transport - only TCP and TLS supported
    const validTransport = sipTransport?.toUpperCase() === 'TLS' ? 'tls' : 'tcp';

    // Import to 11Labs as SIP Trunk with new API format
    let elevenLabsPhoneId = null;
    try {
      const elevenLabsResult = await elevenLabsService.importSipTrunkNumber({
        phoneNumber: formattedNumber,
        sipServer: sipServer,  // Just hostname, no sip: prefix
        sipUsername: sipUsername,
        sipPassword: sipPassword,
        transport: validTransport,
        mediaEncryption: validTransport === 'tls' ? 'required' : 'disabled',
        label: `${provider === 'netgsm' ? 'NetGSM' : 'SIP'} TR - ${formattedNumber}`
      });

      elevenLabsPhoneId = elevenLabsResult.phone_number_id;
      console.log('✅ SIP trunk imported to 11Labs:', elevenLabsPhoneId);
    } catch (error) {
      console.error('❌ Failed to import SIP trunk to 11Labs:', error.response?.data || error.message);

      // Return detailed error
      const errorDetail = error.response?.data?.detail || error.message;
      return res.status(400).json({
        error: 'SIP bağlantısı başarısız',
        details: errorDetail,
        message: 'SIP bilgilerinizi kontrol edin. Sunucu, kullanıcı adı ve şifre doğru olmalıdır.'
      });
    }

    // Check if phone number already exists for this business
    const existingPhone = await prisma.phoneNumber.findFirst({
      where: { phoneNumber: formattedNumber }
    });

    let newPhoneNumber;
    let isNewNumber = false;

    newPhoneNumber = await prisma.$transaction(async (tx) => {
      let savedPhoneNumber;
      const previousBusinessId = existingPhone?.businessId || null;

      if (existingPhone) {
        console.log('📞 Phone number already exists, updating...');
        savedPhoneNumber = await tx.phoneNumber.update({
          where: { id: existingPhone.id },
          data: {
            businessId,
            countryCode: 'TR',
            provider: 'ELEVENLABS',
            elevenLabsPhoneId: elevenLabsPhoneId,
            sipUsername: sipUsername,
            sipPassword: sipPassword,
            sipServer: sipServer,
            assistantId: null,
            status: 'ACTIVE'
          }
        });
      } else {
        isNewNumber = true;
        savedPhoneNumber = await tx.phoneNumber.create({
          data: {
            businessId: businessId,
            phoneNumber: formattedNumber,
            countryCode: 'TR',
            provider: 'ELEVENLABS',
            elevenLabsPhoneId: elevenLabsPhoneId,
            sipUsername: sipUsername,
            sipPassword: sipPassword,
            sipServer: sipServer,
            assistantId: null,
            status: 'ACTIVE',
            monthlyCost: PRICING.NETGSM.displayMonthly,
            nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          }
        });
      }

      if (previousBusinessId && previousBusinessId !== businessId) {
        await syncLegacyBusinessPhoneFields(tx, previousBusinessId);
        await reconcilePhoneNumberUsage(tx, previousBusinessId);
      }

      await syncLegacyBusinessPhoneFields(tx, businessId);
      await reconcilePhoneNumberUsage(tx, businessId);

      return tx.phoneNumber.findUnique({
        where: { id: savedPhoneNumber.id }
      });
    });

    console.log('✅ SIP trunk phone number saved:', newPhoneNumber.id);

    res.json({
      success: true,
      id: newPhoneNumber.id,
      phoneNumber: newPhoneNumber.phoneNumber,
      provider: 'ELEVENLABS',
      countryCode: 'TR',
      status: 'ACTIVE',
      elevenLabsPhoneId: elevenLabsPhoneId,
      message: isNewNumber ? 'Telefon numarası başarıyla bağlandı!' : 'Telefon numarası güncellendi!'
    });

  } catch (error) {
    console.error('❌ Import SIP trunk error:', error);
    res.status(500).json({
      error: 'SIP numarası import edilemedi',
      details: error.message
    });
  }
});

// ============================================================================
// UPDATE SIP TRUNK CONFIGURATION
// ============================================================================
router.patch('/:id/sip-config', async (req, res) => {
  try {
    const { id } = req.params;
    const { sipServer, sipUsername, sipPassword } = req.body;
    const businessId = req.businessId;

    console.log('🔄 [SIP Config Update] Starting...', { id, sipServer, sipUsername });

    // Get phone number
    const phoneNumber = await prisma.phoneNumber.findFirst({
      where: { id, businessId }
    });

    if (!phoneNumber) {
      return res.status(404).json({ error: 'Phone number not found' });
    }

    if (!phoneNumber.elevenLabsPhoneId) {
      return res.status(400).json({ error: 'Phone number is not connected' });
    }

    // Update in 11Labs
    await elevenLabsService.updateSipTrunkConfig(phoneNumber.elevenLabsPhoneId, {
      sipServer,
      sipUsername,
      sipPassword
    });

    // Update in database
    await prisma.phoneNumber.update({
      where: { id },
      data: {
        sipServer,
        sipUsername,
        sipPassword
      }
    });

    console.log('✅ SIP config updated successfully');
    res.json({ success: true, message: 'SIP configuration updated' });

  } catch (error) {
    console.error('❌ SIP config update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// UPDATE ASSISTANT ASSIGNMENT
// ============================================================================
router.patch('/:id/assistant', async (req, res) => {
  try {
    const { id } = req.params;
    const { assistantId } = req.body || {};
    const businessId = req.businessId;
    const inboundEnabled = isPhoneInboundEnabledForBusinessRecord(req.user?.business);

    if (!inboundEnabled) {
      return res.status(403).json(PHONE_INBOUND_ASSIGNMENT_DISABLED_ERROR);
    }

    if (!assistantId || typeof assistantId !== 'string') {
      return res.status(400).json({ error: 'assistantId is required' });
    }

    const [phoneNumber, assistant] = await Promise.all([
      prisma.phoneNumber.findFirst({
        where: {
          id,
          businessId,
          status: 'ACTIVE'
        }
      }),
      prisma.assistant.findFirst({
        where: {
          id: assistantId,
          businessId,
          isActive: true,
          assistantType: 'phone',
          callDirection: 'inbound'
        },
        select: {
          id: true,
          name: true,
          elevenLabsAgentId: true,
          callDirection: true
        }
      })
    ]);

    if (!phoneNumber) {
      return res.status(404).json({ error: 'Phone number not found' });
    }

    if (!assistant) {
      return res.status(404).json({ error: 'Inbound assistant not found' });
    }

    if (!phoneNumber.elevenLabsPhoneId) {
      return res.status(400).json({
        error: 'PHONE_NUMBER_NOT_CONNECTED',
        message: 'Telefon numarası henüz aktif değil.'
      });
    }

    if (!assistant.elevenLabsAgentId) {
      return res.status(400).json({
        error: 'ASSISTANT_NOT_CONNECTED',
        message: 'Seçilen asistan aramalar için hazır değil.'
      });
    }

    await elevenLabsService.updatePhoneNumber(phoneNumber.elevenLabsPhoneId, assistant.elevenLabsAgentId);

    const updatedPhoneNumber = await prisma.phoneNumber.update({
      where: { id },
      data: { assistantId: assistant.id },
      include: {
        assistant: {
          select: {
            id: true,
            name: true,
            isActive: true
          }
        }
      }
    });

    res.json({
      success: true,
      phoneNumber: {
        id: updatedPhoneNumber.id,
        assistantId: updatedPhoneNumber.assistant?.isActive ? updatedPhoneNumber.assistantId : null,
        assistantName: updatedPhoneNumber.assistant?.isActive ? updatedPhoneNumber.assistant.name : null
      }
    });
  } catch (error) {
    console.error('❌ Update phone assistant error:', error);
    res.status(500).json({
      error: 'Failed to update phone assistant',
      details: error.message
    });
  }
});

// ============================================================================
// UPDATE ROUTING FLAGS
// ============================================================================
router.patch('/:id/routing', async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.businessId;
    const {
      isDefaultInbound,
      isDefaultOutbound,
      isPublicContact
    } = req.body || {};

    if (
      typeof isDefaultInbound !== 'boolean'
      && typeof isDefaultOutbound !== 'boolean'
      && typeof isPublicContact !== 'boolean'
    ) {
      return res.status(400).json({
        error: 'At least one routing flag must be provided'
      });
    }

    const updatedPhone = await prisma.$transaction(async (tx) => {
      const phone = await setPhoneNumberRoutingFlags(tx, {
        businessId,
        phoneNumberId: id,
        isDefaultInbound,
        isDefaultOutbound,
        isPublicContact
      });

      await reconcilePhoneNumberUsage(tx, businessId);
      return phone;
    });

    res.json({
      success: true,
      phoneNumber: updatedPhone
    });
  } catch (error) {
    if (error.message === 'PHONE_NUMBER_NOT_FOUND') {
      return res.status(404).json({ error: 'Phone number not found' });
    }

    if (error.message === 'PHONE_ROUTING_FLAGS_UNAVAILABLE') {
      return res.status(503).json({
        error: 'PHONE_ROUTING_FLAGS_UNAVAILABLE',
        message: 'Phone routing flags are unavailable until the database migration is applied.'
      });
    }

    console.error('❌ Update phone routing error:', error);
    res.status(500).json({
      error: 'Failed to update phone routing',
      details: error.message
    });
  }
});

// ============================================================================
// DELETE/CANCEL PHONE NUMBER
// ============================================================================
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.businessId;

    console.log('🗑️ Cancelling phone number:', id);

    // Get phone number
    const phoneNumber = await prisma.phoneNumber.findFirst({
      where: {
        id: id,
        businessId: businessId
      }
    });

    if (!phoneNumber) {
      return res.status(404).json({ error: 'Phone number not found' });
    }

    // Cancel with provider
    if (phoneNumber.provider === 'NETGSM' && phoneNumber.netgsmNumberId) {
      try {
        await netgsmService.cancelNumber(phoneNumber.netgsmNumberId);
        console.log('✅ Cancelled with Netgsm');
      } catch (error) {
        console.error('⚠️ Failed to cancel with Netgsm:', error.message);
      }
    }

    // Remove from 11Labs if connected
    if (phoneNumber.elevenLabsPhoneId) {
      try {
        await elevenLabsService.deletePhoneNumber(phoneNumber.elevenLabsPhoneId);
        console.log('✅ Removed from 11Labs');
      } catch (error) {
        console.error('⚠️ Failed to remove from 11Labs:', error.message);
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.phoneNumber.delete({
        where: { id: id }
      });

      await syncLegacyBusinessPhoneFields(tx, businessId);
      await reconcilePhoneNumberUsage(tx, businessId);
    });

    console.log('✅ Phone number cancelled successfully');

    res.json({
      success: true,
      message: 'Phone number cancelled successfully'
    });

  } catch (error) {
    console.error('❌ Cancel phone number error:', error);
    res.status(500).json({
      error: 'Failed to cancel phone number',
      details: error.message
    });
  }
});

// ============================================================================
// TEST CALL
// ============================================================================
const VALID_CALL_TYPES = ['BILLING_REMINDER', 'APPOINTMENT_REMINDER', 'SHIPPING_UPDATE'];

router.post('/:id/test-call', async (req, res) => {
  try {
    const { id } = req.params;
    const { testPhoneNumber, callType } = req.body;
    const businessId = req.businessId;

    console.log('☎️ Initiating test call...', { id, testPhoneNumber, callType });

    if (!callType || !VALID_CALL_TYPES.includes(callType)) {
      return res.status(400).json({
        error: 'callType is required',
        validTypes: VALID_CALL_TYPES,
        example: { testPhoneNumber: '+905551234567', callType: 'BILLING_REMINDER' }
      });
    }

    if (!testPhoneNumber) {
      return res.status(400).json({
        error: 'Test phone number is required',
        example: { testPhoneNumber: '+905551234567', callType: 'BILLING_REMINDER' }
      });
    }

    const outboundAccess = await resolvePhoneOutboundAccessForBusinessId(businessId);

    if (!outboundAccess.hasAccess) {
      if (outboundAccess.reasonCode === 'NO_SUBSCRIPTION') {
        return res.status(403).json({
          error: 'NO_SUBSCRIPTION',
          message: 'No active subscription found for outbound test calls.',
          messageTR: 'Outbound test araması için aktif abonelik bulunamadı.'
        });
      }

      if (outboundAccess.reasonCode === 'SUBSCRIPTION_INACTIVE') {
        return res.status(403).json({
          error: 'SUBSCRIPTION_INACTIVE',
          status: outboundAccess.status,
          message: 'Subscription is not active.',
          messageTR: 'Abonelik aktif değil.'
        });
      }

      const reasonCode = outboundAccess.reasonCode || 'OUTBOUND_DISABLED';

      let message = 'Outbound test call is disabled for your current configuration.';
      let messageTR = 'Outbound test araması mevcut yapılandırmada kapalı.';

      if (reasonCode === 'PLAN_DISABLED') {
        message = `Outbound test call is disabled for ${outboundAccess.plan}.`;
        messageTR = `Outbound test araması ${outboundAccess.plan} planında kapalı.`;
      } else if (reasonCode === 'V1_OUTBOUND_ONLY') {
        message = 'Outbound is disabled while inbound is disabled in V1 mode.';
        messageTR = 'V1 modunda inbound kapalıyken outbound da kapalıdır.';
      } else if (reasonCode === 'BUSINESS_DISABLED') {
        message = 'Outbound is disabled because inbound is disabled for this business.';
        messageTR = 'Bu işletmede inbound kapalı olduğu için outbound da kapalıdır.';
      }

      return res.status(403).json({
        error: 'OUTBOUND_TEST_CALL_NOT_ALLOWED',
        reasonCode,
        requiredPlan: outboundAccess.requiredPlan,
        message,
        messageTR
      });
    }

    // Get phone number
    const phoneNumber = await prisma.phoneNumber.findFirst({
      where: {
        id: id,
        businessId: businessId
      }
    });

    if (!phoneNumber) {
      return res.status(404).json({ error: 'Phone number not found' });
    }

    // Resolve outbound assistant (V1: phone-level assignment is disabled)
    let assistant = null;
    if (phoneNumber.assistantId) {
      assistant = await prisma.assistant.findUnique({
        where: { id: phoneNumber.assistantId }
      });
    }

    const assignedAssistantIsOutbound = assistant?.callDirection?.startsWith('outbound');
    if (!assignedAssistantIsOutbound || !assistant?.elevenLabsAgentId) {
      assistant = await prisma.assistant.findFirst({
        where: {
          businessId,
          isActive: true,
          callDirection: { startsWith: 'outbound' },
          elevenLabsAgentId: { not: null }
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    // P0.2: Use safeCallInitiator for capacity management
    if (!phoneNumber.elevenLabsPhoneId || !assistant?.elevenLabsAgentId) {
      return res.status(400).json({
        error: 'Phone number or outbound assistant is not ready',
        hint: 'Aktif bir outbound assistant oluşturup tekrar deneyin'
      });
    }

    const { initiateOutboundCallSafe } = await import('../services/safeCallInitiator.js');

    const result = await initiateOutboundCallSafe({
      businessId,
      agentId: assistant.elevenLabsAgentId,
      phoneNumberId: phoneNumber.elevenLabsPhoneId,
      toNumber: testPhoneNumber,
      clientData: { test: true, phoneNumberId: phoneNumber.id, call_type: callType, phone_outbound_v1: true }
    });

    if (!result.success) {
      return res.status(503).json({
        error: result.error,
        message: result.message,
        retryAfter: result.retryAfter,
        ...result.details
      });
    }

    res.json({
      success: true,
      message: 'Test call initiated',
      callId: result.call.call_sid || result.call.conversation_id,
      from: phoneNumber.phoneNumber,
      to: testPhoneNumber,
      slotInfo: result.slotInfo
    });

  } catch (error) {
    console.error('❌ Test call error:', error);

    // P0.2: Handle capacity errors
    const { CapacityError } = await import('../services/safeCallInitiator.js');
    if (error instanceof CapacityError) {
      return res.status(503).json({
        error: error.code,
        message: error.message,
        retryAfter: error.retryAfter,
        ...error.details
      });
    }

    res.status(500).json({
      error: 'Failed to initiate test call',
      details: error.message
    });
  }
});

// ============================================================================
// GET AVAILABLE COUNTRIES (filtered by business country)
// ============================================================================
router.get('/countries', async (req, res) => {
  try {
    const businessId = req.businessId;

    // Get business country
    let businessCountry = 'TR'; // Default to Turkey
    if (businessId) {
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: { country: true }
      });
      if (business?.country) {
        businessCountry = business.country;
      }
    }

    // Get SIP providers for this country
    const sipProviders = getProvidersForCountry(businessCountry);

    // All available countries with generic SIP support
    const allCountries = [
      {
        code: 'TR',
        name: 'Türkiye',
        flag: '🇹🇷',
        provider: 'SIP_TRUNK',
        requiresSipForm: true,
        sipProviders: sipProviders.filter(p => p.country === 'TR' || p.country === 'GLOBAL'),
        helpText: 'SIP sağlayıcınızın panelinden SIP bilgilerinizi alabilirsiniz'
      },
      {
        code: 'US',
        name: 'United States',
        flag: '🇺🇸',
        provider: 'SIP_TRUNK',
        requiresSipForm: true,
        sipProviders: getProvidersForCountry('US'),
        helpText: 'Get your SIP credentials from your VoIP provider'
      }
    ];

    // Filter countries based on business country
    const filteredCountries = allCountries.filter(c => c.code === businessCountry);

    // If no match, show all (fallback)
    const countries = filteredCountries.length > 0 ? filteredCountries : allCountries;

    res.json({
      countries,
      businessCountry,
      sipProviders: sipProviders
    });
  } catch (error) {
    console.error('❌ Get countries error:', error);
    res.status(500).json({ error: 'Failed to get countries' });
  }
});

export default router;
