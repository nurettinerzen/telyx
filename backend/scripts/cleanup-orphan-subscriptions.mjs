import { PrismaClient } from '@prisma/client';

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function parseNames(value = '') {
  return value
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

const names = parseNames(getArgValue('--names') || process.env.ORPHAN_SUBSCRIPTION_NAMES || '');
const expectedCountRaw = getArgValue('--expected') || process.env.EXPECTED_ORPHAN_SUBSCRIPTION_COUNT || '';
const expectedCount = expectedCountRaw === '' ? null : Number.parseInt(expectedCountRaw, 10);
const shouldDelete = process.argv.includes('--delete') || process.env.DELETE_ORPHAN_SUBSCRIPTIONS === 'true';

if (names.length === 0) {
  console.error('At least one business name is required via --names or ORPHAN_SUBSCRIPTION_NAMES.');
  process.exit(1);
}

if (shouldDelete && (!Number.isInteger(expectedCount) || expectedCount < 0)) {
  console.error('Delete mode requires --expected or EXPECTED_ORPHAN_SUBSCRIPTION_COUNT.');
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const where = {
    OR: names.map((name) => ({
      business: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
    })),
    business: {
      deletedAt: {
        not: null,
      },
      users: {
        none: {
          deletedAt: null,
        },
      },
    },
  };

  const subscriptions = await prisma.subscription.findMany({
    where,
    include: {
      business: {
        select: {
          id: true,
          name: true,
          deletedAt: true,
          users: {
            select: {
              id: true,
              deletedAt: true,
            },
          },
        },
      },
    },
    orderBy: {
      id: 'asc',
    },
  });

  const records = subscriptions.map((subscription) => ({
    subscriptionId: subscription.id,
    businessId: subscription.businessId,
    businessName: subscription.business?.name || null,
    businessDeletedAt: subscription.business?.deletedAt || null,
    activeUsers: (subscription.business?.users || []).filter((user) => !user.deletedAt).length,
    plan: subscription.plan,
    status: subscription.status,
  }));

  console.log(JSON.stringify({
    mode: shouldDelete ? 'delete' : 'dry-run',
    requestedNames: names,
    expectedCount,
    matchCount: records.length,
    records,
  }, null, 2));

  if (shouldDelete && records.length !== expectedCount) {
    console.error(`Matched ${records.length} records, expected ${expectedCount}. Aborting delete.`);
    process.exit(1);
  }

  if (!shouldDelete) {
    process.exit(0);
  }

  const ids = records.map((record) => record.subscriptionId);
  const result = await prisma.subscription.deleteMany({
    where: {
      id: {
        in: ids,
      },
    },
  });

  console.log(JSON.stringify({
    deletedSubscriptions: result.count,
    deletedIds: ids,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
