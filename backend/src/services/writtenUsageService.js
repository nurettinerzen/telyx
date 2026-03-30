import crypto from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  getAddOnCatalog,
  getBillingPlanDefinition,
  isWrittenChannelEnabled
} from '../config/billingCatalog.js';

const prisma = new PrismaClient();
const WRITTEN_ACTIVE_STATUSES = ['RESERVED', 'COMMITTED'];
const WRITTEN_COMMITTED_STATUSES = ['COMMITTED'];
export const WRITTEN_USAGE_BLOCK_ERROR_CODES = new Set([
  'WRITTEN_CHANNEL_DISABLED',
  'TRIAL_WRITTEN_LIMIT_REACHED',
  'INSUFFICIENT_BALANCE',
  'WRITTEN_LIMIT_REACHED',
  'SUBSCRIPTION_INACTIVE'
]);

function createUsageError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex').slice(0, 24);
}

async function runSerializableTransaction(fn, maxAttempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => fn(tx),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      lastError = error;
      if (error?.code !== 'P2034' || attempt === maxAttempts) {
        throw error;
      }
    }
  }

  throw lastError;
}

export function getWrittenUsageCycleStart(subscription) {
  if (subscription?.currentPeriodStart) {
    return new Date(subscription.currentPeriodStart);
  }

  if (subscription?.trialStartDate) {
    return new Date(subscription.trialStartDate);
  }

  return new Date(subscription?.createdAt || Date.now());
}

async function aggregateWrittenUsage(tx, subscriptionId, cycleStart, statuses) {
  const rows = await tx.writtenUsageEvent.groupBy({
    by: ['chargeType', 'channel'],
    where: {
      subscriptionId,
      createdAt: { gte: cycleStart },
      status: { in: statuses }
    },
    _sum: {
      quantity: true,
      totalCharge: true
    }
  });

  const summary = {
    totalUsed: 0,
    trialUsed: 0,
    includedUsed: 0,
    addOnUsed: 0,
    walletUsed: 0,
    overageUsed: 0,
    totalImmediateCharge: 0,
    channels: {
      CHAT: 0,
      WHATSAPP: 0,
      EMAIL: 0
    }
  };

  for (const row of rows) {
    const quantity = Number(row._sum?.quantity || 0);
    const totalCharge = Number(row._sum?.totalCharge || 0);

    summary.totalUsed += quantity;
    summary.totalImmediateCharge += totalCharge;
    summary.channels[row.channel] = (summary.channels[row.channel] || 0) + quantity;

    switch (row.chargeType) {
      case 'TRIAL':
        summary.trialUsed += quantity;
        break;
      case 'INCLUDED':
        summary.includedUsed += quantity;
        break;
      case 'ADDON':
        summary.addOnUsed += quantity;
        break;
      case 'WALLET':
        summary.walletUsed += quantity;
        break;
      case 'OVERAGE':
        summary.overageUsed += quantity;
        break;
      default:
        break;
    }
  }

  return summary;
}

export async function getWrittenUsageSummary(subscription, options = {}) {
  if (!subscription?.id) {
    return null;
  }

  const cycleStart = getWrittenUsageCycleStart(subscription);
  const billingPlan = getBillingPlanDefinition(subscription);
  const addOnCatalog = getAddOnCatalog(subscription?.business?.country || 'TR', subscription);
  const statuses = options.includeReserved ? WRITTEN_ACTIVE_STATUSES : WRITTEN_COMMITTED_STATUSES;

  const usage = await aggregateWrittenUsage(prisma, subscription.id, cycleStart, statuses);
  const configuredTotal = Number.isFinite(billingPlan.includedWrittenInteractions)
    ? Math.max(Number(billingPlan.includedWrittenInteractions), 0)
    : null;
  const addOnRemaining = Math.max(Number(subscription.writtenInteractionAddOnBalance || 0), 0);
  const totalPool = configuredTotal !== null
    ? configuredTotal + addOnRemaining
    : (addOnRemaining > 0 ? addOnRemaining : null);
  const includedConsumed = Math.min(usage.includedUsed, configuredTotal ?? usage.includedUsed);
  const remainingIncluded = configuredTotal !== null ? Math.max(configuredTotal - includedConsumed, 0) : null;

  return {
    metric: 'support_interactions',
    configured: configuredTotal !== null,
    total: configuredTotal,
    used: usage.totalUsed,
    includedUsed: usage.includedUsed,
    addOnUsed: usage.addOnUsed,
    walletUsed: usage.walletUsed,
    overage: usage.overageUsed,
    remaining: totalPool !== null ? Math.max(totalPool - usage.totalUsed, 0) : null,
    remainingIncluded,
    addOnRemaining,
    unitPrice: billingPlan.writtenInteractionUnitPrice,
    billingModel: billingPlan.billingModel,
    periodStart: cycleStart,
    channels: {
      webchat: usage.channels.CHAT || 0,
      whatsapp: usage.channels.WHATSAPP || 0,
      email: usage.channels.EMAIL || 0
    },
    availableAddOns: addOnCatalog.written,
    note: configuredTotal !== null
      ? 'SUPPORT_LIMIT_CONFIGURED'
      : (billingPlan.plan === 'ENTERPRISE'
        ? 'ENTERPRISE_SUPPORT_LIMIT_NOT_CONFIGURED'
        : 'SUPPORT_USAGE_TRACKED_WITHOUT_EXPLICIT_LIMIT')
  };
}

