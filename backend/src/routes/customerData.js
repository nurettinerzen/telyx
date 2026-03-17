import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissions.js';
import multer from 'multer';
import XLSX from 'xlsx';
import elevenLabsService from '../services/elevenlabs.js';
import { getActiveToolsForElevenLabs } from '../tools/index.js';
import { buildAssistantPrompt, getActiveTools as getPromptBuilderTools } from '../services/promptBuilder.js';
// V1 MVP: Global limit enforcement
import { checkCRMLimit } from '../services/globalLimits.js';
import { validateUntrustedUpload } from '../security/uploadSecurity.js';
import { auditSensitiveDataAccess } from '../middleware/sensitiveDataAudit.js';

const router = express.Router();
const prisma = new PrismaClient();

// ============================================================
// 11LABS LANGUAGE CODE MAPPING (copied from assistant.js)
// ============================================================
const ELEVENLABS_LANGUAGE_MAP = {
  'tr': 'tr',
  'en': 'en',
  'pr': 'pt-br',
  'pt': 'pt',
  'de': 'de',
  'es': 'es',
  'fr': 'fr'
};

function getElevenLabsLanguage(lang) {
  const normalized = lang?.toLowerCase() || 'tr';
  return ELEVENLABS_LANGUAGE_MAP[normalized] || normalized;
}

/**
 * Update all 11Labs agents for a business with latest tools
 * Called after customer data import to ensure agents have access to new data
 */
async function syncElevenLabsAgents(businessId) {
  try {
    // Get business with integrations
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: { integrations: { where: { isActive: true } } }
    });

    if (!business) {
      console.log('⚠️ Business not found for 11Labs sync');
      return;
    }

    // Get all active assistants for this business
    const assistants = await prisma.assistant.findMany({
      where: { businessId, isActive: true, elevenLabsAgentId: { not: null } }
    });

    if (assistants.length === 0) {
      console.log('ℹ️ No 11Labs agents to sync for business:', businessId);
      return;
    }

    console.log(`🔄 Syncing ${assistants.length} 11Labs agent(s) after customer data change...`);

    const lang = business.language?.toLowerCase() || 'tr';
    const elevenLabsLang = getElevenLabsLanguage(lang);

    // Update each assistant's 11Labs agent
    for (const assistant of assistants) {
      try {
        // Get active tools for this specific agent (with agentId in webhook URL)
        const activeToolsElevenLabs = getActiveToolsForElevenLabs(business, null, assistant.elevenLabsAgentId);
        console.log('📤 11Labs tools to sync for', assistant.name, ':', activeToolsElevenLabs.map(t => t.name));

        // NOTE: System tools removed - 11Labs handles end_call automatically
        const toolsWithSystemTools = [...activeToolsElevenLabs];

        // Get active tools list for prompt builder
        const activeToolsList = getPromptBuilderTools(business, business.integrations || []);

        // Build updated prompt
        const tempAssistant = {
          name: assistant.name,
          systemPrompt: assistant.systemPrompt,
          tone: assistant.tone || 'professional',
          customNotes: assistant.customNotes,
          callDirection: assistant.callDirection || 'outbound'
        };
        const fullSystemPrompt = buildAssistantPrompt(tempAssistant, business, activeToolsList);

        const agentUpdateConfig = {
          conversation_config: {
            agent: {
              prompt: {
                prompt: fullSystemPrompt,
                llm: 'gemini-2.5-flash',
                temperature: 0.1,
                tools: toolsWithSystemTools
              }
            }
          }
        };

        await elevenLabsService.updateAgent(assistant.elevenLabsAgentId, agentUpdateConfig);
        console.log(`✅ 11Labs agent synced: ${assistant.name} (${assistant.elevenLabsAgentId})`);
      } catch (err) {
        console.error(`❌ Failed to sync agent ${assistant.name}:`, err.message);
      }
    }

    console.log('🔄 11Labs agent sync completed');
  } catch (error) {
    console.error('❌ 11Labs agent sync error:', error);
  }
}

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
 * Normalize phone number for consistent matching
 * Removes all formatting, keeps only digits
 * Returns normalized format for comparison
 */
function normalizePhoneNumber(phone) {
  if (!phone) return null;

  // Remove all non-numeric characters except +
  let cleaned = String(phone).replace(/[^\d+]/g, '');

  // Remove leading + if exists
  cleaned = cleaned.replace(/^\+/, '');

  // Handle Turkish numbers
  if (cleaned.startsWith('90') && cleaned.length >= 12) {
    // Already has country code (905XXXXXXXXX)
    return cleaned;
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    // Turkish number with leading 0 (05XXXXXXXXX) -> 905XXXXXXXXX
    return '90' + cleaned.substring(1);
  } else if (cleaned.length === 10 && cleaned.startsWith('5')) {
    // Turkish mobile without prefix (5XXXXXXXXX) -> 905XXXXXXXXX
    return '90' + cleaned;
  }

  // Return as-is for other formats
  return cleaned || null;
}

/**
 * Parse CSV/Excel file and return rows
 * Uses UTF-8 encoding to preserve Turkish characters
 */
