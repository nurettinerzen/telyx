import { randomUUID } from 'crypto';
import prisma from '../prismaClient.js';
import { getPublicContactProfile } from './businessPhoneRouting.js';

const LEAD_SOURCE = Object.freeze({
  META_INSTANT_FORM: 'META_INSTANT_FORM',
  WEBSITE_CONTACT: 'WEBSITE_CONTACT',
  WEBSITE_DEMO: 'WEBSITE_DEMO',
  WEBSITE_WAITLIST: 'WEBSITE_WAITLIST',
  MANUAL: 'MANUAL',
});

const LEAD_STATUS = Object.freeze({
  NEW: 'NEW',
  EMAILED: 'EMAILED',
  POSITIVE: 'POSITIVE',
  NOT_NOW: 'NOT_NOW',
  CALL_QUEUED: 'CALL_QUEUED',
  CALLED: 'CALLED',
  WON: 'WON',
  LOST: 'LOST',
});

const LEAD_TEMPERATURE = Object.freeze({
  COLD: 'COLD',
  WARM: 'WARM',
  HOT: 'HOT',
});

const LEAD_ACTIVITY = Object.freeze({
  LEAD_CREATED: 'LEAD_CREATED',
  INTERNAL_NOTIFICATION_SENT: 'INTERNAL_NOTIFICATION_SENT',
  INTERNAL_NOTIFICATION_FAILED: 'INTERNAL_NOTIFICATION_FAILED',
  INITIAL_EMAIL_SENT: 'INITIAL_EMAIL_SENT',
  INITIAL_EMAIL_FAILED: 'INITIAL_EMAIL_FAILED',
  CTA_YES: 'CTA_YES',
  CTA_NO: 'CTA_NO',
  STATUS_CHANGED: 'STATUS_CHANGED',
  NOTE_UPDATED: 'NOTE_UPDATED',
  CALLBACK_QUEUED: 'CALLBACK_QUEUED',
  CALLBACK_QUEUE_FAILED: 'CALLBACK_QUEUE_FAILED',
  DEMO_CALL_INITIATED: 'DEMO_CALL_INITIATED',
  DEMO_CALL_FAILED: 'DEMO_CALL_FAILED',
});

