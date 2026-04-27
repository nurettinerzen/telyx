import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import { isAdmin, requireAdminMfa } from '../middleware/adminAuth.js';
import { createLead, getLeadByResponseToken, getLeadConstants, handleLeadCtaResponse } from '../services/leadService.js';
import {
  createLeadPreviewSession,
  finishLeadPreviewSession,
  registerLeadPreviewConversation,
  LEAD_PREVIEW_MAX_DURATION_SECONDS,
  LeadPreviewError
} from '../services/leadPreviewService.js';
import { buildSiteUrl } from '../config/runtime.js';

const router = express.Router();
const {
  LEAD_SOURCE,
  LEAD_STATUS,
  LEAD_TEMPERATURE,
} = getLeadConstants();
import { randomUUID } from 'crypto';
import { getPublicContactProfile } from '../services/businessPhoneRouting.js';

function parseFieldData(fieldData = []) {
  const result = {};
  if (!Array.isArray(fieldData)) return result;

  for (const item of fieldData) {
    const key = normalizeLeadFieldKey(item?.name);
    if (!key) continue;
    const values = Array.isArray(item?.values) ? item.values : [];
    result[key] = values.length <= 1 ? (values[0] ?? null) : values;
  }

  return result;
}

function normalizeLeadFieldKey(value = '') {
  const normalized = String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

  return normalized || null;
}

function normalizeLeadFieldBag(fields = {}) {
  const result = {};
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return result;

  for (const [rawKey, value] of Object.entries(fields)) {
    const key = normalizeLeadFieldKey(rawKey);
    if (!key || result[key] !== undefined) continue;
    result[key] = value;
  }

  return result;
}

function pickFirst(fields, keys = []) {
  for (const key of keys) {
    const normalizedKey = normalizeLeadFieldKey(key);
    if (!normalizedKey) continue;
    if (fields[normalizedKey] !== undefined && fields[normalizedKey] !== null && String(fields[normalizedKey]).trim() !== '') {
      return fields[normalizedKey];
    }
  }
  return null;
}