function determineWrittenChargePath({ billingPlan, subscription, usageSummary }) {
  if (billingPlan.plan === 'FREE') {
    throw createUsageError('WRITTEN_CHANNEL_DISABLED', 'Written usage is not enabled for this plan');
  }

  if (billingPlan.billingModel === 'trial') {
    if (billingPlan.includedWrittenInteractions !== null && usageSummary.totalUsed >= billingPlan.includedWrittenInteractions) {
      throw createUsageError('TRIAL_WRITTEN_LIMIT_REACHED', 'Trial written interaction limit reached');
    }

    return {
      chargeType: 'TRIAL',
      totalCharge: 0,
      unitPrice: 0
    };
  }

  if (billingPlan.includedWrittenInteractions !== null && usageSummary.includedUsed < billingPlan.includedWrittenInteractions) {
    return {
      chargeType: 'INCLUDED',
      totalCharge: 0,
      unitPrice: 0
    };
  }

  if (Number(subscription.writtenInteractionAddOnBalance || 0) > 0) {
    return {
      chargeType: 'ADDON',
      totalCharge: 0,
      unitPrice: 0
    };
  }

  if (billingPlan.billingModel === 'payg') {
    const totalCharge = Number(billingPlan.writtenInteractionUnitPrice || 0);
    if (Number(subscription.balance || 0) < totalCharge) {
      throw createUsageError('INSUFFICIENT_BALANCE', 'Insufficient wallet balance for written usage');
    }

    return {
      chargeType: 'WALLET',
      totalCharge,
      unitPrice: totalCharge
    };
  }

  if (billingPlan.overageAllowed?.written) {
    return {
      chargeType: 'OVERAGE',
      totalCharge: Number(billingPlan.writtenInteractionUnitPrice || 0),
      unitPrice: Number(billingPlan.writtenInteractionUnitPrice || 0)
    };
  }

  throw createUsageError('WRITTEN_LIMIT_REACHED', 'Written interaction limit reached');
}

export async function reserveWrittenInteraction({
  subscriptionId,
  channel,
  idempotencyKey,
  assistantId = null,
  metadata = {}
}) {
  if (!subscriptionId) {
    throw createUsageError('SUBSCRIPTION_REQUIRED', 'Subscription is required');
  }

  if (!idempotencyKey) {
    throw createUsageError('IDEMPOTENCY_KEY_REQUIRED', 'Written usage idempotency key is required');
  }

  const normalizedChannel = String(channel || '').trim().toUpperCase();

  try {
    return await runSerializableTransaction(async (tx) => {
      const existing = await tx.writtenUsageEvent.findUnique({
        where: { idempotencyKey }
      });

      if (existing) {
        return {
          duplicate: true,
          event: existing
        };
      }

      const subscription = await tx.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          business: {
            select: {
              id: true,
              country: true
            }
          }
        }
      });

      if (!subscription) {
        throw createUsageError('SUBSCRIPTION_NOT_FOUND', 'Subscription not found');
      }

      if (!['ACTIVE', 'TRIAL'].includes(String(subscription.status || '').toUpperCase())) {
        throw createUsageError('SUBSCRIPTION_INACTIVE', 'Subscription is not active');
      }

      if (!isWrittenChannelEnabled(subscription, normalizedChannel)) {
        throw createUsageError('WRITTEN_CHANNEL_DISABLED', `${normalizedChannel} is not enabled for this plan`);
      }

      const cycleStart = getWrittenUsageCycleStart(subscription);
      const billingPlan = getBillingPlanDefinition(subscription);
      const usageSummary = await aggregateWrittenUsage(tx, subscription.id, cycleStart, WRITTEN_ACTIVE_STATUSES);
      const charge = determineWrittenChargePath({ billingPlan, subscription, usageSummary });

      const event = await tx.writtenUsageEvent.create({
        data: {
          subscriptionId: subscription.id,
          channel: normalizedChannel,
          idempotencyKey,
          status: 'RESERVED',
          chargeType: charge.chargeType,
          quantity: 1,
          unitPrice: charge.unitPrice,
          totalCharge: charge.totalCharge,
          assistantId,
          metadata
        }
      });

      if (charge.chargeType === 'ADDON') {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            writtenInteractionAddOnBalance: {
              decrement: 1
            }
          }
        });
      }

      if (charge.chargeType === 'WALLET') {
        const balanceBefore = Number(subscription.balance || 0);
        const balanceAfter = balanceBefore - charge.totalCharge;

        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            balance: {
              decrement: charge.totalCharge
            }
          }
        });

        await tx.balanceTransaction.create({
          data: {
            subscriptionId: subscription.id,
            type: 'USAGE',
            amount: -charge.totalCharge,
            balanceBefore,
            balanceAfter,
            description: `${normalizedChannel} written interaction`
          }
        });
      }

      return {
        duplicate: false,
        event
      };
    });
  } catch (error) {
    if (error?.code === 'P2002') {
      const existing = await prisma.writtenUsageEvent.findUnique({
        where: { idempotencyKey }
      });

      if (existing) {
        return {
          duplicate: true,
          event: existing
        };
      }
    }

    throw error;
  }
}

