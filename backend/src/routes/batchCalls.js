import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissions.js';
import multer from 'multer';
import XLSX from 'xlsx';
import axios from 'axios';
import {
  ENTITLEMENT_REASONS
} from '../services/phonePlanEntitlements.js';
import { resolvePhoneOutboundAccessForBusinessId } from '../services/phoneOutboundAccess.js';
import { validateUntrustedUpload } from '../security/uploadSecurity.js';

const router = express.Router();

// Configure multer for file uploads (5MB max)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.csv') || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
    }
  }
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Normalize phone number to E.164 format
 * Supports international numbers and Turkish numbers
 */
function normalizePhoneNumber(phone) {
  if (!phone) return null;

  // Convert to string and handle scientific notation (e.g., 9.05058E+11)
  let phoneStr = String(phone);
  if (phoneStr.includes('E+') || phoneStr.includes('e+')) {
    // Parse scientific notation to full number string
    phoneStr = Number(phone).toLocaleString('fullwide', { useGrouping: false });
  }

  // Remove all non-numeric characters except +
  let cleaned = phoneStr.replace(/[^\d+]/g, '');

  // If already has + at the start, it's international format - keep as is
  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  // Remove leading + if somehow in middle (shouldn't happen but safety)
  cleaned = cleaned.replace(/\+/g, '');

  // Handle numbers starting with country codes (without +)
  if (cleaned.startsWith('90') && cleaned.length >= 12) {
    // Turkish number with country code (905XXXXXXXXX)
    return '+' + cleaned;
  } else if (cleaned.startsWith('1') && cleaned.length === 11) {
    // US/Canada number (1XXXXXXXXXX)
    return '+' + cleaned;
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    // Turkish number with leading 0 (05XXXXXXXXX)
    return '+90' + cleaned.substring(1);
  } else if (cleaned.length === 10 && cleaned.startsWith('5')) {
    // Turkish mobile without country code (5XXXXXXXXX)
    return '+90' + cleaned;
  } else if (cleaned.length >= 10) {
    // Other international - assume it's complete, just add +
    return '+' + cleaned;
  }

  return null; // Invalid phone number
}

function inferCallType(assistant, dynamicVars = {}) {
  const direction = assistant?.callDirection || '';

  if (direction === 'outbound_collection' || dynamicVars.debt_amount) {
    return 'BILLING_REMINDER';
  }

  if (dynamicVars.appointment_date) {
    return 'APPOINTMENT_REMINDER';
  }

  if (dynamicVars.tracking_number || dynamicVars.shipping_status || dynamicVars.order_status) {
    return 'SHIPPING_UPDATE';
  }

  return 'BILLING_REMINDER';
}

async function filterDoNotCallRecipients(businessId, recipients) {
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return { allowedRecipients: [], blockedRecipients: [] };
  }

  if (!prisma.doNotCall || typeof prisma.doNotCall.findMany !== 'function') {
    throw new Error('DNC_PRECHECK_UNAVAILABLE');
  }

  const phones = [...new Set(recipients.map(r => r.phone_number).filter(Boolean))];
  if (phones.length === 0) {
    return { allowedRecipients: recipients, blockedRecipients: [] };
  }

  const blocked = await prisma.doNotCall.findMany({
    where: {
      businessId,
      phoneE164: {
        in: phones
      }
    },
    select: {
      phoneE164: true
    }
  });

  const blockedSet = new Set(blocked.map(item => item.phoneE164));
  const allowedRecipients = recipients.filter(r => !blockedSet.has(r.phone_number));
  const blockedRecipients = recipients.filter(r => blockedSet.has(r.phone_number));

  return { allowedRecipients, blockedRecipients };
}

function deriveBatchStatusFromElevenLabs({ currentStatus, totalScheduled, totalDispatched, totalFinished, elevenLabsStatus, successfulCalls, failedCalls }) {
  const scheduled = Number(totalScheduled) || 0;
  const dispatched = Number(totalDispatched) || 0;
  const finished = Number(totalFinished) || 0;
  const success = Number(successfulCalls) || 0;
  const failed = Number(failedCalls) || 0;

  const allCallsFinished = scheduled > 0 && finished >= scheduled;

  if (allCallsFinished) {
    if (failed > 0 && success === 0) {
      return 'FAILED';
    }
    return 'COMPLETED';
  }

  if (elevenLabsStatus === 'failed' && finished === 0) {
    return 'FAILED';
  }

  if (elevenLabsStatus === 'cancelled') {
    return 'CANCELLED';
  }

  if (dispatched > 0 || elevenLabsStatus === 'in_progress') {
    return 'IN_PROGRESS';
  }

  return currentStatus;
}

/**
 * Parse CSV/Excel file and return rows
 * Uses UTF-8 encoding to preserve Turkish characters (ğ, ü, ş, ı, ö, ç)
 */
function parseFile(buffer, filename) {
  // Read with UTF-8 encoding (codepage 65001) to preserve Turkish characters
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    codepage: 65001,  // UTF-8 encoding for Turkish characters
    raw: false        // Parse values, don't keep raw strings
  });

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convert to JSON with headers, preserving string values
  const data = XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    raw: false  // Convert all values to strings
  });

  if (data.length === 0) {
    throw new Error('File is empty or has no data rows');
  }

  // Get column names from first row
  const columns = Object.keys(data[0]);

  // Log sample data for debugging Turkish characters
  if (data.length > 0) {
    console.log('📋 Sample row from file:', JSON.stringify(data[0]));
  }

  return { data, columns };
}

const COMMON_MAPPING_FIELDS = ['phone', 'customer_name'];

const PURPOSE_TEMPLATE_FIELDS = {
  collection: ['debt_amount', 'currency', 'due_date'],
  sales: ['product_name', 'product_price', 'campaign_name', 'customer_company', 'interest_area', 'previous_product', 'custom_notes'],
  general: ['info_type', 'custom_data']
};

const LEGACY_GENERAL_FIELDS = ['custom_info', 'custom_notes', 'appointment_date', 'custom_1', 'custom_2'];