function cleanString(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function normalizeEmail(value) {
  const normalized = cleanString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizePhone(value) {
  const normalized = cleanString(value);
  if (!normalized) return null;

  let digits = normalized.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('0') && digits.length === 11) {
    digits = `90${digits.slice(1)}`;
  } else if (digits.length === 10 && digits.startsWith('5')) {
    digits = `90${digits}`;
  }

  return digits;
}

function deriveLeadTemperature({ email, phone, company, message, businessType }) {
  let score = 0;
  if (email) score += 1;
  if (phone) score += 1;
  if (company) score += 1;
  if (message) score += 1;
  if (businessType) score += 1;

  if (score >= 3) return LEAD_TEMPERATURE.HOT;
  if (score >= 2) return LEAD_TEMPERATURE.WARM;
  return LEAD_TEMPERATURE.COLD;
}

async function createLeadActivity(tx, {
  leadId,
  type,
  message = null,
  metadata = null,
  actorType = null,
  actorId = null,
  actorLabel = null,
}) {
  return tx.leadActivity.create({
    data: {
      leadId,
      type,
      message,
      metadata,
      actorType,
      actorId,
      actorLabel,
    }
  });
}

function buildLeadTopic(lead) {
  const companyOrName = lead.company || lead.name || 'Yeni lead';
  return `${companyOrName} için demo araması talebi`;
}

async function queueLeadCallback(lead) {
  if (!lead.businessId || !lead.phone) {
    return {
      success: false,
      reason: 'missing_business_or_phone'
    };
  }

  const assistant = await prisma.assistant.findFirst({
    where: {
      businessId: lead.businessId,
      isActive: true,
      callDirection: {
        startsWith: 'outbound'
      }
    },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' }
  });

  const callback = await prisma.callbackRequest.create({
    data: {
      businessId: lead.businessId,
      leadId: lead.id,
      assistantId: assistant?.id || null,
      customerName: lead.name || lead.company || 'Yeni Lead',
      customerPhone: lead.phone,
      topic: buildLeadTopic(lead),
      priority: lead.temperature === LEAD_TEMPERATURE.HOT ? 'HIGH' : 'NORMAL'
    }
  });

  return {
    success: true,
    callback
  };
}

export async function createLead({
  source,
  externalSourceId = null,
  name,
  email = null,
  phone = null,
  company = null,
  businessType = null,
  message = null,
  campaignName = null,
  adsetName = null,
  adName = null,
  formName = null,
  sourceSubmittedAt = null,
  rawPayload = null,
}) {
  const cleanName = cleanString(name);
  if (!cleanName) {
    throw new Error('Lead name is required');
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  const normalizedCompany = cleanString(company);
  const normalizedBusinessType = cleanString(businessType);
  const normalizedMessage = cleanString(message);
  const normalizedCampaignName = cleanString(campaignName);
  const normalizedAdsetName = cleanString(adsetName);
  const normalizedAdName = cleanString(adName);
  const normalizedFormName = cleanString(formName);
  const normalizedExternalSourceId = cleanString(externalSourceId);
  const temperature = deriveLeadTemperature({
    email: normalizedEmail,
    phone: normalizedPhone,
    company: normalizedCompany,
    message: normalizedMessage,
    businessType: normalizedBusinessType
  });

  if (normalizedExternalSourceId) {
    const existingLead = await prisma.lead.findFirst({
      where: {
        source,
        externalSourceId: normalizedExternalSourceId
      }
    });

    if (existingLead) {
      return { lead: existingLead, isDuplicate: true };
    }
  }

  const contactProfile = await getPublicContactProfile(prisma);

  const lead = await prisma.$transaction(async (tx) => {
    const createdLead = await tx.lead.create({
      data: {
        businessId: contactProfile.businessId || null,
        source,
        externalSourceId: normalizedExternalSourceId,
        campaignName: normalizedCampaignName,
        adsetName: normalizedAdsetName,
        adName: normalizedAdName,
        formName: normalizedFormName,
        name: cleanName,
        email: normalizedEmail,
        phone: normalizedPhone,
        company: normalizedCompany,
        businessType: normalizedBusinessType,
        message: normalizedMessage,
        temperature,
        responseToken: randomUUID(),
        sourceSubmittedAt: sourceSubmittedAt || null,
        rawPayload: rawPayload || null,
      }
    });

    await createLeadActivity(tx, {
      leadId: createdLead.id,
      type: LEAD_ACTIVITY.LEAD_CREATED,
      message: 'Lead sisteme alındı.',
      metadata: {
        source,
        campaignName: normalizedCampaignName,
        adsetName: normalizedAdsetName,
        adName: normalizedAdName,
        formName: normalizedFormName,
      },
      actorType: 'system',
      actorLabel: 'lead_ingest',
    });

    return createdLead;
  });

  const {
    sendLeadAutoResponseEmail,
    sendLeadNotificationEmail,
  } = await import('./emailService.js');

  try {
    await sendLeadNotificationEmail(lead);
    await prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: lead.id },
        data: { notificationSentAt: new Date() }
      });
      await createLeadActivity(tx, {
        leadId: lead.id,
        type: LEAD_ACTIVITY.INTERNAL_NOTIFICATION_SENT,
        message: 'Dahili lead bildirimi gönderildi.',
        actorType: 'system',
        actorLabel: 'lead_notification'
      });
    });
  } catch (error) {
    console.error('Lead notification failed:', error.message);
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        type: LEAD_ACTIVITY.INTERNAL_NOTIFICATION_FAILED,
        message: 'Dahili lead bildirimi gönderilemedi.',
        metadata: { error: error.message },
        actorType: 'system',
        actorLabel: 'lead_notification'
      }
    });
  }

  if (lead.email) {
    try {
      await sendLeadAutoResponseEmail(lead);
      await prisma.$transaction(async (tx) => {
        await tx.lead.update({
          where: { id: lead.id },
          data: {
            status: LEAD_STATUS.EMAILED,
            firstEmailedAt: new Date(),
            lastContactedAt: new Date()
          }
        });
        await createLeadActivity(tx, {
          leadId: lead.id,
          type: LEAD_ACTIVITY.INITIAL_EMAIL_SENT,
          message: 'Otomatik ilk email gönderildi.',
          actorType: 'system',
          actorLabel: 'lead_autoresponder'
        });
      });
      lead.status = LEAD_STATUS.EMAILED;
    } catch (error) {
      console.error('Lead auto email failed:', error.message);
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          type: LEAD_ACTIVITY.INITIAL_EMAIL_FAILED,
          message: 'Otomatik ilk email gönderilemedi.',
          metadata: { error: error.message },
          actorType: 'system',
          actorLabel: 'lead_autoresponder'
        }
      });
    }
  }

  return { lead, isDuplicate: false };
}

