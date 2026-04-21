import prisma from '../../prismaClient.js';
import { generateMarketplaceAnswer } from './qaAnswerGenerator.js';
import { getMarketplaceServiceForPlatform } from './platformClients.js';
import {
  MARKETPLACE_ANSWER_MODE,
  MARKETPLACE_PLATFORM,
  MARKETPLACE_QUESTION_STATUS,
  buildMarketplaceCredentials,
  decryptMarketplaceCredentials,
  delay,
  getMarketplaceQaAutomationEnabled,
  isExpired,
} from './qaShared.js';

const SUPPORTED_MARKETPLACE_TYPES = [
  MARKETPLACE_PLATFORM.TRENDYOL,
  MARKETPLACE_PLATFORM.HEPSIBURADA,
];

const MAX_QUESTIONS_PER_BUSINESS_PER_RUN = 20;

function isModerationError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('yasak')
    || message.includes('uygunsuz')
    || message.includes('forbidden')
    || message.includes('reject')
  );
}

function normalizeRuntimeCredentials(integration, businessLanguage) {
  return decryptMarketplaceCredentials(integration.credentials, businessLanguage);
}

async function createMarketplaceQuestionRecord({
  businessId,
  platform,
  qaSettings,
  question,
}) {
  return prisma.marketplaceQuestion.create({
    data: {
      businessId,
      platform,
      externalId: question.externalId,
      productName: question.productName,
      productBarcode: question.productBarcode,
      productUrl: question.productUrl,
      productImageUrl: question.productImageUrl,
      customerName: question.customerName,
      questionText: question.questionText,
      status: isExpired(question.expiresAt)
        ? MARKETPLACE_QUESTION_STATUS.EXPIRED
        : MARKETPLACE_QUESTION_STATUS.PENDING,
      answerMode: qaSettings.answerMode || MARKETPLACE_ANSWER_MODE.MANUAL,
      platformStatus: question.platformStatus,
      expiresAt: question.expiresAt || null,
      answeredAt: question.answeredAt || null,
    },
  });
}

async function markQuestionAsError(questionId, errorMessage) {
  await prisma.marketplaceQuestion.update({
    where: { id: questionId },
    data: {
      status: MARKETPLACE_QUESTION_STATUS.ERROR,
      errorMessage: String(errorMessage || 'Bilinmeyen hata').slice(0, 2000),
    },
  });
}

async function generateAndPersistAnswer({
  questionRecord,
  qaSettings,
}) {
  const generated = await generateMarketplaceAnswer({
    businessId: questionRecord.businessId,
    platform: questionRecord.platform,
    questionText: questionRecord.questionText,
    productName: questionRecord.productName,
    qaSettings,
  });

  return prisma.marketplaceQuestion.update({
    where: { id: questionRecord.id },
    data: {
      generatedAnswer: generated.answer,
      errorMessage: null,
    },
  });
}

async function autoPostIfAllowed({
  questionRecord,
  qaSettings,
}) {
  const autoPostingEnabled = getMarketplaceQaAutomationEnabled();
  if (!autoPostingEnabled || qaSettings.answerMode !== MARKETPLACE_ANSWER_MODE.AUTO) {
    return { autoPosted: false };
  }

  const service = getMarketplaceServiceForPlatform(questionRecord.platform);
  const answerText = questionRecord.generatedAnswer || questionRecord.finalAnswer;

  if (!answerText) {
    return { autoPosted: false };
  }

  const postResult = await service.postAnswer(
    questionRecord.businessId,
    questionRecord.externalId,
    answerText
  );

  await prisma.marketplaceQuestion.update({
    where: { id: questionRecord.id },
    data: {
      status: MARKETPLACE_QUESTION_STATUS.POSTED,
      finalAnswer: answerText,
      postedAt: new Date(),
      answeredAt: new Date(),
      platformStatus: questionRecord.platform === MARKETPLACE_PLATFORM.HEPSIBURADA
        ? 'Answered'
        : 'ANSWERED',
      errorMessage: null,
    },
  });

  return { autoPosted: true, postResult };
}