function parseFile(buffer, filename) {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    codepage: 65001,  // UTF-8 encoding for Turkish characters
    raw: false
  });

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const data = XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    raw: false
  });

  if (data.length === 0) {
    throw new Error('File is empty or has no data rows');
  }

  const columns = Object.keys(data[0]);

  return { data, columns };
}

/**
 * Parse monetary value (handles Turkish formatting)
 * Examples: "15.750,00", "15750.00", "15750", "15.750 TL"
 */
function parseMoneyValue(value) {
  if (!value) return null;

  let cleaned = String(value)
    .replace(/[TL₺\s]/gi, '')  // Remove currency symbols
    .trim();

  // Handle Turkish format (15.750,00) vs US format (15,750.00)
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // Determine format by position
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');

    if (lastComma > lastDot) {
      // Turkish format: 15.750,00 -> 15750.00
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // US format: 15,750.00 -> 15750.00
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    // Only comma: could be decimal separator (15,50) or thousand (15,750)
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      // Decimal separator: 15,50 -> 15.50
      cleaned = cleaned.replace(',', '.');
    } else {
      // Thousand separator: 15,750 -> 15750
      cleaned = cleaned.replace(/,/g, '');
    }
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse date value (handles multiple formats)
 * Examples: "15.01.2025", "15/01/2025", "2025-01-15"
 */
function parseDateValue(value) {
  if (!value) return null;

  const str = String(value).trim();

  // Try DD.MM.YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) return date;
  }

  // Try YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymdMatch) {
    const [, year, month, day] = ymdMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) return date;
  }

  // Try JS Date parsing as fallback
  const date = new Date(str);
  if (!isNaN(date.getTime())) return date;

  return null;
}

// ============================================================
// TEMPLATE DEFINITIONS (moved before routes for reference)
// ============================================================

/**
 * Collection (Tahsilat) template - for debt collection calls
 */
const COLLECTION_TEMPLATE = {
  sampleData: [
    {
      'İşletme/Müşteri Adı': 'ABC Ticaret Ltd. Şti.',
      'Yetkili': 'Ahmet Yılmaz',
      'Telefon': '5321234567',
      'Email': 'ahmet@abc.com',
      'VKN': '1234567890',
      'TC No': '',
      'SGK Borcu': '15750.00',
      'SGK Vadesi': '15.01.2025',
      'Vergi Borcu': '8320.00',
      'Vergi Vadesi': '26.01.2025',
      'Diğer Borç': '',
      'Diğer Borç Açıklama': '',
      'Beyanname Türü': 'KDV',
      'Beyanname Dönemi': '2024/12',
      'Beyanname Tarihi': '26.01.2025',
      'Beyanname Durumu': 'Bekliyor',
      'Notlar': 'Önemli müşteri',
      'Etiketler': 'VIP, Kurumsal'
    },
    {
      'İşletme/Müşteri Adı': 'XYZ İnşaat A.Ş.',
      'Yetkili': 'Mehmet Demir',
      'Telefon': '+905331234568',
      'Email': 'mehmet@xyz.com',
      'VKN': '9876543210',
      'TC No': '',
      'SGK Borcu': '25000.00',
      'SGK Vadesi': '20.01.2025',
      'Vergi Borcu': '12500.00',
      'Vergi Vadesi': '26.01.2025',
      'Diğer Borç': '5000.00',
      'Diğer Borç Açıklama': 'Danışmanlık ücreti',
      'Beyanname Türü': 'Muhtasar',
      'Beyanname Dönemi': '2024/12',
      'Beyanname Tarihi': '26.01.2025',
      'Beyanname Durumu': 'Verildi',
      'Notlar': '',
      'Etiketler': 'Kurumsal'
    }
  ],
  colWidths: [
    { wch: 25 }, // İşletme/Müşteri Adı
    { wch: 18 }, // Yetkili
    { wch: 15 }, // Telefon
    { wch: 22 }, // Email
    { wch: 12 }, // VKN
    { wch: 12 }, // TC No
    { wch: 12 }, // SGK Borcu
    { wch: 12 }, // SGK Vadesi
    { wch: 12 }, // Vergi Borcu
    { wch: 12 }, // Vergi Vadesi
    { wch: 12 }, // Diğer Borç
    { wch: 20 }, // Diğer Borç Açıklama
    { wch: 15 }, // Beyanname Türü
    { wch: 15 }, // Beyanname Dönemi
    { wch: 15 }, // Beyanname Tarihi
    { wch: 15 }, // Beyanname Durumu
    { wch: 25 }, // Notlar
    { wch: 20 }, // Etiketler
  ],
  sheetName: 'Müşteri Verileri',
  fileName: 'tahsilat-sablon.xlsx'
};

/**
 * Sales (Satış) template - for outbound sales calls
 * Simpler structure: phone (required), name, custom data for personalization
 * Product/service info comes from Knowledge Base, not CSV
 */
