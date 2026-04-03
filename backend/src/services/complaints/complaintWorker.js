import prisma from '../../prismaClient.js';
import { delay } from '../marketplace/qaShared.js';
import { generateComplaintAnswer } from './complaintAnswerGenerator.js';
import {
  buildSikayetvarCredentials,
  COMPLAINT_PLATFORM,
  COMPLAINT_THREAD_STATUS,
  decryptSikayetvarCredentials,
} from './sikayetvarShared.js';
import SikayetvarService from '../integrations/complaints/sikayetvar.service.js';

const SUPPORTED_COMPLAINT_TYPES = [COMPLAINT_PLATFORM.SIKAYETVAR];
const MAX_COMPLAINTS_PER_BUSINESS_PER_RUN = 20;

function getComplaintServiceForPlatform(platform, credentials = null) {
  switch (String(platform || '').toUpperCase()) {
    case COMPLAINT_PLATFORM.SIKAYETVAR:
      return new SikayetvarService(credentials);
    default:
      throw new Error(`Desteklenmeyen sikayet platformu: ${platform}`);
  }
}

function normalizeRuntimeCredentials(integration, businessLanguage) {
  return decryptSikayetvarCredentials(integration.credentials, businessLanguage);
}

async function createComplaintRecord({
  businessId,
  platform,
  complaint,
}) {
  return prisma.complaintThread.create({
    data: {
      businessId,
      platform,
      externalId: complaint.externalId,
      title: complaint.title,
      complaintText: complaint.complaintText,
      customerName: complaint.customerName,
      customerEmail: complaint.customerEmail,
      customerPhone: complaint.customerPhone,
      customerCity: complaint.customerCity,
      complaintUrl: complaint.complaintUrl,
      platformStatus: complaint.platformStatus,
      sourceCreatedAt: complaint.sourceCreatedAt || null,
      answeredAt: complaint.answeredAt || null,
      closedAt: complaint.closedAt || null,
      published: complaint.published,
      status: complaint.closed ? COMPLAINT_THREAD_STATUS.CLOSED : COMPLAINT_THREAD_STATUS.PENDING,
      rawPayload: complaint.raw || null,
    },
  });
}

async function syncExistingComplaintRecord(existingRecord, complaint) {
  const nextStatus = complaint.closed
    && [COMPLAINT_THREAD_STATUS.PENDING, COMPLAINT_THREAD_STATUS.APPROVED].includes(existingRecord.status)
    ? COMPLAINT_THREAD_STATUS.CLOSED
    : existingRecord.status;

  await prisma.complaintThread.update({
    where: { id: existingRecord.id },
    data: {
      title: complaint.title,
      complaintText: complaint.complaintText,
      customerName: complaint.customerName,
      customerEmail: complaint.customerEmail,
      customerPhone: complaint.customerPhone,
      customerCity: complaint.customerCity,
      complaintUrl: complaint.complaintUrl,
      platformStatus: complaint.platformStatus,
      sourceCreatedAt: complaint.sourceCreatedAt || null,
      answeredAt: complaint.answeredAt || null,
      closedAt: complaint.closedAt || null,
      published: complaint.published,
      rawPayload: complaint.raw || null,
      status: nextStatus,
    },
  });
}

async function markComplaintAsError(threadId, errorMessage) {
  await prisma.complaintThread.update({
    where: { id: threadId },
    data: {
      status: COMPLAINT_THREAD_STATUS.ERROR,
      errorMessage: String(errorMessage || 'Bilinmeyen hata').slice(0, 4000),
    },
  });
}

async function generateAndPersistReply({
  complaintRecord,
  complaintSettings,
  priorMessages,
}) {
  const generated = await generateComplaintAnswer({
    businessId: complaintRecord.businessId,
    platform: complaintRecord.platform,
    title: complaintRecord.title,
    complaintText: complaintRecord.complaintText,
    priorMessages,
    complaintSettings,
  });

  return prisma.complaintThread.update({
    where: { id: complaintRecord.id },
    data: {
      generatedReply: generated.answer,
      errorMessage: null,
    },
  });
}

