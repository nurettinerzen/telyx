import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import { isAdmin, requireAdminMfa } from '../middleware/adminAuth.js';
import { createLead, getLeadByResponseToken, getLeadConstants, handleLeadCtaResponse } from '../services/leadService.js';
import {
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

function parseFieldData(fieldData = []) {
  const result = {};
  if (!Array.isArray(fieldData)) return result;

  for (const item of fieldData) {
    const key = String(item?.name || '').trim().toLowerCase();
    if (!key) continue;
    const values = Array.isArray(item?.values) ? item.values : [];
    result[key] = values.length <= 1 ? (values[0] ?? null) : values;
  }

  return result;
}

function pickFirst(fields, keys = []) {
  for (const key of keys) {
    if (fields[key] !== undefined && fields[key] !== null && String(fields[key]).trim() !== '') {
      return fields[key];
    }
  }
  return null;
}

function ensureLeadIngestAuthorized(req) {
  const configuredSecret = String(process.env.LEAD_INGEST_SECRET || '').trim();
  if (!configuredSecret) {
    return process.env.NODE_ENV !== 'production';
  }

  const providedSecret = String(req.headers['x-lead-ingest-secret'] || '').trim();
  return configuredSecret.length > 0 && providedSecret === configuredSecret;
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
      <body style="margin:0;padding:0;background:#eef3f9;font-family:'Google Sans','Segoe UI',Arial,Helvetica,sans-serif;color:#051752;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f9;padding:32px 16px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 12px 40px rgba(8,18,36,0.08);">
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
    const flatFields = {
      ...parsedFields,
      ...payload.answers,
      ...payload,
    };

    const name = pickFirst(flatFields, ['full_name', 'name', 'ad_soyad']) || pickFirst(flatFields, ['company_name', 'company']) || 'Meta Lead';
    const email = pickFirst(flatFields, ['email', 'e-mail', 'mail']);
    const phone = pickFirst(flatFields, ['phone_number', 'phone', 'telefon', 'mobile_number']);
    const company = pickFirst(flatFields, ['company_name', 'company', 'sirket', 'şirket']);
    const businessType = pickFirst(flatFields, ['business_type', 'isletme_turu', 'işletme_türü']);
    const message = pickFirst(flatFields, ['message', 'mesaj', 'note', 'not']);

    const { lead, isDuplicate } = await createLead({
      source: LEAD_SOURCE.META_INSTANT_FORM,
      externalSourceId: payload.leadgen_id || payload.leadId || payload.id || null,
      name,
      email,
      phone,
      company,
      businessType,
      message,
      campaignName: payload.campaign_name || payload.campaignName || null,
      adsetName: payload.adset_name || payload.adsetName || null,
      adName: payload.ad_name || payload.adName || null,
      formName: payload.form_name || payload.formName || null,
      sourceSubmittedAt: payload.created_time ? new Date(payload.created_time) : null,
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

router.get('/preview/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const existingLead = await getLeadByResponseToken(token);
    if (!existingLead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const result = await handleLeadCtaResponse(token, 'yes');
    if (!result.success) {
      return res.status(400).json({ error: 'Demo talebi işlenemedi' });
    }

    const effectiveLead = result.lead || existingLead;
    const message = result.alreadyProcessed
      ? 'Demo talebiniz daha önce alınmıştı. Ekibimiz bu kayıt üzerinden sizinle iletişime geçecek.'
      : 'Demo talebiniz bize ulaştı. Ekibimiz bu kayıt üzerinden sizinle en kısa sürede iletişime geçecek.';

    return res.json({
      mode: 'request_received',
      title: 'Demo talebinizi aldık',
      message,
      leadName: effectiveLead?.name || null,
      status: effectiveLead?.status || null,
      ctaResponse: effectiveLead?.ctaResponse || null,
      actionTaken: result.actionTaken || (result.alreadyProcessed ? 'already_requested' : 'demo_requested'),
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