export async function getLeadByResponseToken(responseToken) {
  const token = cleanString(responseToken);
  if (!token) return null;

  return prisma.lead.findUnique({
    where: { responseToken: token }
  });
}

export async function handleLeadCtaResponse(responseToken, action) {
  const lead = await getLeadByResponseToken(responseToken);
  if (!lead) {
    return { success: false, reason: 'not_found' };
  }

  const normalizedAction = String(action || '').trim().toLowerCase();
  if (!['yes', 'no'].includes(normalizedAction)) {
    return { success: false, reason: 'invalid_action', lead };
  }

  if (lead.ctaRespondedAt) {
    return { success: true, lead, alreadyProcessed: true };
  }

  const now = new Date();
  const ctaResponse = normalizedAction === 'yes' ? 'YES' : 'NO';
  const baseStatus = normalizedAction === 'yes' ? LEAD_STATUS.POSITIVE : LEAD_STATUS.NOT_NOW;
  const baseTemperature = normalizedAction === 'yes' ? LEAD_TEMPERATURE.HOT : lead.temperature;

  const updatedLead = await prisma.$transaction(async (tx) => {
    const nextLead = await tx.lead.update({
      where: { id: lead.id },
      data: {
        ctaResponse,
        ctaRespondedAt: now,
        status: baseStatus,
        temperature: baseTemperature,
        lastContactedAt: now,
        nextFollowUpAt: normalizedAction === 'no'
          ? new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000))
          : null,
      }
    });

    await createLeadActivity(tx, {
      leadId: nextLead.id,
      type: normalizedAction === 'yes' ? LEAD_ACTIVITY.CTA_YES : LEAD_ACTIVITY.CTA_NO,
      message: normalizedAction === 'yes'
        ? 'Lead demo araması istedi.'
        : 'Lead şu an ilgilenmediğini belirtti.',
      actorType: 'lead',
      actorLabel: nextLead.email || nextLead.phone || nextLead.name,
    });

    return nextLead;
  });

  if (normalizedAction === 'no') {
    return { success: true, lead: updatedLead, alreadyProcessed: false };
  }

  try {
    const callbackResult = await queueLeadCallback(updatedLead);
    if (callbackResult.success) {
      const queuedLead = await prisma.$transaction(async (tx) => {
        const nextLead = await tx.lead.update({
          where: { id: updatedLead.id },
          data: {
            status: LEAD_STATUS.CALL_QUEUED,
            lastContactedAt: new Date()
          }
        });

        await createLeadActivity(tx, {
          leadId: nextLead.id,
          type: LEAD_ACTIVITY.CALLBACK_QUEUED,
          message: 'Lead callback kuyruğuna alındı.',
          metadata: {
            callbackId: callbackResult.callback.id,
            assistantId: callbackResult.callback.assistantId
          },
          actorType: 'system',
          actorLabel: 'callback_queue'
        });

        return nextLead;
      });

      return {
        success: true,
        lead: queuedLead,
        alreadyProcessed: false,
        actionTaken: 'callback_queued',
        callbackId: callbackResult.callback.id
      };
    }
  } catch (error) {
    console.error('Lead callback queue failed:', error.message);
    await prisma.leadActivity.create({
      data: {
        leadId: updatedLead.id,
        type: LEAD_ACTIVITY.CALLBACK_QUEUE_FAILED,
        message: 'Lead callback kuyruğuna alınamadı.',
        metadata: { error: error.message },
        actorType: 'system',
        actorLabel: 'callback_queue'
      }
    });
  }

  return {
    success: true,
    lead: updatedLead,
    alreadyProcessed: false,
    actionTaken: 'demo_requested'
  };
}

export function getLeadConstants() {
  return {
    LEAD_SOURCE,
    LEAD_STATUS,
    LEAD_TEMPERATURE,
    LEAD_ACTIVITY,
  };
}