export async function commitWrittenInteraction(idempotencyKey, metadataPatch = {}) {
  if (!idempotencyKey) return null;

  const existing = await prisma.writtenUsageEvent.findUnique({
    where: { idempotencyKey }
  });

  if (!existing) {
    return null;
  }

  if (existing.status === 'COMMITTED') {
    return existing;
  }

  const mergedMetadata = {
    ...(existing.metadata || {}),
    ...(metadataPatch || {})
  };

  return prisma.writtenUsageEvent.update({
    where: { idempotencyKey },
    data: {
      status: 'COMMITTED',
      metadata: mergedMetadata
    }
  });
}

export async function releaseWrittenInteraction(idempotencyKey, reason = 'SEND_FAILED') {
  if (!idempotencyKey) return null;

  return runSerializableTransaction(async (tx) => {
    const existing = await tx.writtenUsageEvent.findUnique({
      where: { idempotencyKey }
    });

    if (!existing) {
      return null;
    }

    if (existing.status === 'REVERSED') {
      return existing;
    }

    if (existing.status === 'COMMITTED') {
      return existing;
    }

    const subscription = await tx.subscription.findUnique({
      where: { id: existing.subscriptionId }
    });

    if (!subscription) {
      throw createUsageError('SUBSCRIPTION_NOT_FOUND', 'Subscription not found while releasing written usage');
    }

    if (existing.chargeType === 'ADDON') {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          writtenInteractionAddOnBalance: {
            increment: existing.quantity
          }
        }
      });
    }

    if (existing.chargeType === 'WALLET' && existing.totalCharge > 0) {
      const balanceBefore = Number(subscription.balance || 0);
      const balanceAfter = balanceBefore + Number(existing.totalCharge || 0);

      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          balance: {
            increment: Number(existing.totalCharge || 0)
          }
        }
      });

      await tx.balanceTransaction.create({
        data: {
          subscriptionId: subscription.id,
          type: 'REFUND',
          amount: Number(existing.totalCharge || 0),
          balanceBefore,
          balanceAfter,
          description: `Written usage release: ${reason}`
        }
      });
    }

    return tx.writtenUsageEvent.update({
      where: { idempotencyKey },
      data: {
        status: 'REVERSED',
        metadata: {
          ...(existing.metadata || {}),
          releaseReason: reason
        }
      }
    });
  });
}

export function buildChatWrittenIdempotencyKey({ subscriptionId, sessionId, turnIndex, userMessage }) {
  return `chat:${subscriptionId}:${sessionId}:${turnIndex}:${hashText(userMessage)}`;
}

export function buildWhatsappWrittenIdempotencyKey({ subscriptionId, inboundMessageId, phoneNumber }) {
  return `whatsapp:${subscriptionId}:${phoneNumber}:${inboundMessageId}`;
}

export function buildEmailWrittenIdempotencyKey({ subscriptionId, lockKey, threadId }) {
  return `email:${subscriptionId}:${threadId}:${lockKey}`;
}

export function isWrittenUsageBlockError(error) {
  return WRITTEN_USAGE_BLOCK_ERROR_CODES.has(error?.code);
}

export default {
  reserveWrittenInteraction,
  commitWrittenInteraction,
  releaseWrittenInteraction,
  getWrittenUsageSummary,
  getWrittenUsageCycleStart,
  buildChatWrittenIdempotencyKey,
  buildWhatsappWrittenIdempotencyKey,
  buildEmailWrittenIdempotencyKey,
  isWrittenUsageBlockError
};