const COLUMN_ALIASES = {
  phone: [
    'phone',
    'phone number',
    'phone_number',
    'phonenumber',
    'telefon',
    'telefon no',
    'telefon numarasi',
    'telefon numarası',
    'tel',
    'gsm',
    'cep telefonu',
    'mobile',
    'mobile phone'
  ],
  customer_name: [
    'customer_name',
    'customer name',
    'name',
    'full name',
    'isim',
    'ad',
    'ad soyad',
    'isim soyisim',
    'musteri adi',
    'müşteri adı'
  ],
  debt_amount: [
    'debt_amount',
    'debt amount',
    'borc tutari',
    'borç tutarı',
    'borc miktari',
    'borç miktarı',
    'tutar',
    'amount'
  ],
  currency: [
    'currency',
    'para birimi',
    'doviz',
    'döviz',
    'kur'
  ],
  due_date: [
    'due_date',
    'due date',
    'vade tarihi',
    'odeme tarihi',
    'ödeme tarihi'
  ],
  product_name: [
    'product_name',
    'product name',
    'service name',
    'urun hizmet adi',
    'ürün hizmet adı',
    'urun adi',
    'ürün adı',
    'hizmet adi',
    'hizmet adı'
  ],
  product_price: [
    'product_price',
    'product price',
    'price',
    'fiyat',
    'ucret',
    'ücret'
  ],
  campaign_name: [
    'campaign_name',
    'campaign name',
    'kampanya adi',
    'kampanya adı'
  ],
  customer_company: [
    'customer_company',
    'customer company',
    'company',
    'company name',
    'sirket',
    'şirket',
    'firma',
    'firma adi',
    'firma adı',
    'sirket adi',
    'şirket adı'
  ],
  interest_area: [
    'interest_area',
    'interest area',
    'ilgi alani',
    'ilgi alanı',
    'odak alan',
    'odak alanı',
    'ilgili konu',
    'oncelik',
    'öncelik'
  ],
  previous_product: [
    'previous_product',
    'previous product',
    'onceki urun',
    'önceki ürün',
    'onceki hizmet',
    'önceki hizmet',
    'mevcut urun',
    'mevcut ürün',
    'mevcut hizmet',
    'mevcut altyapi',
    'mevcut altyapı',
    'kullandigi platform',
    'kullandığı platform',
    'altyapi',
    'altyapı'
  ],
  info_type: [
    'info_type',
    'info type',
    'konu',
    'amac',
    'amaç',
    'konu amac',
    'konu amaç',
    'bilgi turu',
    'bilgi türü'
  ],
  custom_data: [
    'custom_data',
    'custom data',
    'ek bilgi',
    'ek aciklama',
    'ek açıklama',
    'ozel veri',
    'özel veri',
    'aciklama',
    'açıklama',
    'not',
    'detay'
  ],
  custom_info: [
    'custom_info',
    'custom info'
  ],
  custom_notes: [
    'custom_notes',
    'custom notes'
  ],
  appointment_date: [
    'appointment_date',
    'appointment date',
    'randevu tarihi'
  ],
  custom_1: [
    'custom_1',
    'custom 1'
  ],
  custom_2: [
    'custom_2',
    'custom 2'
  ]
};

function normalizeColumnName(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[ı]/g, 'i')
    .replace(/[ğ]/g, 'g')
    .replace(/[ü]/g, 'u')
    .replace(/[ş]/g, 's')
    .replace(/[ö]/g, 'o')
    .replace(/[ç]/g, 'c')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

const NORMALIZED_COLUMN_ALIASES = Object.fromEntries(
  Object.entries(COLUMN_ALIASES).map(([key, aliases]) => {
    const normalizedAliases = aliases
      .map(alias => normalizeColumnName(alias))
      .filter(Boolean);
    return [key, new Set(normalizedAliases)];
  })
);

function getMappingFieldsForPurpose(callPurpose = '') {
  const normalizedPurpose = String(callPurpose || '').trim().toLowerCase();
  const templateFields = PURPOSE_TEMPLATE_FIELDS[normalizedPurpose];

  if (templateFields) {
    return normalizedPurpose === 'general'
      ? [...COMMON_MAPPING_FIELDS, ...templateFields, ...LEGACY_GENERAL_FIELDS]
      : [...COMMON_MAPPING_FIELDS, ...templateFields];
  }

  return [
    ...COMMON_MAPPING_FIELDS,
    ...PURPOSE_TEMPLATE_FIELDS.collection,
    ...PURPOSE_TEMPLATE_FIELDS.sales,
    ...PURPOSE_TEMPLATE_FIELDS.general,
    ...LEGACY_GENERAL_FIELDS
  ];
}

function detectKnownColumnMapping(columns = [], callPurpose = '') {
  if (!Array.isArray(columns) || columns.length === 0) {
    return {};
  }

  const normalizedColumns = columns.map((column) => ({
    original: column,
    normalized: normalizeColumnName(column)
  }));
  const usedColumns = new Set();
  const detectedMapping = {};

  for (const field of getMappingFieldsForPurpose(callPurpose)) {
    const aliasSet = NORMALIZED_COLUMN_ALIASES[field];
    if (!aliasSet) continue;

    const match = normalizedColumns.find((entry) => (
      !usedColumns.has(entry.original) && aliasSet.has(entry.normalized)
    ));

    if (match) {
      detectedMapping[field] = match.original;
      usedColumns.add(match.original);
    }
  }

  return detectedMapping;
}

function normalizeColumnMapping(mapping = {}) {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
    return {};
  }

  return Object.entries(mapping).reduce((acc, [key, value]) => {
    if (typeof value !== 'string') return acc;
    const trimmed = value.trim();
    if (!trimmed || trimmed === '_none_') return acc;
    acc[key] = trimmed;
    return acc;
  }, {});
}

function buildEffectiveColumnMapping(columns = [], providedMapping = {}, callPurpose = '') {
  const autoMapping = detectKnownColumnMapping(columns, callPurpose);
  const userMapping = normalizeColumnMapping(providedMapping);
  const mergedMapping = {
    ...autoMapping,
    ...userMapping
  };

  // Keep outbound general prompt variables populated even when only new keys are mapped.
  if (mergedMapping.info_type && !mergedMapping.custom_info) {
    mergedMapping.custom_info = mergedMapping.info_type;
  }
  if (mergedMapping.custom_data && !mergedMapping.custom_notes) {
    mergedMapping.custom_notes = mergedMapping.custom_data;
  }

  return {
    autoMapping,
    mergedMapping
  };
}

function readMappedValue(row = {}, mapping = {}, key, defaultValue = null) {
  const column = mapping[key];
  if (!column) return null;
  const rawValue = row[column];
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return defaultValue;
  }
  return String(rawValue);
}

/**
 * Check if plan allows batch calls
 */
async function checkBatchCallAccess(businessId) {
  const access = await resolvePhoneOutboundAccessForBusinessId(businessId);

  return {
    hasAccess: access.hasAccess,
    plan: access.plan,
    status: access.status,
    reasonCode: access.reasonCode,
    requiredPlan: access.requiredPlan,
    outboundTestCallEnabled: access.outboundTestCallEnabled
  };
}