const SALES_TEMPLATE = {
  sampleData: [
    {
      'Telefon': '5321234567',
      'İsim Soyisim': 'Ahmet Yılmaz',
      'Şirket': 'ABC Teknoloji',
      'İlgi Alanı': 'Mobil uygulama',
      'Önceki Ürün/Hizmet': 'Web sitesi yaptırdı',
      'Son İletişim': '15.12.2024',
      'Öncelik': 'Yüksek',
      'Notlar': 'Demo talep etmişti, geri dönüş yapılacak',
      'Etiketler': 'Sıcak Lead, Teknoloji'
    },
    {
      'Telefon': '+905331234568',
      'İsim Soyisim': 'Ayşe Kaya',
      'Şirket': 'XYZ Danışmanlık',
      'İlgi Alanı': 'CRM yazılımı',
      'Önceki Ürün/Hizmet': '',
      'Son İletişim': '20.12.2024',
      'Öncelik': 'Normal',
      'Notlar': 'Fiyat teklifi istedi',
      'Etiketler': 'Yeni Lead'
    },
    {
      'Telefon': '5441234569',
      'İsim Soyisim': 'Mehmet Demir',
      'Şirket': '',
      'İlgi Alanı': 'E-ticaret paketi',
      'Önceki Ürün/Hizmet': 'Mevcut müşteri - hosting',
      'Son İletişim': '10.01.2025',
      'Öncelik': 'Düşük',
      'Notlar': 'Mevcut müşteri, cross-sell fırsatı',
      'Etiketler': 'Mevcut Müşteri, Upsell'
    }
  ],
  colWidths: [
    { wch: 15 }, // Telefon
    { wch: 20 }, // İsim Soyisim
    { wch: 20 }, // Şirket
    { wch: 20 }, // İlgi Alanı
    { wch: 25 }, // Önceki Ürün/Hizmet
    { wch: 15 }, // Son İletişim
    { wch: 12 }, // Öncelik
    { wch: 35 }, // Notlar
    { wch: 25 }, // Etiketler
  ],
  sheetName: 'Satış Listesi',
  fileName: 'satis-sablon.xlsx'
};

/**
 * Support (Arıza Takip) template
 */
const SUPPORT_TEMPLATE = {
  sampleData: [
    {
      'Telefon': '5321234567',
      'Müşteri Adı': 'Ahmet Yılmaz',
      'Arıza Türü': 'Kombi arızası',
      'Adres': 'Kadıköy, İstanbul',
      'Tarih': '15.01.2025',
      'Durum': 'Bekliyor',
      'Öncelik': 'Yüksek',
      'Notlar': 'Acil müdahale gerekiyor'
    },
    {
      'Telefon': '5331234568',
      'Müşteri Adı': 'Ayşe Kaya',
      'Arıza Türü': 'Klima bakımı',
      'Adres': 'Beşiktaş, İstanbul',
      'Tarih': '16.01.2025',
      'Durum': 'Randevu alındı',
      'Öncelik': 'Normal',
      'Notlar': ''
    }
  ],
  colWidths: [
    { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 30 },
    { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 30 }
  ],
  sheetName: 'Arıza Kayıtları',
  fileName: 'ariza-takip-sablon.xlsx'
};

/**
 * Appointment (Randevu) template
 */
const APPOINTMENT_TEMPLATE = {
  sampleData: [
    {
      'Telefon': '5321234567',
      'Müşteri Adı': 'Ahmet Yılmaz',
      'Randevu Tarihi': '15.01.2025',
      'Randevu Saati': '14:00',
      'Hizmet': 'Saç kesimi',
      'Durum': 'Onaylı',
      'Notlar': 'VIP müşteri'
    },
    {
      'Telefon': '5331234568',
      'Müşteri Adı': 'Ayşe Kaya',
      'Randevu Tarihi': '16.01.2025',
      'Randevu Saati': '10:30',
      'Hizmet': 'Cilt bakımı',
      'Durum': 'Bekliyor',
      'Notlar': ''
    }
  ],
  colWidths: [
    { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 12 },
    { wch: 20 }, { wch: 12 }, { wch: 30 }
  ],
  sheetName: 'Randevular',
  fileName: 'randevu-sablon.xlsx'
};

/**
 * Order (Sipariş) template
 */
const ORDER_TEMPLATE = {
  sampleData: [
    {
      'Telefon': '5321234567',
      'Müşteri Adı': 'Ahmet Yılmaz',
      'Sipariş No': 'SIP-001',
      'Ürün': 'Laptop',
      'Tutar': '25000',
      'Sipariş Tarihi': '10.01.2025',
      'Kargo Durumu': 'Yolda',
      'Kargo Takip No': 'TR123456789',
      'Notlar': ''
    },
    {
      'Telefon': '5331234568',
      'Müşteri Adı': 'Ayşe Kaya',
      'Sipariş No': 'SIP-002',
      'Ürün': 'Telefon Kılıfı',
      'Tutar': '150',
      'Sipariş Tarihi': '12.01.2025',
      'Kargo Durumu': 'Hazırlanıyor',
      'Kargo Takip No': '',
      'Notlar': 'Hediye paketi istedi'
    }
  ],
  colWidths: [
    { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 25 },
    { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 30 }
  ],
  sheetName: 'Siparişler',
  fileName: 'siparis-sablon.xlsx'
};