function parseLeadDateValue(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function ensureLeadIngestAuthorized(req) {
  const configuredSecret = String(process.env.LEAD_INGEST_SECRET || '').trim();
  if (!configuredSecret) {
    return process.env.NODE_ENV !== 'production';
  }

  const providedSecret = String(req.headers['x-lead-ingest-secret'] || '').trim();
  return configuredSecret.length > 0 && providedSecret === configuredSecret;
}

const TEST_LEAD_EMAILS = [
  'nurettinerzen@gmail.com',
  'nurettinerzen@hotmail.com',
  'nurettinerzen+leadtest@gmail.com',
  'nurettinerzen+callbacktest@gmail.com',
];

const TEST_LEAD_FORM_NAMES = [
  'Manual Prod Test',
  'Manual Email Test',
  'CLI Test',
  'CLI Preview Test',
  'CLI Manual Test',
  'manual_callback_test',
  'manual_smoke_test',
];

const TEST_LEAD_CAMPAIGN_NAMES = [
  'Manual Prod Test',
  'Manual Email Test',
  'Manual Preview Test',
  'Manual Live Test',
];

async function findTestLeadIds() {
  const leads = await prisma.lead.findMany({
    where: {
      OR: [
        {
          source: LEAD_SOURCE.MANUAL,
          email: { in: TEST_LEAD_EMAILS }
        },
        {
          email: { in: TEST_LEAD_EMAILS },
          formName: { in: TEST_LEAD_FORM_NAMES }
        },
        {
          email: { in: TEST_LEAD_EMAILS },
          campaignName: { in: TEST_LEAD_CAMPAIGN_NAMES }
        },
        {
          email: { in: TEST_LEAD_EMAILS },
          externalSourceId: { startsWith: 'manual-prod-' }
        },
        {
          email: { in: TEST_LEAD_EMAILS },
          externalSourceId: { startsWith: 'manual-live-test-' }
        }
      ]
    },
    select: {
      id: true,
      email: true,
      name: true,
      source: true,
      formName: true,
      campaignName: true,
      externalSourceId: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' }
  });

  return leads;
}

function buildResponseHtml({
  title,
  message,
  accent = '#006FEB',
}) {
  const logoUrl = buildSiteUrl('/assets/telyx-logo-email-horizontal.png');
  return `
    <!DOCTYPE html>
    <html lang="tr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${title}</title>
      </head>
      <body style="margin:0;padding:0;background:#eef3f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#051752;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f9;padding:32px 16px;">
          <tr>
            <td align="center">
              <table width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 12px 40px rgba(8,18,36,0.08);">
                <tr>
                  <td style="background:linear-gradient(90deg,#00c3e6 0%,#245ce5 100%);height:6px;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding:34px 36px 0 36px;">
                    <img src="${logoUrl}" alt="Telyx" height="42" style="display:block;height:42px;width:auto;border:0;outline:none;text-decoration:none;">
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px 36px 0 36px;">
                    <h1 style="margin:0 0 14px 0;font-size:34px;font-weight:800;line-height:1.16;letter-spacing:-0.03em;color:#051752;">${title}</h1>
                    <p style="margin:0;font-size:16px;line-height:1.72;color:#42526b;">${message}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px 36px 24px 36px;">
                    <div style="display:inline-block;padding:10px 18px;border-radius:999px;background:${accent === '#ef4444' ? '#fef2f2' : accent === '#64748b' ? '#f1f5f9' : '#ecfdf5'};color:${accent === '#ef4444' ? '#b91c1c' : accent === '#64748b' ? '#475569' : '#047857'};font-size:13px;font-weight:700;">
                      ${accent === '#ef4444' ? 'İşlem tamamlanamadı' : accent === '#64748b' ? 'Talebiniz not edildi' : 'Talebiniz alındı'}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 36px 24px 36px;background:#ffffff;font-size:11px;line-height:1.65;color:#8a97ac;text-align:center;">
                    <div style="border-top:1px solid #e8eef6;padding-top:18px;">
                      <a href="${buildSiteUrl('/')}" style="color:#52637d;text-decoration:none;font-weight:700;">telyx.ai</a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

async function resolveLeadPreviewAssistant(lead) {
  const configuredOwnerEmail = String(
    process.env.LEAD_PREVIEW_OWNER_EMAIL ||
    process.env.PUBLIC_CONTACT_OWNER_EMAIL ||
    ''
  ).trim();
  const preferredAgentId = String(process.env.LEAD_PREVIEW_AGENT_ID || '').trim();
  const preferredAssistantName = String(process.env.LEAD_PREVIEW_ASSISTANT_NAME || '').trim();

  let previewBusinessId = null;

  if (configuredOwnerEmail) {
    const previewOwner = await prisma.user.findFirst({
      where: {
        email: { equals: configuredOwnerEmail, mode: 'insensitive' }
      },
      select: { businessId: true }
    });
    previewBusinessId = previewOwner?.businessId || null;
  }

  if (previewBusinessId && preferredAgentId) {
    const byAgentId = await prisma.assistant.findFirst({
      where: {
        businessId: previewBusinessId,
        elevenLabsAgentId: preferredAgentId
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, name: true, callDirection: true, isActive: true }
    });
    if (byAgentId) return byAgentId;
  }

  if (previewBusinessId && preferredAssistantName) {
    const byName = await prisma.assistant.findFirst({
      where: {
        businessId: previewBusinessId,
        isActive: true,
        elevenLabsAgentId: { not: null },
        name: { equals: preferredAssistantName, mode: 'insensitive' }
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, name: true, callDirection: true, isActive: true }
    });
    if (byName) return byName;
  }

  const candidateBusinessIds = [...new Set(
    [previewBusinessId, lead?.businessId].filter(Boolean)
  )];

  if (candidateBusinessIds.length === 0) return null;

  for (const businessId of candidateBusinessIds) {
    const assistant = await prisma.assistant.findFirst({
      where: {
        businessId,
        isActive: true,
        elevenLabsAgentId: { not: null }
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, name: true, callDirection: true, isActive: true }
    });
    if (assistant) return assistant;
  }

  return null;
}

function getLeadPreviewDisplayName(previewAssistant) {
  const configuredDisplayName = String(process.env.LEAD_PREVIEW_DISPLAY_NAME || '').trim();
  return configuredDisplayName || previewAssistant?.name || 'Asistan';
}

function getLeadPreviewFirstMessage(previewAssistant) {
  const configuredFirstMessage = String(process.env.LEAD_PREVIEW_FIRST_MESSAGE || '').trim();
  if (configuredFirstMessage) return configuredFirstMessage;
  const assistantName = getLeadPreviewDisplayName(previewAssistant);
  return `Merhaba, ben ${assistantName}. Telyx demo önizlemesine hoş geldiniz, size nasıl yardımcı olabilirim?`;
}

function handleLeadPreviewError(res, error, fallbackMessage, responseMessage = 'Failed to prepare lead preview') {
  if (error instanceof LeadPreviewError) {
    return res.status(error.statusCode || 400).json({
      error: error.message,
      code: error.code || 'lead_preview_error'
    });
  }

  console.error(fallbackMessage, error);
  return res.status(500).json({ error: responseMessage });
}

router.get('/respond/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const action = String(req.query.action || '').trim().toLowerCase();

    if (!['yes', 'no'].includes(action)) {
      return res.status(400).send(buildResponseHtml({
        title: 'Geçersiz işlem',
        message: 'Bu bağlantı artık geçerli değil veya eksik parametre içeriyor.',
        accent: '#ef4444',
      }));
    }

    const existingLead = await getLeadByResponseToken(token);
    if (!existingLead) {
      return res.status(404).send(buildResponseHtml({
        title: 'Lead bulunamadı',
        message: 'Bu bağlantıya ait kayıt bulunamadı.',
        accent: '#ef4444',
      }));
    }

    const result = await handleLeadCtaResponse(token, action);
    if (!result.success) {
      return res.status(400).send(buildResponseHtml({
        title: 'İşlem tamamlanamadı',
        message: 'Talebiniz işlenemedi. Lütfen daha sonra tekrar deneyin.',
        accent: '#ef4444',
      }));
    }

    if (action === 'yes') {
      return res.status(200).send(buildResponseHtml({
        title: 'Demo talebinizi aldık',
        message: 'Talebiniz ekibimize ulaştı. En kısa sürede sizinle iletişime geçeceğiz.',
        accent: '#10b981',
      }));
    }

    return res.send(buildResponseHtml({
      title: 'Not edildi',
      message: 'Teşekkürler. Şu an ilgilenmediğinizi kaydettik.',
      accent: '#64748b',
    }));
  } catch (error) {
    console.error('Lead CTA response error:', error);
    return res.status(500).send(buildResponseHtml({
      title: 'Bir hata oluştu',
      message: 'Talebiniz işlenirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.',
      accent: '#ef4444',
    }));
  }
});

router.post('/ingest/meta', async (req, res) => {
  try {
    if (!ensureLeadIngestAuthorized(req)) {
      return res.status(401).json({
        error: 'Unauthorized lead ingest request'
      });
    }

    const payload = req.body || {};
    const parsedFields = parseFieldData(payload.field_data || payload.fieldData || payload.fields || []);
    const normalizedAnswers = normalizeLeadFieldBag(payload.answers || {});
    const normalizedPayload = normalizeLeadFieldBag(payload);
    const flatFields = {
      ...parsedFields,
      ...normalizedAnswers,
      ...normalizedPayload,
    };

    const externalSourceId = pickFirst(flatFields, ['leadgen_id', 'lead_id', 'leadid', 'id']);
    const sourceSubmittedAt = parseLeadDateValue(
      pickFirst(flatFields, ['created_time', 'created_at', 'submitted_at', 'timestamp'])
    );
    const name = pickFirst(flatFields, ['full_name', 'full_name_1', 'fullname', 'name', 'ad_soyad', 'ad_ve_soyad'])
      || pickFirst(flatFields, ['company_name', 'company'])
      || 'Meta Lead';
    const email = pickFirst(flatFields, ['email', 'e_mail', 'e_posta', 'eposta', 'mail']);
    const phone = pickFirst(flatFields, ['phone_number', 'phone', 'telefon', 'telefon_numarasi', 'telefon_numarası', 'mobile_number']);
    const company = pickFirst(flatFields, ['company_name', 'company', 'sirket', 'sirket_adi', 'şirket']);
    const businessType = pickFirst(flatFields, ['business_type', 'isletme_turu', 'isletme_tipi', 'işletme_türü']);
    const message = pickFirst(flatFields, ['message', 'mesaj', 'note', 'not']);
    const campaignName = pickFirst(flatFields, ['campaign_name', 'campaign']);
    const adsetName = pickFirst(flatFields, ['adset_name', 'ad_set_name', 'adset']);
    const adName = pickFirst(flatFields, ['ad_name', 'ad']);
    const formName = pickFirst(flatFields, ['form_name', 'form']);

    if (name === 'Meta Lead') {
      console.warn('Meta ingest fell back to placeholder lead name due to unmapped fields:', {
        externalSourceId,
        availableKeys: Object.keys(flatFields)
      });
    }

    const { lead, isDuplicate } = await createLead({
      source: LEAD_SOURCE.META_INSTANT_FORM,
      externalSourceId,
      name,
      email,
      phone,
      company,
      businessType,
      message,
      campaignName,
      adsetName,
      adName,
      formName,
      sourceSubmittedAt,
      rawPayload: payload
    });

    res.status(isDuplicate ? 200 : 201).json({
      success: true,
      isDuplicate,
      leadId: lead.id,
      status: lead.status
    });
  } catch (error) {
    console.error('Meta lead ingest error:', error);
    res.status(500).json({
      error: 'Failed to ingest Meta lead'
    });
  }
});

router.post('/cleanup/test-leads', async (req, res) => {
  try {
    if (!ensureLeadIngestAuthorized(req)) {
      return res.status(401).json({ error: 'Unauthorized lead cleanup request' });
    }

    const matches = await findTestLeadIds();
    const leadIds = matches.map((lead) => lead.id);

    if (req.body?.dryRun) {
      return res.json({
        success: true,
        dryRun: true,
        count: matches.length,
        items: matches
      });
    }

    if (leadIds.length === 0) {
      return res.json({
        success: true,
        deleted: 0,
        items: []
      });
    }

    await prisma.$transaction([
      prisma.lead.deleteMany({
        where: { id: { in: leadIds } }
      })
    ]);

    return res.json({
      success: true,
      deleted: leadIds.length,
      items: matches
    });
  } catch (error) {
    console.error('Test lead cleanup error:', error);
    return res.status(500).json({ error: 'Failed to clean test leads' });
  }
});

router.post('/cleanup/by-match', async (req, res) => {
  try {
    if (!ensureLeadIngestAuthorized(req)) {
      return res.status(401).json({ error: 'Unauthorized lead cleanup request' });
    }

    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
    const emails = Array.isArray(req.body?.emails) ? req.body.emails.map((value) => String(value).trim().toLowerCase()).filter(Boolean) : [];
    const phones = Array.isArray(req.body?.phones) ? req.body.phones.map((value) => String(value).replace(/\D/g, '')).filter(Boolean) : [];
    const names = Array.isArray(req.body?.names) ? req.body.names.map((value) => String(value).trim()).filter(Boolean) : [];

    const orFilters = [];
    if (ids.length) orFilters.push({ id: { in: ids } });
    if (emails.length) orFilters.push({ email: { in: emails } });
    if (phones.length) orFilters.push({ phone: { in: phones } });
    if (names.length) orFilters.push({ name: { in: names } });

    if (!orFilters.length) {
      return res.status(400).json({ error: 'At least one cleanup filter is required' });
    }

    const matches = await prisma.lead.findMany({
      where: { OR: orFilters },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        source: true,
        formName: true,
        campaignName: true,
        externalSourceId: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const leadIds = matches.map((lead) => lead.id);

    if (req.body?.dryRun) {
      return res.json({
        success: true,
        dryRun: true,
        count: matches.length,
        items: matches
      });
    }

    if (!leadIds.length) {
      return res.json({
        success: true,
        deleted: 0,
        items: []
      });
    }

    await prisma.lead.deleteMany({
      where: { id: { in: leadIds } }
    });

    return res.json({
      success: true,
      deleted: leadIds.length,
      items: matches
    });
  } catch (error) {
    console.error('Targeted lead cleanup error:', error);
    return res.status(500).json({ error: 'Failed to clean matching leads' });
  }
});

router.post('/restore/by-data', async (req, res) => {
  try {
    if (!ensureLeadIngestAuthorized(req)) {
      return res.status(401).json({ error: 'Unauthorized lead restore request' });
    }

    const payload = req.body?.lead || {};
    const source = String(payload.source || '').trim();
    const name = String(payload.name || '').trim();

    if (!source || !name) {
      return res.status(400).json({ error: 'Lead source and name are required' });
    }

    const externalSourceId = payload.externalSourceId ? String(payload.externalSourceId).trim() : null;
    if (externalSourceId) {
      const existing = await prisma.lead.findFirst({
        where: { source, externalSourceId }
      });

      if (existing) {
        return res.json({ success: true, restored: false, reason: 'already_exists', lead: existing });
      }
    }

    const contactProfile = await getPublicContactProfile(prisma);
    const createdLead = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          businessId: payload.businessId ?? contactProfile.businessId ?? null,
          source,
          externalSourceId,
          campaignName: payload.campaignName || null,
          adsetName: payload.adsetName || null,
          adName: payload.adName || null,
          formName: payload.formName || null,
          name,
          email: payload.email || null,
          phone: payload.phone || null,
          company: payload.company || null,
          businessType: payload.businessType || null,
          message: payload.message || null,
          status: payload.status || LEAD_STATUS.NEW,
          temperature: payload.temperature || LEAD_TEMPERATURE.COLD,
          ctaResponse: payload.ctaResponse || null,
          responseToken: payload.responseToken || randomUUID(),
          notes: payload.notes || null,
          sourceSubmittedAt: payload.sourceSubmittedAt ? new Date(payload.sourceSubmittedAt) : null,
          receivedAtUtc: payload.receivedAtUtc ? new Date(payload.receivedAtUtc) : undefined,
          notificationSentAt: payload.notificationSentAt ? new Date(payload.notificationSentAt) : null,
          firstEmailedAt: payload.firstEmailedAt ? new Date(payload.firstEmailedAt) : null,
          lastContactedAt: payload.lastContactedAt ? new Date(payload.lastContactedAt) : null,
          nextFollowUpAt: payload.nextFollowUpAt ? new Date(payload.nextFollowUpAt) : null,
          ctaRespondedAt: payload.ctaRespondedAt ? new Date(payload.ctaRespondedAt) : null,
          rawPayload: payload.rawPayload || null,
          createdAt: payload.createdAt ? new Date(payload.createdAt) : undefined,
        }
      });

      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          type: 'LEAD_CREATED',
          message: 'Lead geri yüklendi.',
          actorType: 'system',
          actorLabel: 'lead_restore'
        }
      });

      if (lead.firstEmailedAt) {
        await tx.leadActivity.create({
          data: {
            leadId: lead.id,
            type: 'INITIAL_EMAIL_SENT',
            message: 'Önceden gönderilmiş ilk email durumu geri yüklendi.',
            actorType: 'system',
            actorLabel: 'lead_restore'
          }
        });
      }

      return lead;
    });

    return res.status(201).json({ success: true, restored: true, lead: createdLead });
  } catch (error) {
    console.error('Lead restore error:', error);
    return res.status(500).json({ error: 'Failed to restore lead' });
  }
});

router.get('/preview/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const activate = String(req.query.activate || '').trim() === '1';

    const existingLead = await getLeadByResponseToken(token);
    if (!existingLead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    let lead = existingLead;
    let actionTaken = null;

    if (activate) {
      const result = await handleLeadCtaResponse(token, 'yes', { skipCallbackQueue: true });
      if (!result.success) {
        return res.status(400).json({ error: 'Failed to activate lead preview' });
      }
      lead = result.lead || existingLead;
      actionTaken = result.actionTaken || (result.alreadyProcessed ? 'already_requested' : 'demo_preview_started');
    }

    const refreshedLead = await getLeadByResponseToken(token);
    const effectiveLead = refreshedLead || lead;
    const previewAssistant = await resolveLeadPreviewAssistant(effectiveLead);
    const previewDisplayName = getLeadPreviewDisplayName(previewAssistant);
    let previewAccessToken = null;

    if (activate && previewAssistant?.id && effectiveLead?.id) {
      const previewSession = await createLeadPreviewSession({
        leadId: effectiveLead.id,
        assistantId: previewAssistant.id
      });
      previewAccessToken = previewSession.previewAccessToken;
    }

    return res.json({
      leadName: effectiveLead?.name || null,
      status: effectiveLead?.status || null,
      ctaResponse: effectiveLead?.ctaResponse || null,
      actionTaken,
      previewAssistantId: previewAssistant?.id || null,
      previewAssistantName: previewAssistant?.name || null,
      previewAssistantCallDirection: previewAssistant?.callDirection || null,
      previewDisplayName,
      previewFirstMessage: getLeadPreviewFirstMessage(previewAssistant),
      previewAccessToken,
      previewMaxDurationSeconds: LEAD_PREVIEW_MAX_DURATION_SECONDS,
    });
  } catch (error) {
    return handleLeadPreviewError(res, error, 'Lead preview error:', 'Failed to prepare lead preview');
  }
});

router.post('/preview/session/connect', async (req, res) => {
  try {
    const { previewAccessToken, conversationId } = req.body || {};
    const session = await registerLeadPreviewConversation({
      previewAccessToken,
      conversationId
    });

    return res.json({
      success: true,
      status: session.status,
      expiresAt: session.expiresAt,
      previewMaxDurationSeconds: LEAD_PREVIEW_MAX_DURATION_SECONDS
    });
  } catch (error) {
    return handleLeadPreviewError(res, error, 'Lead preview connect error:', 'Failed to connect lead preview session');
  }
});

router.post('/preview/session/end', async (req, res) => {
  try {
    const { previewAccessToken, reason } = req.body || {};
    const session = await finishLeadPreviewSession({
      previewAccessToken,
      reason
    });

    return res.json({
      success: true,
      status: session?.status || null,
      endReason: session?.endReason || null
    });
  } catch (error) {
    return handleLeadPreviewError(res, error, 'Lead preview end error:', 'Failed to close lead preview session');
  }
});

router.use(authenticateToken);
router.use(isAdmin);
router.use(requireAdminMfa);

router.get('/stats', async (_req, res) => {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [total, hot, newCount, emailed, positive, calledToday] = await Promise.all([
      prisma.lead.count(),
      prisma.lead.count({ where: { temperature: LEAD_TEMPERATURE.HOT } }),
      prisma.lead.count({ where: { status: LEAD_STATUS.NEW } }),
      prisma.lead.count({ where: { status: LEAD_STATUS.EMAILED } }),
      prisma.lead.count({
        where: {
          status: {
            in: [LEAD_STATUS.POSITIVE, LEAD_STATUS.CALL_QUEUED, LEAD_STATUS.CALLED]
          }
        }
      }),
      prisma.lead.count({
        where: {
          lastContactedAt: { gte: today },
          status: {
            in: [LEAD_STATUS.CALLED, LEAD_STATUS.CALL_QUEUED]
          }
        }
      })
    ]);

    res.json({
      total,
      hot,
      new: newCount,
      emailed,
      positive,
      calledToday
    });
  } catch (error) {
    console.error('Lead stats error:', error);
    res.status(500).json({ error: 'Failed to fetch lead stats' });
  }
});

router.get('/', async (req, res) => {
  try {
    const {
      status,
      statusGroup,
      source,
      temperature,
      search,
      page = 1,
      limit = 50
    } = req.query;

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNumber - 1) * take;
    const where = {};

    if (status) where.status = status;
    if (statusGroup === 'POSITIVE_PIPELINE') {
      where.status = {
        in: [LEAD_STATUS.POSITIVE, LEAD_STATUS.CALL_QUEUED, LEAD_STATUS.CALLED]
      };
    }
    if (source) where.source = source;
    if (temperature) where.temperature = temperature;

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: [
          { receivedAtUtc: 'desc' }
        ],
        skip,
        take,
        include: {
          activities: {
            orderBy: { createdAt: 'desc' },
            take: 3
          },
          callbackRequests: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              status: true,
              createdAt: true,
              assistantId: true
            }
          }
        }
      }),
      prisma.lead.count({ where })
    ]);

    res.json({
      items,
      total,
      page: pageNumber,
      pageSize: take,
      totalPages: Math.max(1, Math.ceil(total / take))
    });
  } catch (error) {
    console.error('Lead list error:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id },
      include: {
        activities: {
          orderBy: { createdAt: 'desc' }
        },
        callbackRequests: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json({
      ...lead,
    });
  } catch (error) {
    console.error('Lead detail error:', error);
    res.status(500).json({ error: 'Failed to fetch lead detail' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const existing = await prisma.lead.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const updates = {};
    if (req.body.status) updates.status = req.body.status;
    if (req.body.temperature) updates.temperature = req.body.temperature;
    if (req.body.notes !== undefined) updates.notes = req.body.notes || null;
    if (req.body.nextFollowUpAt !== undefined) {
      updates.nextFollowUpAt = req.body.nextFollowUpAt ? new Date(req.body.nextFollowUpAt) : null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextLead = await tx.lead.update({
        where: { id: req.params.id },
        data: updates
      });

      if (req.body.status && req.body.status !== existing.status) {
        await tx.leadActivity.create({
          data: {
            leadId: nextLead.id,
            type: 'STATUS_CHANGED',
            message: `Lead durumu ${existing.status} -> ${req.body.status} güncellendi.`,
            actorType: 'admin',
            actorLabel: req.admin?.email || 'admin'
          }
        });
      }

      if (req.body.notes !== undefined && req.body.notes !== existing.notes) {
        await tx.leadActivity.create({
          data: {
            leadId: nextLead.id,
            type: 'NOTE_UPDATED',
            message: 'Lead notu güncellendi.',
            actorType: 'admin',
            actorLabel: req.admin?.email || 'admin'
          }
        });
      }

      return nextLead;
    });

    res.json(updated);
  } catch (error) {
    console.error('Lead update error:', error);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

export default router;