export async function processComplaintThreads() {
  const summary = {
    startedAt: new Date().toISOString(),
    businessesProcessed: 0,
    integrationsProcessed: 0,
    fetched: 0,
    created: 0,
    generated: 0,
    skippedExisting: 0,
    closed: 0,
    errors: 0,
  };

  const businesses = await prisma.business.findMany({
    where: {
      integrations: {
        some: {
          type: { in: SUPPORTED_COMPLAINT_TYPES },
          connected: true,
          isActive: true,
        },
      },
    },
    select: {
      id: true,
      language: true,
      integrations: {
        where: {
          type: { in: SUPPORTED_COMPLAINT_TYPES },
          connected: true,
          isActive: true,
        },
        select: {
          id: true,
          type: true,
          credentials: true,
          businessId: true,
        },
      },
    },
  });

  for (const business of businesses) {
    let remainingCapacity = MAX_COMPLAINTS_PER_BUSINESS_PER_RUN;
    summary.businessesProcessed += 1;

    for (const integration of business.integrations) {
      if (remainingCapacity <= 0) {
        break;
      }

      summary.integrationsProcessed += 1;
      const runtimeCredentials = normalizeRuntimeCredentials(integration, business.language);
      const complaintSettings = buildSikayetvarCredentials(runtimeCredentials, business.language).complaintSettings;
      const service = getComplaintServiceForPlatform(integration.type, runtimeCredentials);

      try {
        const remoteComplaints = await service.fetchOpenComplaints(business.id, {
          size: Math.min(remainingCapacity, 50),
        });

        summary.fetched += remoteComplaints.length;

        const externalIds = remoteComplaints
          .map((item) => item.externalId)
          .filter(Boolean);

        const existingThreads = externalIds.length > 0
          ? await prisma.complaintThread.findMany({
              where: {
                businessId: business.id,
                platform: integration.type,
                externalId: { in: externalIds },
              },
              select: { id: true, externalId: true, status: true },
            })
          : [];

        const existingByExternalId = new Map(existingThreads.map((item) => [item.externalId, item]));
        const existingIdSet = new Set(existingThreads.map((item) => item.externalId));

        for (const complaint of remoteComplaints) {
          const existingRecord = existingByExternalId.get(complaint.externalId);
          if (!existingRecord) {
            continue;
          }

          await syncExistingComplaintRecord(existingRecord, complaint);
        }

        const newComplaints = remoteComplaints
          .filter((complaint) => !existingIdSet.has(complaint.externalId))
          .slice(0, remainingCapacity);

        summary.skippedExisting += Math.max(0, remoteComplaints.length - newComplaints.length);

        for (const complaint of newComplaints) {
          let complaintRecord = null;

          try {
            complaintRecord = await createComplaintRecord({
              businessId: business.id,
              platform: integration.type,
              complaint,
            });

            summary.created += 1;
            remainingCapacity -= 1;

            if (complaint.closed) {
              summary.closed += 1;
              await delay(1000);
              continue;
            }

            if (complaintSettings.autoGenerate !== false) {
              await generateAndPersistReply({
                complaintRecord,
                complaintSettings,
                priorMessages: Array.isArray(complaint.messages) ? complaint.messages : [],
              });
              summary.generated += 1;
            }
          } catch (complaintError) {
            summary.errors += 1;

            if (complaintRecord?.id) {
              await markComplaintAsError(complaintRecord.id, complaintError.message);
            }
          }

          await delay(1000);
        }

        await prisma.integration.updateMany({
          where: { id: integration.id },
          data: { lastSync: new Date() },
        });
      } catch (integrationError) {
        summary.errors += 1;
      }
    }
  }

  summary.completedAt = new Date().toISOString();
  return summary;
}

export default processComplaintThreads;