function toBatchAccessPayload(access) {
  if (access.hasAccess) {
    return {
      hasAccess: true,
      reasonCode: null,
      requiredPlan: null,
      lockContext: null,
      outboundTestCallEnabled: Boolean(access.outboundTestCallEnabled),
      message: 'Outbound campaigns are available.',
      messageTR: 'Outbound kampanya aramaları kullanılabilir.'
    };
  }

  if (access.reasonCode === ENTITLEMENT_REASONS.PLAN_UPGRADE_REQUIRED) {
    return {
      hasAccess: false,
      reasonCode: ENTITLEMENT_REASONS.PLAN_UPGRADE_REQUIRED,
      requiredPlan: access.requiredPlan || 'TRIAL',
      lockContext: 'PLAN',
      outboundTestCallEnabled: Boolean(access.outboundTestCallEnabled),
      message: `Outbound is available on ${access.requiredPlan || 'TRIAL'}+ plans.`,
      messageTR: `Outbound ${access.requiredPlan || 'TRIAL'}+ planlarda açıktır.`
    };
  }

  if (access.reasonCode === ENTITLEMENT_REASONS.PLAN_DISABLED) {
    return {
      hasAccess: false,
      reasonCode: ENTITLEMENT_REASONS.PLAN_DISABLED,
      requiredPlan: access.requiredPlan || 'TRIAL',
      lockContext: 'PLAN',
      outboundTestCallEnabled: Boolean(access.outboundTestCallEnabled),
      message: `Outbound is disabled for ${access.plan || 'FREE'} plan.`,
      messageTR: `${access.plan || 'FREE'} planında outbound kapalı.`
    };
  }

  if (access.reasonCode === ENTITLEMENT_REASONS.V1_OUTBOUND_ONLY) {
    return {
      hasAccess: false,
      reasonCode: ENTITLEMENT_REASONS.V1_OUTBOUND_ONLY,
      requiredPlan: null,
      lockContext: 'INBOUND_V1',
      outboundTestCallEnabled: Boolean(access.outboundTestCallEnabled),
      message: 'Inbound is disabled in V1 outbound-only mode.',
      messageTR: 'V1 outbound-only modunda inbound kapalıdır.'
    };
  }

  if (access.reasonCode === ENTITLEMENT_REASONS.BUSINESS_DISABLED) {
    return {
      hasAccess: false,
      reasonCode: ENTITLEMENT_REASONS.BUSINESS_DISABLED,
      requiredPlan: null,
      lockContext: 'INBOUND_TOGGLE',
      outboundTestCallEnabled: Boolean(access.outboundTestCallEnabled),
      message: 'Outbound is disabled because inbound is disabled for this business.',
      messageTR: 'Bu işletmede inbound kapalı olduğu için outbound kapalıdır.'
    };
  }

  if (access.reasonCode === 'SUBSCRIPTION_INACTIVE') {
    return {
      hasAccess: false,
      reasonCode: 'SUBSCRIPTION_INACTIVE',
      requiredPlan: null,
      lockContext: 'SUBSCRIPTION',
      outboundTestCallEnabled: Boolean(access.outboundTestCallEnabled),
      message: 'Subscription is not active.',
      messageTR: 'Abonelik aktif değil.'
    };
  }

  if (access.reasonCode === 'NO_SUBSCRIPTION') {
    return {
      hasAccess: false,
      reasonCode: 'NO_SUBSCRIPTION',
      requiredPlan: 'TRIAL',
      lockContext: 'SUBSCRIPTION',
      outboundTestCallEnabled: Boolean(access.outboundTestCallEnabled),
      message: 'No active subscription found.',
      messageTR: 'Aktif abonelik bulunamadı.'
    };
  }

  return {
    hasAccess: false,
    reasonCode: access.reasonCode || ENTITLEMENT_REASONS.PLAN_DISABLED,
    requiredPlan: access.requiredPlan || null,
    lockContext: 'PLAN',
    outboundTestCallEnabled: Boolean(access.outboundTestCallEnabled),
    message: 'Campaigns are not available for your current plan.',
    messageTR: 'Kampanyalar mevcut planınızda kullanılamaz.'
  };
}

function sendBatchCallAccessDenied(res, access) {
  const payload = toBatchAccessPayload(access);

  return res.status(403).json({
    ...payload,
    error: payload.message,
    errorTR: payload.messageTR,
    upgrade: payload.reasonCode === ENTITLEMENT_REASONS.PLAN_UPGRADE_REQUIRED
  });
}

// ============================================================
// ROUTES
// ============================================================

router.use(authenticateToken);

/**
 * GET /api/batch-calls/check-access
 * Check if business has access to batch calling
 * NOTE: This route must be defined BEFORE /:id to avoid being caught by it
 */
router.get('/check-access', async (req, res) => {
  try {
    const businessId = req.businessId;
    const access = await checkBatchCallAccess(businessId);
    res.json(toBatchAccessPayload(access));
  } catch (error) {
    console.error('Check access error:', error);
    res.status(500).json({ error: 'Failed to check access' });
  }
});

/**
 * GET /api/batch-calls/template
 * Download Excel template for batch calling
 * Supports collection (default), sales, and general templates via ?type=
 * NOTE: This route must be defined BEFORE /:id to avoid being caught by it
 */