export async function processMarketplaceQuestions(options = {}) {
  const targetBusinessId = options?.businessId || null;
  const summary = {
    startedAt: new Date().toISOString(),
    targetBusinessId,
    businessesProcessed: 0,
    integrationsProcessed: 0,
    fetched: 0,
    created: 0,
    generated: 0,
    skippedExisting: 0,
    expired: 0,
    autoPosted: 0,
    errors: 0,
  };

  const businesses = await prisma.business.findMany({
    where: {
      ...(targetBusinessId ? { id: targetBusinessId } : {}),
      integrations: {
        some: {
          type: { in: SUPPORTED_MARKETPLACE_TYPES },
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
          type: { in: SUPPORTED_MARKETPLACE_TYPES },
          connected: true,
          isActive: true,
        },
        select: {
          type: true,
          credentials: true,
          businessId: true,
        },
      },
    },
  });

  for (const business of businesses) {
    let remainingCapacity = MAX_QUESTIONS_PER_BUSINESS_PER_RUN;
    summary.businessesProcessed += 1;

    for (const integration of business.integrations) {
      if (remainingCapacity <= 0) {
        break;
      }

      summary.integrationsProcessed += 1;
      const runtimeCredentials = normalizeRuntimeCredentials(integration, business.language);
      const qaSettings = buildMarketplaceCredentials(runtimeCredentials, business.language).qaSettings;
      const service = getMarketplaceServiceForPlatform(integration.type, runtimeCredentials);

      try {
        const remoteQuestions = await service.fetchUnansweredQuestions(business.id, {
          size: Math.min(remainingCapacity, 50),
        });
        summary.fetched += remoteQuestions.length;

        const externalIds = remoteQuestions
          .map((question) => question.externalId)
          .filter(Boolean);

        const existingQuestions = externalIds.length > 0
          ? await prisma.marketplaceQuestion.findMany({
              where: {
                businessId: business.id,
                platform: integration.type,
                externalId: { in: externalIds },
              },
              select: { externalId: true },
            })
          : [];

        const existingIdSet = new Set(existingQuestions.map((item) => item.externalId));
        const newQuestions = remoteQuestions
          .filter((question) => !existingIdSet.has(question.externalId))
          .slice(0, remainingCapacity);

        summary.skippedExisting += Math.max(0, remoteQuestions.length - newQuestions.length);

        for (const question of newQuestions) {
          let questionRecord = null;
          try {
            questionRecord = await createMarketplaceQuestionRecord({
              businessId: business.id,
              platform: integration.type,
              qaSettings,
              question,
            });

            summary.created += 1;
            remainingCapacity -= 1;

            if (questionRecord.status === MARKETPLACE_QUESTION_STATUS.EXPIRED) {
              summary.expired += 1;
              await delay(1000);
              continue;
            }

            const updatedQuestion = await generateAndPersistAnswer({
              questionRecord,
              qaSettings,
            });
            summary.generated += 1;

            try {
              const autoPostResult = await autoPostIfAllowed({
                questionRecord: updatedQuestion,
                qaSettings,
              });

              if (autoPostResult.autoPosted) {
                summary.autoPosted += 1;
              }
            } catch (postError) {
              summary.errors += 1;
              const message = isModerationError(postError)
                ? `Pazaryeri moderasyon reddi: ${postError.message}`
                : postError.message;
              await markQuestionAsError(questionRecord.id, message);
            }
          } catch (questionError) {
            summary.errors += 1;
            if (questionRecord?.id) {
              await markQuestionAsError(questionRecord.id, questionError.message);
            }
            if (questionError?.code !== 'P2002') {
              console.error('Marketplace question processing error:', questionError);
            }
          }

          await delay(1000);
        }
      } catch (integrationError) {
        summary.errors += 1;
        console.error(`Marketplace sync failed for ${integration.type} / business ${business.id}:`, integrationError);
      } finally {
        await prisma.integration.updateMany({
          where: {
            businessId: business.id,
            type: integration.type,
          },
          data: {
            lastSync: new Date(),
          },
        });
      }
    }
  }

  summary.completedAt = new Date().toISOString();
  return summary;
}

export default processMarketplaceQuestions;