/**
 * Custom (Diğer) template - basic structure
 */
const CUSTOM_TEMPLATE = {
  sampleData: [
    {
      'Telefon': '5321234567',
      'Müşteri Adı': 'Ahmet Yılmaz',
      'Alan 1': 'Değer 1',
      'Alan 2': 'Değer 2',
      'Alan 3': 'Değer 3',
      'Notlar': 'Örnek not'
    },
    {
      'Telefon': '5331234568',
      'Müşteri Adı': 'Ayşe Kaya',
      'Alan 1': 'Değer A',
      'Alan 2': 'Değer B',
      'Alan 3': 'Değer C',
      'Notlar': ''
    }
  ],
  colWidths: [
    { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 15 },
    { wch: 15 }, { wch: 30 }
  ],
  sheetName: 'Müşteri Verileri',
  fileName: 'musteri-verileri-sablon.xlsx'
};

// ============================================================
// AUTHENTICATED ROUTES - ALL ROUTES BELOW REQUIRE AUTH
// ============================================================

router.use(authenticateToken);

/**
 * GET /api/customer-data/template/:type?
 * Download Excel template for customer data import
 * @param type - 'accounting', 'support', 'appointment', 'order', 'custom'
 */
router.get('/template/:type?', async (req, res) => {
  try {
    const templateType = req.params.type || req.query.type || 'accounting';

    // Select template based on type
    let template;
    switch (templateType) {
      case 'accounting':
        template = COLLECTION_TEMPLATE;
        break;
      case 'support':
        template = SUPPORT_TEMPLATE;
        break;
      case 'appointment':
        template = APPOINTMENT_TEMPLATE;
        break;
      case 'order':
        template = ORDER_TEMPLATE;
        break;
      case 'custom':
        template = CUSTOM_TEMPLATE;
        break;
      case 'sales':
        template = SALES_TEMPLATE;
        break;
      default:
        template = CUSTOM_TEMPLATE;
        break;
    }

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(template.sampleData);

    // Set column widths
    worksheet['!cols'] = template.colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, template.sheetName);

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${template.fileName}`);
    res.send(buffer);

  } catch (error) {
    console.error('Template download error:', error);
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

/**
 * POST /api/customer-data/parse
 * Upload and parse file, return columns and preview data
 */
router.post('/parse', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    await validateUntrustedUpload({
      fileBuffer: req.file.buffer,
      fileName: req.file.originalname,
      maxSizeBytes: 5 * 1024 * 1024,
    });

    const { data, columns } = parseFile(req.file.buffer, req.file.originalname);

    // Return first 5 rows as preview
    const preview = data.slice(0, 5);

    res.json({
      success: true,
      columns,
      preview,
      totalRows: data.length
    });
  } catch (error) {
    console.error('Parse file error:', error);
    res.status(400).json({
      error: error.message || 'Failed to parse file'
    });
  }
});

/**
 * POST /api/customer-data/import
 * V1 MVP: Atomic import with global limit check
 * - Checks limit BEFORE creating any records
 * - Import is rejected entirely if would exceed limit (no partial import)
 */
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    const businessId = req.businessId;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    await validateUntrustedUpload({
      fileBuffer: req.file.buffer,
      fileName: req.file.originalname,
      maxSizeBytes: 5 * 1024 * 1024,
    });

    const { columnMapping, dataType = 'custom' } = req.body;

    // Parse file
    const { data, columns } = parseFile(req.file.buffer, req.file.originalname);

    // V1 MVP: Check CRM limit BEFORE processing
    // All records will be attempted to create, so check total count
    const limitCheck = await checkCRMLimit(businessId, data.length);
    if (!limitCheck.allowed) {
      return res.status(403).json({
        error: limitCheck.error.code,
        message: limitCheck.error.message,
        currentRecords: limitCheck.current,
        requestedRecords: data.length,
        limit: limitCheck.limit,
        allowedToAdd: Math.max(0, limitCheck.limit - limitCheck.current)
      });
    }

    // Create CustomerDataFile record
    const customerDataFile = await prisma.customerDataFile.create({
      data: {
        businessId,
        fileName: req.file.originalname,
        dataType,
        recordCount: data.length,
        columns: columns.map(name => ({ name, key: name })),
        status: 'PROCESSING'
      }
    });

    // Parse column mapping
    let mapping = {};
    try {
      mapping = typeof columnMapping === 'string' ? JSON.parse(columnMapping) : columnMapping || {};
    } catch (e) {
      console.error('Column mapping parse error:', e);
    }

    // Default column mappings (Turkish headers) - expanded for flexibility
    const defaultMapping = {
      companyName: ['İşletme/Müşteri Adı', 'Müşteri Adı', 'İşletme Adı', 'Firma', 'Company', 'companyName', 'Firma Adı', 'Şirket', 'Şirket Adı', 'İsim', 'Ad', 'Ad Soyad', 'Müşteri', 'Customer', 'Name', 'İsim Soyisim'],
      contactName: ['Yetkili', 'Yetkili Kişi', 'Contact', 'contactName', 'İletişim Kişisi', 'Sorumlu', 'Contact Person'],
      phone: ['Telefon', 'Tel', 'Phone', 'phone', 'Telefon No', 'Telefon Numarası', 'GSM', 'Cep', 'Cep Telefon', 'Cep Tel', 'Mobil', 'Mobile', 'Müşteri Telefon', 'İletişim', 'Tel No', 'Numara', 'No'],
      email: ['Email', 'E-mail', 'E-posta', 'email', 'Eposta', 'Mail', 'E-Mail'],
      vkn: ['VKN', 'Vergi Kimlik No', 'vkn', 'Vergi No', 'Vergi Numarası'],
      tcNo: ['TC No', 'TC Kimlik No', 'TC', 'tcNo', 'TCKN', 'TC Kimlik', 'Kimlik No'],
      // P0.2b: Order number normalization
      orderNo: ['Sipariş No', 'Sipariş Numarası', 'Siparis No', 'SİPARİŞ NO', 'Order No', 'Order Number', 'orderNumber', 'orderNo', 'Order ID', 'Sipariş', 'Sipariş ID'],
      sgkDebt: ['SGK Borcu', 'SGK', 'sgkDebt', 'SGK Borç'],
      sgkDueDate: ['SGK Vadesi', 'SGK Vade', 'sgkDueDate', 'SGK Son Ödeme'],
      taxDebt: ['Vergi Borcu', 'Vergi', 'taxDebt', 'Vergi Borç'],
      taxDueDate: ['Vergi Vadesi', 'Vergi Vade', 'taxDueDate', 'Vergi Son Ödeme'],
      otherDebt: ['Diğer Borç', 'Diğer', 'otherDebt', 'Diğer Borcu'],
      otherDebtNote: ['Diğer Borç Açıklama', 'otherDebtNote', 'Diğer Açıklama'],
      declarationType: ['Beyanname Türü', 'declarationType', 'Beyanname'],
      declarationPeriod: ['Beyanname Dönemi', 'declarationPeriod', 'Dönem'],
      declarationDueDate: ['Beyanname Tarihi', 'Beyanname Son Tarih', 'declarationDueDate'],
      declarationStatus: ['Beyanname Durumu', 'declarationStatus'],
      notes: ['Notlar', 'Not', 'Notes', 'notes', 'Açıklama', 'Notları'],
      tags: ['Etiketler', 'Tags', 'tags', 'Kategoriler']
    };

    // Helper to find column value
    const findValue = (row, fieldName) => {
      // First check explicit mapping
      if (mapping[fieldName]) {
        return row[mapping[fieldName]] || null;
      }

      // Then try default mappings
      const possibleNames = defaultMapping[fieldName] || [];
      for (const name of possibleNames) {
        if (row[name] !== undefined && row[name] !== '') {
          return row[name];
        }
      }

      return null;
    };

    const results = {
      success: 0,
      updated: 0,
      failed: 0,
      errors: []
    };

    // Process each row
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2; // +2 for 1-indexed + header row

      try {
        // Get fields - phone is required, companyName is optional (will use phone if not provided)
        let companyName = findValue(row, 'companyName');
        const rawPhone = findValue(row, 'phone');

        if (!rawPhone) {
          results.failed++;
          results.errors.push({ row: rowNum, error: 'Telefon numarası zorunludur' });
          continue;
        }

        // If no company name, use phone number as the name
        if (!companyName) {
          companyName = rawPhone;
        }

        const normalizedPhone = normalizePhoneNumber(rawPhone);
        if (!normalizedPhone) {
          results.failed++;
          results.errors.push({ row: rowNum, error: `Geçersiz telefon numarası: ${rawPhone}` });
          continue;
        }

        // Build custom fields JSON
        const customFields = {};

        // Financial data
        const sgkDebt = parseMoneyValue(findValue(row, 'sgkDebt'));
        if (sgkDebt !== null) customFields.sgkDebt = sgkDebt;

        const sgkDueDate = parseDateValue(findValue(row, 'sgkDueDate'));
        if (sgkDueDate) customFields.sgkDueDate = sgkDueDate.toISOString();

        const taxDebt = parseMoneyValue(findValue(row, 'taxDebt'));
        if (taxDebt !== null) customFields.taxDebt = taxDebt;

        const taxDueDate = parseDateValue(findValue(row, 'taxDueDate'));
        if (taxDueDate) customFields.taxDueDate = taxDueDate.toISOString();

        const otherDebt = parseMoneyValue(findValue(row, 'otherDebt'));
        if (otherDebt !== null) customFields.otherDebt = otherDebt;

        const otherDebtNote = findValue(row, 'otherDebtNote');
        if (otherDebtNote) customFields.otherDebtNote = otherDebtNote;

        // Declaration data
        const declarationType = findValue(row, 'declarationType');
        if (declarationType) customFields.declarationType = declarationType;

        const declarationPeriod = findValue(row, 'declarationPeriod');
        if (declarationPeriod) customFields.declarationPeriod = declarationPeriod;

        const declarationDueDate = parseDateValue(findValue(row, 'declarationDueDate'));
        if (declarationDueDate) customFields.declarationDueDate = declarationDueDate.toISOString();

        const declarationStatus = findValue(row, 'declarationStatus');
        if (declarationStatus) customFields.declarationStatus = declarationStatus;

        // Add ALL columns to customFields so they appear in the UI
        // This ensures all Excel data is preserved regardless of column names
        for (const [colName, colValue] of Object.entries(row)) {
          if (colValue !== undefined && colValue !== null && colValue !== '') {
            // Store all values in customFields for display
            customFields[colName] = colValue;
          }
        }

        // Parse tags
        const tagsRaw = findValue(row, 'tags');
        let tags = [];
        if (tagsRaw) {
          tags = String(tagsRaw).split(/[,;]/).map(t => t.trim()).filter(t => t);
        }

        // Extract and normalize orderNo (P0.2b)
        const orderNoRaw = findValue(row, 'orderNo');
        const orderNo = orderNoRaw ? String(orderNoRaw).toUpperCase().trim() : null;

        // Build customer data object
        const customerDataObj = {
          companyName: String(companyName).trim(),
          phone: normalizedPhone,
          contactName: findValue(row, 'contactName') || null,
          email: findValue(row, 'email') || null,
          vkn: findValue(row, 'vkn') || null,
          tcNo: findValue(row, 'tcNo') || null,
          orderNo, // P0.2b: Normalized order number
          notes: findValue(row, 'notes') || null,
          tags,
          customFields: Object.keys(customFields).length > 0 ? customFields : null
        };

        // Import always creates new records (same customer can have multiple records)
        await prisma.customerData.create({
          data: {
            businessId,
            fileId: customerDataFile.id, // Link to file
            ...customerDataObj
          }
        });
        results.success++;

      } catch (error) {
        console.error(`Error processing row ${rowNum}:`, error);
        results.failed++;
        results.errors.push({ row: rowNum, error: error.message });
      }
    }

    // Update file status based on results
    const actualRecordCount = results.success + results.updated;
    const fileStatus = results.failed === data.length ? 'FAILED' : 'ACTIVE';

    await prisma.customerDataFile.update({
      where: { id: customerDataFile.id },
      data: {
        status: fileStatus,
        recordCount: actualRecordCount
      }
    });

    // P0.3b: Increment CRM version for cache invalidation
    await prisma.business.update({
      where: { id: businessId },
      data: { crmVersion: { increment: 1 } }
    });

    // Sync 11Labs agents with new tools (async, don't wait)
    syncElevenLabsAgents(businessId).catch(err => {
      console.error('Background 11Labs sync error:', err);
    });

    res.json({
      success: true,
      message: `Import completed: ${results.success} created, ${results.updated} updated, ${results.failed} failed`,
      results,
      fileId: customerDataFile.id
    });

  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({
      error: error.message || 'Failed to import customer data'
    });
  }
});

// ============================================================
// FILE MANAGEMENT ROUTES
// ============================================================

/**
 * GET /api/customer-data/files
 * List all imported files for the business
 */
router.get('/files', auditSensitiveDataAccess('customer_data_file_list'), async (req, res) => {
  try {
    const businessId = req.businessId;

    const files = await prisma.customerDataFile.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { records: true }
        }
      }
    });

    res.json({ files });

  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

/**
 * GET /api/customer-data/files/:id
 * Get a single file with its records
 */
router.get('/files/:id', auditSensitiveDataAccess('customer_data_file', (req) => req.params.id), async (req, res) => {
  try {
    const businessId = req.businessId;
    const { id } = req.params;
    const { page = 1, limit = 50, search } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Get file info
    const file = await prisma.customerDataFile.findFirst({
      where: { id, businessId }
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Build where clause for records
    const where = { businessId, fileId: id };

    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Get records for this file
    const [records, total] = await Promise.all([
      prisma.customerData.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'asc' }
      }),
      prisma.customerData.count({ where })
    ]);

    res.json({
      file,
      records,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / take)
      }
    });

  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ error: 'Failed to fetch file' });
  }
});

/**
 * DELETE /api/customer-data/files/:id
 * Delete a file and all its associated records
 */
router.delete('/files/:id', async (req, res) => {
  try {
    const businessId = req.businessId;
    const { id } = req.params;

    // Check if file exists
    const file = await prisma.customerDataFile.findFirst({
      where: { id, businessId }
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete file (cascade will delete associated records due to onDelete: Cascade)
    await prisma.customerDataFile.delete({
      where: { id }
    });

    // Sync 11Labs agents (async, don't wait)
    syncElevenLabsAgents(businessId).catch(err => {
      console.error('Background 11Labs sync error:', err);
    });

    res.json({
      success: true,
      message: 'File and associated records deleted'
    });

  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

/**
 * GET /api/customer-data
 * List all customer data for the business with pagination
 */
router.get('/', auditSensitiveDataAccess('customer_data_records'), async (req, res) => {
  try {
    const businessId = req.businessId;
    const { page = 1, limit = 50, search, tag } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Build where clause
    const where = { businessId };

    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
        { vkn: { contains: search } }
      ];
    }

    if (tag) {
      where.tags = { has: tag };
    }

    const [customerData, total] = await Promise.all([
      prisma.customerData.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' }
      }),
      prisma.customerData.count({ where })
    ]);

    res.json({
      customerData,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / take)
      }
    });

  } catch (error) {
    console.error('List customer data error:', error);
    res.status(500).json({ error: 'Failed to fetch customer data' });
  }
});

/**
 * GET /api/customer-data/lookup
 * Lookup customer by phone number (for AI assistant)
 */
router.get('/lookup', auditSensitiveDataAccess('customer_data_lookup', (req) => req.query.phone || null), async (req, res) => {
  try {
    const businessId = req.businessId;
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const normalizedPhone = normalizePhoneNumber(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Aynı telefonla birden fazla kayıt olabilir - tümünü dön
    const customers = await prisma.customerData.findMany({
      where: {
        businessId,
        phone: normalizedPhone
      },
      orderBy: { createdAt: 'desc' }
    });

    if (customers.length === 0) {
      return res.status(404).json({
        error: 'Customer not found',
        errorTR: 'Müşteri bulunamadı'
      });
    }

    // Geriye dönük uyumluluk için tek kayıt varsa customer, çoksa customers dön
    if (customers.length === 1) {
      res.json({ customer: customers[0] });
    } else {
      res.json({ customer: customers[0], customers });
    }

  } catch (error) {
    console.error('Lookup error:', error);
    res.status(500).json({ error: 'Failed to lookup customer' });
  }
});

/**
 * GET /api/customer-data/by-email
 * Lookup customer by email address + order stats from CrmOrder
 * Used by email panel sidebar to show customer context
 */
router.get('/by-email', async (req, res) => {
  try {
    const businessId = req.businessId;
    const { email } = req.query;

    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const trimmedEmail = email.trim();

    // 1. CustomerData lookup by email (case-insensitive)
    const customers = await prisma.customerData.findMany({
      where: {
        businessId,
        email: { equals: trimmedEmail, mode: 'insensitive' }
      },
      select: {
        id: true,
        companyName: true,
        contactName: true,
        phone: true,
        email: true,
        tags: true,
        notes: true,
        customFields: true,
        orderNo: true,
        createdAt: true,
        // NOT selecting: vkn, tcNo (sensitive)
      },
      orderBy: { createdAt: 'desc' }
    });

    // 2. CrmOrder by email (all for stats, last 5 for display)
    const orders = await prisma.crmOrder.findMany({
      where: {
        businessId,
        customerEmail: { equals: trimmedEmail, mode: 'insensitive' }
      },
      select: {
        id: true,
        orderNumber: true,
        customerPhone: true,
        status: true,
        totalAmount: true,
        items: true,
        trackingNumber: true,
        carrier: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    const orderStats = {
      orderCount: orders.length,
      totalSpent: orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0),
      lastOrderDate: orders.length > 0 ? orders[0].createdAt : null,
    };

    // 3. CrmTicket by phone (if we have customer's phone from CustomerData or CrmOrder)
    const customerPhone = customers[0]?.phone || orders[0]?.customerPhone || null;
    let tickets = [];
    if (customerPhone) {
      tickets = await prisma.crmTicket.findMany({
        where: { businessId, customerPhone },
        select: {
          id: true,
          ticketNumber: true,
          product: true,
          issue: true,
          status: true,
          cost: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }).catch(() => []);
    }

    res.json({
      customer: customers.length > 0 ? customers[0] : null,
      customers,
      orderStats,
      recentOrders: orders.slice(0, 5),
      tickets,
    });

  } catch (error) {
    console.error('By-email lookup error:', error);
    res.status(500).json({ error: 'Failed to lookup customer by email' });
  }
});

/**
 * GET /api/customer-data/debug
 * Debug endpoint to see raw customFields data
 * Helps identify field name mismatches
 * NOTE: Must be before /:id route to avoid being caught by it
 */
router.get('/debug', async (req, res) => {
  try {
    const businessId = req.businessId;
    const { limit = 5 } = req.query;

    const customers = await prisma.customerData.findMany({
      where: { businessId },
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' }
    });

    const debug = customers.map(c => ({
      id: c.id,
      companyName: c.companyName,
      phone: c.phone,
      customFieldKeys: c.customFields ? Object.keys(c.customFields) : [],
      customFields: c.customFields
    }));

    res.json({
      total: customers.length,
      customers: debug
    });

  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: 'Failed to get debug data' });
  }
});

/**
 * GET /api/customer-data/:id
 * Get a single customer data record
 */
router.get('/:id', auditSensitiveDataAccess('customer_data_record', (req) => req.params.id), async (req, res) => {
  try {
    const businessId = req.businessId;
    const { id } = req.params;

    const customer = await prisma.customerData.findFirst({
      where: { id, businessId }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({ customer });

  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

/**
 * POST /api/customer-data
 * Create a new customer data record
 * Supports fileId to link record to a specific file (for manual add within file view)
 */
router.post('/', async (req, res) => {
  try {
    const businessId = req.businessId;
    const { companyName, phone, contactName, email, vkn, tcNo, notes, tags, customFields, fileId } = req.body;

    if (!companyName || !phone) {
      return res.status(400).json({
        error: 'Company name and phone are required',
        errorTR: 'İşletme adı ve telefon zorunludur'
      });
    }

    const normalizedPhone = normalizePhoneNumber(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Aynı müşterinin birden fazla kaydı olabilir (farklı siparişler, borçlar vb.)
    // Unique kontrol kaldırıldı

    // If fileId provided, verify it belongs to this business
    if (fileId) {
      const file = await prisma.customerDataFile.findFirst({
        where: { id: fileId, businessId }
      });
      if (!file) {
        return res.status(400).json({
          error: 'Invalid file ID',
          errorTR: 'Geçersiz dosya ID'
        });
      }
    }

    const customer = await prisma.customerData.create({
      data: {
        businessId,
        fileId: fileId || null,
        companyName,
        phone: normalizedPhone,
        contactName,
        email,
        vkn,
        tcNo,
        notes,
        tags: tags || [],
        customFields: customFields || null
      }
    });

    // Update file record count if linked to a file
    if (fileId) {
      await prisma.customerDataFile.update({
        where: { id: fileId },
        data: { recordCount: { increment: 1 } }
      });
    }

    // Sync 11Labs agents (async, don't wait)
    syncElevenLabsAgents(businessId).catch(err => {
      console.error('Background 11Labs sync error:', err);
    });

    res.status(201).json({ customer });

  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

/**
 * PUT /api/customer-data/:id
 * Update a customer data record
 */
router.put('/:id', async (req, res) => {
  try {
    const businessId = req.businessId;
    const { id } = req.params;
    const { companyName, phone, contactName, email, vkn, tcNo, notes, tags, customFields } = req.body;

    // Check if customer exists
    const existing = await prisma.customerData.findFirst({
      where: { id, businessId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // If phone is being changed, normalize it
    let normalizedPhone = existing.phone;
    if (phone && phone !== existing.phone) {
      normalizedPhone = normalizePhoneNumber(phone);
      if (!normalizedPhone) {
        return res.status(400).json({ error: 'Invalid phone number format' });
      }
      // Aynı müşterinin birden fazla kaydı olabilir - duplicate kontrolü kaldırıldı
    }

    const customer = await prisma.customerData.update({
      where: {
        id,
        businessId // Tenant isolation - defense in depth
      },
      data: {
        companyName: companyName || existing.companyName,
        phone: normalizedPhone,
        contactName: contactName !== undefined ? contactName : existing.contactName,
        email: email !== undefined ? email : existing.email,
        vkn: vkn !== undefined ? vkn : existing.vkn,
        tcNo: tcNo !== undefined ? tcNo : existing.tcNo,
        notes: notes !== undefined ? notes : existing.notes,
        tags: tags !== undefined ? tags : existing.tags,
        customFields: customFields !== undefined ? customFields : existing.customFields
      }
    });

    res.json({ customer });

  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

/**
 * DELETE /api/customer-data/bulk
 * Delete multiple customer data records
 * NOTE: This route MUST be before /:id to avoid "bulk" being matched as an ID
 */
router.delete('/bulk', async (req, res) => {
  try {
    const businessId = req.businessId;
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No IDs provided' });
    }

    const result = await prisma.customerData.deleteMany({
      where: {
        id: { in: ids },
        businessId
      }
    });

    res.json({
      success: true,
      message: `${result.count} customers deleted`,
      deletedCount: result.count
    });

  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({ error: 'Failed to delete customers' });
  }
});

/**
 * DELETE /api/customer-data/:id
 * Delete a customer data record
 */
router.delete('/:id', async (req, res) => {
  try {
    const businessId = req.businessId;
    const { id } = req.params;

    const existing = await prisma.customerData.findFirst({
      where: { id, businessId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    await prisma.customerData.delete({
      where: {
        id,
        businessId // Tenant isolation - defense in depth
      }
    });

    res.json({ success: true, message: 'Customer deleted' });

  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

/**
 * GET /api/customer-data/tags
 * Get all unique tags used by this business
 */
router.get('/tags/list', async (req, res) => {
  try {
    const businessId = req.businessId;

    const customers = await prisma.customerData.findMany({
      where: { businessId },
      select: { tags: true }
    });

    // Extract unique tags
    const tagSet = new Set();
    customers.forEach(c => {
      if (c.tags && Array.isArray(c.tags)) {
        c.tags.forEach(tag => tagSet.add(tag));
      }
    });

    res.json({ tags: Array.from(tagSet).sort() });

  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

/**
 * POST /api/customer-data/sync-agents
 * Manually trigger 11Labs agent sync for this business
 * Use this to update existing agents with customer_data_lookup tool
 */
router.post('/sync-agents', async (req, res) => {
  try {
    const businessId = req.businessId;

    console.log('🔄 Manual 11Labs agent sync requested for business:', businessId);

    await syncElevenLabsAgents(businessId);

    res.json({
      success: true,
      message: '11Labs agents synced successfully'
    });

  } catch (error) {
    console.error('Sync agents error:', error);
    res.status(500).json({ error: 'Failed to sync agents' });
  }
});

export default router;

// Export sync function for use in other routes
export { syncElevenLabsAgents };