router.get('/template', async (req, res) => {
  try {
    const templateType = String(req.query.type || 'collection').trim().toLowerCase();

    let sampleData;
    let sheetName;
    let columnWidths;
    let filename;

    switch (templateType) {
      case 'sales':
        sampleData = [
          {
            'Telefon': '+905321234567',
            'Müşteri Adı': 'Ahmet Yılmaz',
            'Şirket': 'Kozvit',
            'İlgi Alanı': 'WhatsApp ve e-posta müşteri desteği',
            'Mevcut Altyapı': 'ikas',
            'Notlar': 'Yüksek ürün çeşitliliği, kampanya dönemlerinde destek yükü artıyor',
            'Ürün/Hizmet Adı': 'Premium Paket',
            'Fiyat': '2500 TL',
            'Kampanya Adı': 'Yılsonu İndirimi'
          },
          {
            'Telefon': '+905331234568',
            'Müşteri Adı': 'Ayşe Demir',
            'Şirket': 'Online Çiftçi',
            'İlgi Alanı': 'Sipariş durumu ve telefon destek otomasyonu',
            'Mevcut Altyapı': 'ikas',
            'Notlar': 'Sepet terk etme ve sipariş sonrası destek akışları öncelikli',
            'Ürün/Hizmet Adı': 'Standart Paket',
            'Fiyat': '1500 TL',
            'Kampanya Adı': 'Yılsonu İndirimi'
          },
          {
            'Telefon': '+905341234569',
            'Müşteri Adı': 'Mehmet Kaya',
            'Şirket': 'Kozabiat',
            'İlgi Alanı': 'Chat ve çağrı merkezi ön eleme',
            'Mevcut Altyapı': 'Özel e-ticaret sitesi',
            'Notlar': 'Çok kanallı destek ve iade sorularında yoğunluk var',
            'Ürün/Hizmet Adı': 'Enterprise Paket',
            'Fiyat': '5000 TL',
            'Kampanya Adı': 'Kurumsal Fırsat'
          }
        ];
        sheetName = 'Satış Araması';
        columnWidths = [
          { wch: 15 }, // Telefon
          { wch: 18 }, // Müşteri Adı
          { wch: 18 }, // Şirket
          { wch: 28 }, // İlgi Alanı
          { wch: 18 }, // Mevcut Altyapı
          { wch: 36 }, // Notlar
          { wch: 20 }, // Ürün/Hizmet Adı
          { wch: 12 }, // Fiyat
          { wch: 18 }, // Kampanya Adı
        ];
        filename = 'satis-sablon.xlsx';
        break;
      case 'general':
        sampleData = [
          {
            'Telefon No': '+905321234567',
            'İsim Soyisim': 'Ahmet Yılmaz',
            'Konu/Amaç': 'Randevu hatırlatması',
            'Ek Bilgi': 'Randevu tarihi 05/03/2026 saat 14:30'
          },
          {
            'Telefon No': '+905331234568',
            'İsim Soyisim': 'Ayşe Demir',
            'Konu/Amaç': 'Bilgilendirme',
            'Ek Bilgi': 'Yeni çalışma saatleri Pazartesi itibarıyla güncellendi'
          },
          {
            'Telefon No': '+905341234569',
            'İsim Soyisim': 'Mehmet Kaya',
            'Konu/Amaç': 'Üyelik güncellemesi',
            'Ek Bilgi': 'Paket yükseltme kampanyası 31/03/2026 tarihine kadar geçerli'
          }
        ];
        sheetName = 'Genel Bilgilendirme';
        columnWidths = [
          { wch: 15 }, // Telefon No
          { wch: 20 }, // İsim Soyisim
          { wch: 22 }, // Konu/Amaç
          { wch: 40 }, // Ek Bilgi
        ];
        filename = 'bilgilendirme-sablon.xlsx';
        break;
      case 'collection':
      default:
        sampleData = [
          {
            'Telefon': '+905321234567',
            'Borç Tutarı': '1500',
            'Para Birimi': 'TL',
            'Vade Tarihi': '15/01/2024'
          },
          {
            'Telefon': '+905331234568',
            'Borç Tutarı': '2300',
            'Para Birimi': 'TL',
            'Vade Tarihi': '20/01/2024'
          },
          {
            'Telefon': '+905341234569',
            'Borç Tutarı': '800',
            'Para Birimi': 'USD',
            'Vade Tarihi': '25/01/2024'
          }
        ];
        sheetName = 'Toplu Arama';
        columnWidths = [
          { wch: 15 }, // Telefon
          { wch: 12 }, // Borç Tutarı
          { wch: 12 }, // Para Birimi
          { wch: 12 }, // Vade Tarihi
        ];
        filename = 'tahsilat-sablon.xlsx';
        break;
    }

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(sampleData);

    // Set column widths
    worksheet['!cols'] = columnWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(buffer);

  } catch (error) {
    console.error('Template download error:', error);
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

/**
 * POST /api/batch-calls/parse
 * Upload and parse file, return columns and preview data
 */
router.post('/parse', upload.single('file'), async (req, res) => {
  try {
    const businessId = req.businessId;

    // Check plan access
    const access = await checkBatchCallAccess(businessId);
    if (!access.hasAccess) {
      return sendBatchCallAccessDenied(res, access);
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    await validateUntrustedUpload({
      fileBuffer: req.file.buffer,
      fileName: req.file.originalname,
      maxSizeBytes: 5 * 1024 * 1024,
    });

    const { data, columns } = parseFile(req.file.buffer, req.file.originalname);
    const callPurpose = String(req.body?.callPurpose || req.query?.callPurpose || '').trim().toLowerCase();
    const suggestedMapping = detectKnownColumnMapping(columns, callPurpose);

    // Return first 5 rows as preview
    const preview = data.slice(0, 5);

    res.json({
      success: true,
      columns,
      preview,
      totalRows: data.length,
      suggestedMapping
    });
  } catch (error) {
    console.error('Parse file error:', error);
    res.status(400).json({
      error: error.message || 'Failed to parse file'
    });
  }
});

/**
 * POST /api/batch-calls
 * Create a new batch call campaign
 */
router.post('/', upload.single('file'), checkPermission('campaigns:view'), async (req, res) => {
  try {
    const businessId = req.businessId;

    // Check plan access
    const access = await checkBatchCallAccess(businessId);
    if (!access.hasAccess) {
      return sendBatchCallAccessDenied(res, access);
    }

    const {
      name,
      assistantId,
      phoneNumberId,
      columnMapping,
      scheduledAt,
      callPurpose
    } = req.body;
    const normalizedCallPurpose = String(callPurpose || '').trim().toLowerCase();

    // Validate required fields
    if (!name || !assistantId || !phoneNumberId) {
      return res.status(400).json({
        error: 'Name, assistant, and phone number are required'
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    await validateUntrustedUpload({
      fileBuffer: req.file.buffer,
      fileName: req.file.originalname,
      maxSizeBytes: 5 * 1024 * 1024,
    });

    // Verify assistant belongs to this business and is outbound type
    // callDirection can be 'outbound', 'outbound_sales', 'outbound_collection', or 'outbound_general'
    const assistant = await prisma.assistant.findFirst({
      where: {
        id: assistantId,
        businessId,
        isActive: true,
        OR: [
          { callDirection: 'outbound' },
          { callDirection: 'outbound_sales' },
          { callDirection: 'outbound_collection' },
          { callDirection: 'outbound_general' }
        ]
      }
    });

    if (!assistant) {
      return res.status(404).json({
        error: 'Outbound assistant not found',
        errorTR: 'Giden arama asistanı bulunamadı'
      });
    }

    if (!assistant.elevenLabsAgentId) {
      return res.status(400).json({
        error: 'Assistant is not ready for calls',
        errorTR: 'Asistan aramalar için hazır değil'
      });
    }

    // Verify phone number belongs to this business
    const phoneNumber = await prisma.phoneNumber.findFirst({
      where: {
        id: phoneNumberId,
        businessId,
        status: 'ACTIVE'
      }
    });

    if (!phoneNumber) {
      return res.status(404).json({
        error: 'Phone number not found',
        errorTR: 'Telefon numarası bulunamadı'
      });
    }

    if (!phoneNumber.elevenLabsPhoneId) {
      return res.status(400).json({
        error: 'Phone number is not ready for calls',
        errorTR: 'Telefon numarası aramalar için hazır değil'
      });
    }

    // Parse file
    const { data } = parseFile(req.file.buffer, req.file.originalname);

    // Parse column mapping
    let providedMapping = {};
    try {
      providedMapping = typeof columnMapping === 'string' ? JSON.parse(columnMapping) : columnMapping || {};
    } catch (e) {
      console.error('Column mapping parse error:', e);
    }

    const fileColumns = Object.keys(data[0] || {});
    const { autoMapping, mergedMapping: mapping } = buildEffectiveColumnMapping(
      fileColumns,
      providedMapping,
      normalizedCallPurpose
    );

    if (Object.keys(autoMapping).length > 0) {
      console.log('🧩 [BatchCall] Auto-detected column mapping:', autoMapping);
    }

    // Build recipients list
    let recipients = [];
    const phoneColumn = mapping.phone || 'phone';
    let recipientIndex = 0;

    for (const row of data) {
      // Find phone number using mapping
      const rawPhone = row[phoneColumn] || row['phone'] || row['Phone'] || row['telefon'] || row['Telefon'] || row['phone_number'] || row['phoneNumber'];
      const normalizedPhone = normalizePhoneNumber(rawPhone);

      if (!normalizedPhone) {
        console.log('Skipping invalid phone:', rawPhone);
        continue;
      }

      recipientIndex++;

      // Build recipient object with dynamic variables and ID for tracking
      const recipient = {
        id: `recipient_${recipientIndex}`,  // ID for webhook matching
        phone_number: normalizedPhone,
        status: 'pending'  // Initial status
      };

      // Map other columns to dynamic variables
      // Collection template variables
      const customerName = readMappedValue(row, mapping, 'customer_name');
      if (customerName !== null) {
        recipient.customer_name = customerName;
      }
      const debtAmount = readMappedValue(row, mapping, 'debt_amount');
      if (debtAmount !== null) {
        recipient.debt_amount = debtAmount;
      }
      const currency = readMappedValue(row, mapping, 'currency', 'TL');
      if (currency !== null) {
        recipient.currency = currency;
      }
      const dueDate = readMappedValue(row, mapping, 'due_date');
      if (dueDate !== null) {
        recipient.due_date = dueDate;
      }

      // Sales template variables
      const productName = readMappedValue(row, mapping, 'product_name');
      if (productName !== null) {
        recipient.product_name = productName;
      }
      const productPrice = readMappedValue(row, mapping, 'product_price');
      if (productPrice !== null) {
        recipient.product_price = productPrice;
      }
      const campaignName = readMappedValue(row, mapping, 'campaign_name');
      if (campaignName !== null) {
        recipient.campaign_name = campaignName;
      }
      const customerCompany = readMappedValue(row, mapping, 'customer_company');
      if (customerCompany !== null) {
        recipient.customer_company = customerCompany;
      }
      const interestArea = readMappedValue(row, mapping, 'interest_area');
      if (interestArea !== null) {
        recipient.interest_area = interestArea;
      }
      const previousProduct = readMappedValue(row, mapping, 'previous_product');
      if (previousProduct !== null) {
        recipient.previous_product = previousProduct;
      }

      // General template variables
      const infoType = readMappedValue(row, mapping, 'info_type');
      if (infoType !== null) {
        recipient.info_type = infoType;
        if (!mapping.custom_info) {
          recipient.custom_info = infoType;
        }
      }
      const customData = readMappedValue(row, mapping, 'custom_data');
      if (customData !== null) {
        recipient.custom_data = customData;
        if (!mapping.custom_notes) {
          recipient.custom_notes = customData;
        }
      }

      // Legacy general variables (backward compatibility)
      const customInfo = readMappedValue(row, mapping, 'custom_info');
      if (customInfo !== null) {
        recipient.custom_info = customInfo;
      }
      const customNotes = readMappedValue(row, mapping, 'custom_notes');
      if (customNotes !== null) {
        recipient.custom_notes = customNotes;
      }
      const appointmentDate = readMappedValue(row, mapping, 'appointment_date');
      if (appointmentDate !== null) {
        recipient.appointment_date = appointmentDate;
      }
      const custom1 = readMappedValue(row, mapping, 'custom_1');
      if (custom1 !== null) {
        recipient.custom_1 = custom1;
      }
      const custom2 = readMappedValue(row, mapping, 'custom_2');
      if (custom2 !== null) {
        recipient.custom_2 = custom2;
      }

      recipients.push(recipient);
    }

    if (recipients.length === 0) {
      return res.status(400).json({
        error: 'No valid phone numbers found in file',
        errorTR: 'Dosyada geçerli telefon numarası bulunamadı'
      });
    }

    // Fail-closed DNC precheck before outbound trigger
    let blockedRecipients = [];
    try {
      const filtered = await filterDoNotCallRecipients(businessId, recipients);
      recipients = filtered.allowedRecipients;
      blockedRecipients = filtered.blockedRecipients;
    } catch (dncError) {
      if (dncError.message === 'DNC_PRECHECK_UNAVAILABLE') {
        return res.status(503).json({
          error: 'DNC precheck is unavailable',
          errorTR: 'DNC ön kontrolü kullanılamıyor, toplu arama başlatılamadı'
        });
      }
      throw dncError;
    }

    if (blockedRecipients.length > 0) {
      console.log(`🛑 [BatchCall] Skipping ${blockedRecipients.length} DNC recipient(s)`);
    }

    if (recipients.length === 0) {
      return res.status(400).json({
        error: 'All recipients are blocked by do-not-call list',
        errorTR: 'Tüm alıcılar aranmayacaklar listesinde, kampanya başlatılmadı'
      });
    }

    // Create batch call in database first
    const batchCall = await prisma.batchCall.create({
      data: {
        businessId,
        assistantId,
        phoneNumberId,
        name,
        status: 'PENDING',
        totalRecipients: recipients.length,
        recipients: JSON.stringify(recipients),
        columnMapping: JSON.stringify(mapping),
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null
      }
    });

    // Submit to 11Labs Batch Calling API
    try {
      const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

      // Transform recipients to 11Labs format with dynamic_variables and metadata
      const elevenLabsRecipients = recipients.map((r) => {
        const dynamicVars = {};
        // Collection variables
        if (r.customer_name) dynamicVars.customer_name = r.customer_name;
        if (r.debt_amount) dynamicVars.debt_amount = r.debt_amount;
        if (r.due_date) dynamicVars.due_date = r.due_date;
        if (r.currency) dynamicVars.currency = r.currency;
        // Sales variables
        if (r.product_name) dynamicVars.product_name = r.product_name;
        if (r.product_price) dynamicVars.product_price = r.product_price;
        if (r.campaign_name) dynamicVars.campaign_name = r.campaign_name;
        if (r.customer_company) dynamicVars.customer_company = r.customer_company;
        if (r.interest_area) dynamicVars.interest_area = r.interest_area;
        if (r.previous_product) dynamicVars.previous_product = r.previous_product;
        // General variables
        if (r.info_type) dynamicVars.info_type = r.info_type;
        if (r.custom_data) dynamicVars.custom_data = r.custom_data;
        if (r.custom_info) dynamicVars.custom_info = r.custom_info;
        if (r.custom_notes) dynamicVars.custom_notes = r.custom_notes;
        // Legacy general variables
        if (r.appointment_date) dynamicVars.appointment_date = r.appointment_date;
        if (r.custom_1) dynamicVars.custom_1 = r.custom_1;
        if (r.custom_2) dynamicVars.custom_2 = r.custom_2;

        const callType = inferCallType(assistant, dynamicVars);

        return {
          id: r.id,  // Use the same ID stored in DB
          phone_number: r.phone_number,
          conversation_initiation_client_data: {
            dynamic_variables: dynamicVars,
            // Metadata for webhook processing
            metadata: {
              business_id: businessId.toString(),
              batch_call_id: batchCall.id,
              recipient_id: r.id,  // Use the same ID stored in DB
              channel: 'outbound',
              phone_outbound_v1: true,
              call_type: callType
            }
          }
        };
      });

      const batchPayload = {
        call_name: name,
        agent_id: assistant.elevenLabsAgentId,
        agent_phone_number_id: phoneNumber.elevenLabsPhoneId,
        recipients: elevenLabsRecipients,
        ...(scheduledAt && { scheduled_time_unix: Math.floor(new Date(scheduledAt).getTime() / 1000) })
      };

      // Log first recipient for debugging Turkish characters
      if (elevenLabsRecipients.length > 0) {
        console.log('📤 Sample recipient dynamic_variables:', JSON.stringify(
          elevenLabsRecipients[0].conversation_initiation_client_data.dynamic_variables
        ));
      }

      console.log('📤 Submitting batch call to 11Labs:', {
        call_name: name,
        agent_id: assistant.elevenLabsAgentId,
        agent_phone_number_id: phoneNumber.elevenLabsPhoneId,
        recipientCount: elevenLabsRecipients.length
      });

      const response = await axios.post(
        'https://api.elevenlabs.io/v1/convai/batch-calling/submit',
        batchPayload,
        {
          headers: {
            'xi-api-key': elevenLabsApiKey,
            'Content-Type': 'application/json; charset=utf-8'  // Explicit UTF-8 for Turkish chars
          }
        }
      );

      console.log('✅ 11Labs batch call created:', response.data);

      // 11Labs returns 'id' not 'batch_id'
      const elevenLabsBatchId = response.data.id || response.data.batch_id;

      // Update batch call with 11Labs ID
      await prisma.batchCall.update({
        where: { id: batchCall.id },
        data: {
          elevenLabsBatchId: elevenLabsBatchId,
          status: scheduledAt ? 'PENDING' : 'IN_PROGRESS',
          startedAt: scheduledAt ? null : new Date()
        }
      });

      res.json({
        success: true,
        batchCall: {
          ...batchCall,
          elevenLabsBatchId: elevenLabsBatchId
        },
        skippedDoNotCall: blockedRecipients.length,
        message: `Batch call created with ${recipients.length} recipients`
      });

    } catch (elevenLabsError) {
      console.error('❌ 11Labs batch call error:', elevenLabsError.response?.data || elevenLabsError.message);

      // Mark batch call as failed
      await prisma.batchCall.update({
        where: { id: batchCall.id },
        data: { status: 'FAILED' }
      });

      return res.status(500).json({
        error: 'Failed to start call campaign',
        details: elevenLabsError.response?.data || elevenLabsError.message
      });
    }

  } catch (error) {
    console.error('Create batch call error:', error);
    res.status(500).json({
      error: error.message || 'Failed to create batch call'
    });
  }
});

/**
 * GET /api/batch-calls
 * List all batch calls for the business
 */
router.get('/', checkPermission('campaigns:view'), async (req, res) => {
  try {
    const businessId = req.businessId;

    // Check plan access
    const access = await checkBatchCallAccess(businessId);
    if (!access.hasAccess) {
      return sendBatchCallAccessDenied(res, access);
    }

    const batchCalls = await prisma.batchCall.findMany({
      where: { businessId },
      include: {
        assistant: {
          select: { id: true, name: true }
        },
        phoneNumber: {
          select: { id: true, phoneNumber: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Fetch status updates from 11Labs for active campaigns and repair incomplete metrics
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

    const updatedBatchCalls = await Promise.all(
      batchCalls.map(async (batch) => {
        const persistedSuccessCount = Number(batch.successfulCalls) || 0;
        const persistedFailedCount = Number(batch.failedCalls) || 0;
        const persistedCompletedCount = Number(batch.completedCalls) || 0;
        const needsMetricsRepair = persistedCompletedCount > 0
          && persistedCompletedCount !== (persistedSuccessCount + persistedFailedCount);

        if (batch.elevenLabsBatchId && (
          batch.status === 'IN_PROGRESS'
          || batch.status === 'PENDING'
          || needsMetricsRepair
        )) {
          try {
            const response = await axios.get(
              `https://api.elevenlabs.io/v1/convai/batch-calling/${batch.elevenLabsBatchId}`,
              {
                headers: { 'xi-api-key': elevenLabsApiKey }
              }
            );

            const elevenLabsData = response.data;
            console.log(`📊 11Labs batch ${batch.id} status:`, elevenLabsData.status,
              `dispatched: ${elevenLabsData.total_calls_dispatched}/${elevenLabsData.total_calls_scheduled}`,
              `finished: ${elevenLabsData.total_calls_finished}/${elevenLabsData.total_calls_scheduled}`);

            const totalScheduled = elevenLabsData.total_calls_scheduled || 0;
            const totalDispatched = elevenLabsData.total_calls_dispatched || 0;
            const totalFinished = elevenLabsData.total_calls_finished || 0;

            const failedCalls = elevenLabsData.failed_calls || 0;
            const successfulCalls = elevenLabsData.successful_calls || 0;
            const newStatus = deriveBatchStatusFromElevenLabs({
              currentStatus: batch.status,
              totalScheduled,
              totalDispatched,
              totalFinished,
              elevenLabsStatus: elevenLabsData.status,
              successfulCalls,
              failedCalls
            });

            // Calculate completed calls from 11Labs data
            // Note: 11Labs uses total_calls_finished for completed calls
            const completedCalls = totalFinished;
            const normalizedSuccessCount = successfulCalls || Math.max(totalFinished - failedCalls, 0);

            // Update in database if status or outcome metrics changed
            const statusChanged = newStatus !== batch.status;
            const metricsChanged = completedCalls !== batch.completedCalls
              || normalizedSuccessCount !== batch.successfulCalls
              || failedCalls !== batch.failedCalls;

            if (statusChanged || metricsChanged) {
              await prisma.batchCall.update({
                where: { id: batch.id },
                data: {
                  status: newStatus,
                  completedCalls: completedCalls,
                  successfulCalls: normalizedSuccessCount,
                  failedCalls: failedCalls,
                  ...(newStatus === 'COMPLETED' && { completedAt: new Date() })
                }
              });
            }

            return {
              ...batch,
              status: newStatus,
              completedCalls: completedCalls,
              successfulCalls: normalizedSuccessCount,
              failedCalls: failedCalls
            };
          } catch (error) {
            console.error(`Failed to fetch 11Labs status for batch ${batch.id}:`, error.message);
            return batch;
          }
        }
        return batch;
      })
    );

    // Remove recipients from list response (too large)
    const cleanedBatchCalls = updatedBatchCalls.map(({ recipients, columnMapping, ...rest }) => rest);

    res.json({ batchCalls: cleanedBatchCalls });

  } catch (error) {
    console.error('List batch calls error:', error);
    res.status(500).json({ error: 'Failed to fetch batch calls' });
  }
});

/**
 * GET /api/batch-calls/:id
 * Get details of a specific batch call
 */
router.get('/:id', checkPermission('campaigns:view'), async (req, res) => {
  try {
    const businessId = req.businessId;
    const { id } = req.params;

    const batchCall = await prisma.batchCall.findFirst({
      where: {
        id,
        businessId
      },
      include: {
        assistant: {
          select: { id: true, name: true }
        },
        phoneNumber: {
          select: { id: true, phoneNumber: true }
        }
      }
    });

    if (!batchCall) {
      return res.status(404).json({ error: 'Batch call not found' });
    }

    // Fetch detailed status from 11Labs
    let callDetails = [];
    if (batchCall.elevenLabsBatchId) {
      try {
        const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
        const response = await axios.get(
          `https://api.elevenlabs.io/v1/convai/batch-calling/${batchCall.elevenLabsBatchId}`,
          {
            headers: { 'xi-api-key': elevenLabsApiKey }
          }
        );

        callDetails = response.data.recipients || [];
        const elevenLabsData = response.data;
        console.log(`📊 11Labs batch ${batchCall.id} detail status:`, elevenLabsData.status,
          `dispatched: ${elevenLabsData.total_calls_dispatched}/${elevenLabsData.total_calls_scheduled}`);

        // Update local status
        // 11Labs can return: pending, in_progress, completed, done, failed, cancelled
        let newStatus = batchCall.status;

        const totalScheduled = elevenLabsData.total_calls_scheduled || 0;
        const totalFinished = elevenLabsData.total_calls_finished || 0;
        const totalDispatched = elevenLabsData.total_calls_dispatched || 0;
        const failedCount = elevenLabsData.failed_calls || 0;
        const successCount = elevenLabsData.successful_calls || 0;

        console.log(`📊 Batch ${batchCall.id}: scheduled=${totalScheduled}, finished=${totalFinished}, 11Labs status=${elevenLabsData.status}`);

        newStatus = deriveBatchStatusFromElevenLabs({
          currentStatus: batchCall.status,
          totalScheduled,
          totalDispatched,
          totalFinished,
          elevenLabsStatus: elevenLabsData.status,
          successfulCalls: successCount,
          failedCalls: failedCount
        });

        // Use total_calls_finished for completed count
        const completedCount = totalFinished;
        const normalizedSuccessCount = successCount || Math.max(totalFinished - failedCount, 0);

        if (newStatus !== batchCall.status || completedCount !== batchCall.completedCalls) {
          await prisma.batchCall.update({
            where: { id: batchCall.id },
            data: {
              status: newStatus,
              completedCalls: completedCount,
              successfulCalls: normalizedSuccessCount,
              failedCalls: failedCount,
              ...(newStatus === 'COMPLETED' && { completedAt: new Date() })
            }
          });
          batchCall.status = newStatus;
          batchCall.completedCalls = completedCount;
          batchCall.successfulCalls = normalizedSuccessCount;
          batchCall.failedCalls = failedCount;
        }
      } catch (error) {
        console.error('Failed to fetch 11Labs batch details:', error.message);
      }
    }

    // Parse recipients from DB
    let recipients = [];
    try {
      recipients = JSON.parse(batchCall.recipients || '[]');
    } catch (e) {
      console.error('Failed to parse recipients:', e);
    }

    // Merge recipients with call details from 11Labs
    // Priority: DB status (from webhook) > 11Labs status > 'pending'
    const enrichedRecipients = await Promise.all(recipients.map(async (recipient, index) => {
      const callDetail = callDetails.find(c => c.phone_number === recipient.phone_number) || {};

      // Variables to store conversation data (define at function scope)
      let convDuration = null;
      let terminationReason = null;

      // Use DB status if it was updated by webhook, otherwise use 11Labs status
      let finalStatus = recipient.status;

      if (!finalStatus || finalStatus === 'pending') {
        // Map 11Labs status to our status values
        const elevenLabsStatus = callDetail.status;
        if (elevenLabsStatus === 'done' || elevenLabsStatus === 'completed') {
          finalStatus = 'completed';
        } else if (elevenLabsStatus === 'failed' || elevenLabsStatus === 'no_answer') {
          finalStatus = 'failed';
        } else if (elevenLabsStatus === 'in_progress' || elevenLabsStatus === 'calling') {
          finalStatus = 'in_progress';
        } else {
          finalStatus = 'pending';
        }
      }

      const conversationId = recipient.elevenLabsConversationId || callDetail.conversation_id || null;

      // Try to find callLogId from our database using conversationId
      let callLogId = recipient.callLogId || null;

      // If we have a callLogId, fetch duration and endReason from CallLog
      if (callLogId) {
        try {
          const callLog = await prisma.callLog.findUnique({
            where: { id: callLogId },
            select: { duration: true, endReason: true }
          });
          if (callLog) {
            convDuration = callLog.duration || null;
            terminationReason = callLog.endReason || null;
          }
        } catch (err) {
          console.error(`Failed to fetch CallLog ${callLogId}:`, err.message);
        }
      }

      // Fallback: Get duration and termination reason from callDetail (11Labs batch API)
      if (!convDuration) convDuration = callDetail.duration || null;
      if (!terminationReason) terminationReason = callDetail.termination_reason || null;

      // If not available in callDetail, try fetching from conversation API
      if (conversationId && (finalStatus === 'completed' || finalStatus === 'failed') && (!convDuration || !terminationReason)) {
        try {
          const apiKey = process.env.ELEVENLABS_API_KEY;
          const convResponse = await axios.get(
            `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
            { headers: { 'xi-api-key': apiKey } }
          );
          const convData = convResponse.data;
          if (!convDuration) convDuration = convData.metadata?.call_duration_secs || null;
          if (!terminationReason) terminationReason = convData.metadata?.termination_reason || null;
        } catch (err) {
          // Ignore 404s - conversation might not be available yet or was deleted
          if (err.response?.status !== 404) {
            console.error(`Failed to fetch conversation ${conversationId}:`, err.message);
          }
        }
      }

      if (!callLogId && conversationId) {
        // First check if CallLog exists
        let callLog = await prisma.callLog.findFirst({
          where: { callId: conversationId },
          select: { id: true }
        });

        // If no CallLog exists and call is completed, create one from 11Labs data
        if (!callLog && (finalStatus === 'completed' || finalStatus === 'failed')) {
          try {
            // Fetch conversation details from 11Labs
            const apiKey = process.env.ELEVENLABS_API_KEY;
            const convResponse = await axios.get(
              `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
              { headers: { 'xi-api-key': apiKey } }
            );
            const convData = convResponse.data;

            // Extract duration and termination reason
            convDuration = convData.metadata?.call_duration_secs || callDetail.duration || 0;
            terminationReason = convData.metadata?.termination_reason || null;

            // Create or update CallLog from 11Labs data (upsert to handle duplicates)
            callLog = await prisma.callLog.upsert({
              where: { callId: conversationId },
              update: {
                duration: convDuration,
                status: finalStatus,
                direction: 'outbound', // Batch calls are always outbound
                transcript: convData.transcript || null,
                transcriptText: Array.isArray(convData.transcript)
                  ? convData.transcript.map(t => `${t.role === 'agent' ? 'Asistan' : 'Müşteri'}: ${t.message || t.text || ''}`).join('\n')
                  : null,
                recordingUrl: `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio`,
                summary: convData.analysis?.transcript_summary || null,
                sentiment: convData.analysis?.user_sentiment || 'neutral'
              },
              create: {
                businessId: batchCall.businessId,
                callId: conversationId,
                callerId: recipient.phone_number,
                duration: convDuration,
                status: finalStatus,
                direction: 'outbound', // Batch calls are always outbound
                transcript: convData.transcript || null,
                transcriptText: Array.isArray(convData.transcript)
                  ? convData.transcript.map(t => `${t.role === 'agent' ? 'Asistan' : 'Müşteri'}: ${t.message || t.text || ''}`).join('\n')
                  : null,
                recordingUrl: `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio`,
                summary: convData.analysis?.transcript_summary || null,
                sentiment: convData.analysis?.user_sentiment || 'neutral'
              },
              select: { id: true }
            });
            console.log(`✅ Upserted CallLog for conversation ${conversationId}`);
          } catch (err) {
            console.error(`Failed to create CallLog for ${conversationId}:`, err.message);
          }
        }

        if (callLog) {
          callLogId = callLog.id;
        }
      }

      return {
        ...recipient,
        status: finalStatus,
        duration: convDuration || recipient.duration || callDetail.duration || null,
        terminationReason: terminationReason || recipient.terminationReason || callDetail.termination_reason || null,
        conversationId,
        callLogId
      };
    }));

    // Calculate stats from enriched recipients (most accurate)
    const calculatedStats = {
      completedCalls: enrichedRecipients.filter(r => r.status === 'completed' || r.status === 'failed').length,
      successfulCalls: enrichedRecipients.filter(r => r.status === 'completed').length,
      failedCalls: enrichedRecipients.filter(r => r.status === 'failed').length
    };

    res.json({
      batchCall: {
        ...batchCall,
        // Override with calculated stats from recipients
        completedCalls: calculatedStats.completedCalls,
        successfulCalls: calculatedStats.successfulCalls,
        failedCalls: calculatedStats.failedCalls,
        recipients: enrichedRecipients
      }
    });

  } catch (error) {
    console.error('Get batch call error:', error);
    res.status(500).json({ error: 'Failed to fetch batch call details' });
  }
});

/**
 * POST /api/batch-calls/:id/cancel
 * Cancel a batch call campaign
 */
router.post('/:id/cancel', checkPermission('campaigns:view'), async (req, res) => {
  try {
    const businessId = req.businessId;
    const { id } = req.params;

    const batchCall = await prisma.batchCall.findFirst({
      where: {
        id,
        businessId
      }
    });

    if (!batchCall) {
      return res.status(404).json({ error: 'Batch call not found' });
    }

    if (batchCall.status !== 'PENDING' && batchCall.status !== 'IN_PROGRESS') {
      return res.status(400).json({
        error: 'Can only cancel pending or in-progress campaigns',
        errorTR: 'Sadece bekleyen veya devam eden kampanyalar iptal edilebilir'
      });
    }

    // Cancel in 11Labs
    let elevenLabsCancelled = false;
    let elevenLabsError = null;

    if (batchCall.elevenLabsBatchId) {
      try {
        const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
        await axios.delete(
          `https://api.elevenlabs.io/v1/convai/batch-calling/${batchCall.elevenLabsBatchId}`,
          {
            headers: { 'xi-api-key': elevenLabsApiKey }
          }
        );
        console.log('✅ 11Labs batch call cancelled:', batchCall.elevenLabsBatchId);
        elevenLabsCancelled = true;
      } catch (error) {
        console.error('Failed to cancel in 11Labs:', error.response?.data || error.message);
        elevenLabsError = error.response?.data?.detail || error.message;
      }
    }

    // Update local status
    await prisma.batchCall.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });

    res.json({
      success: true,
      message: elevenLabsCancelled
        ? 'Kampanya iptal edildi. Sıradaki aramalar yapılmayacak.'
        : 'Kampanya yerel olarak iptal edildi.',
      warning: elevenLabsError
        ? `Arama servisi iptal hatası: ${elevenLabsError}. Devam eden aramalar tamamlanabilir.`
        : (batchCall.status === 'IN_PROGRESS' ? 'Not: Şu anda devam eden arama varsa, o arama tamamlanana kadar sürecektir.' : null)
    });

  } catch (error) {
    console.error('Cancel batch call error:', error);
    res.status(500).json({ error: 'Failed to cancel batch call' });
  }
});

export default router;
