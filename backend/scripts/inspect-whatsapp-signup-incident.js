#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CONFIG = {
  startAt: process.env.START_AT || '2026-04-12T06:00:00Z',
  endAt: process.env.END_AT || '2026-04-12T06:50:00Z',
  targetQuery: process.env.TARGET_QUERY || 'mirac ozturk',
  expandMinutes: Number.parseInt(process.env.EXPAND_MINUTES || '60', 10),
};

const TURKISH_VARIANTS = {
  c: ['c', 'ç'],
  g: ['g', 'ğ'],
  i: ['i', 'ı'],
  o: ['o', 'ö'],
  s: ['s', 'ş'],
  u: ['u', 'ü'],
};

function parseRequiredDate(value, label) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

function toUtcIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function formatInTimeZone(value, timeZone) {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(value);
}

function normalizeSearchText(value) {
  return String(value || '')
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function clip(value, maxLength = 220) {
  const normalized = String(value ?? '');
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function maskEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return email || null;
  }

  const [local, domain] = email.split('@');
  if (!local) {
    return `***@${domain}`;
  }

  const visible = local.length <= 2 ? local[0] : `${local[0]}${local[1]}`;
  return `${visible}***@${domain}`;
}

function buildTokenVariants(token, index = 0, current = '', results = new Set()) {
  if (results.size >= 32) {
    return results;
  }

  if (index >= token.length) {
    if (current) {
      results.add(current);
    }
    return results;
  }

  const char = token[index];
  const variants = TURKISH_VARIANTS[char] || [char];

  for (const variant of variants) {
    buildTokenVariants(token, index + 1, `${current}${variant}`, results);
  }

  return results;
}

function getQueryTokens(query) {
  const normalized = normalizeSearchText(query);
  if (!normalized) {
    return [];
  }

  return Array.from(new Set(normalized.split(/\s+/).filter((token) => token.length >= 2)));
}

function getSearchVariants(query) {
  const tokens = getQueryTokens(query);
  const variants = new Set();

  for (const token of tokens) {
    variants.add(token);
    for (const candidate of buildTokenVariants(token)) {
      variants.add(candidate);
    }
  }

  return Array.from(variants);
}

function matchesQuery(query, values) {
  const haystack = normalizeSearchText(values.filter(Boolean).join(' '));
  const tokens = getQueryTokens(query);

  return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
}

function buildTimeRangeFilter(startAt, endAt) {
  return {
    OR: [
      { createdAt: { gte: startAt, lte: endAt } },
      { updatedAt: { gte: startAt, lte: endAt } },
      { completedAt: { gte: startAt, lte: endAt } },
    ],
  };
}

function summarizeJson(value, depth = 0) {
  if (value == null) {
    return null;
  }

  if (typeof value === 'string') {
    return clip(value, 180);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 6).map((item) => summarizeJson(item, depth + 1));
  }

  if (typeof value !== 'object') {
    return clip(value, 180);
  }

  const entries = Object.entries(value).slice(0, depth >= 1 ? 8 : 12);
  return Object.fromEntries(entries.map(([key, item]) => [key, summarizeJson(item, depth + 1)]));
}

function summarizeTelemetry(sessionInfo) {
  const telemetry = Array.isArray(sessionInfo?.telemetry) ? sessionInfo.telemetry : [];

  return telemetry.map((entry) => ({
    atUtc: entry?.at || null,
    atTurkey: entry?.at ? formatInTimeZone(new Date(entry.at), 'Europe/Istanbul') : null,
    stage: entry?.stage || null,
    details: summarizeJson(entry?.details),
  }));
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function printJson(label, value) {
  console.log(`${label}: ${JSON.stringify(value, null, 2)}`);
}

async function main() {
  const startAt = parseRequiredDate(CONFIG.startAt, 'START_AT');
  const endAt = parseRequiredDate(CONFIG.endAt, 'END_AT');

  if (endAt <= startAt) {
    throw new Error(`END_AT must be after START_AT (got ${CONFIG.startAt} .. ${CONFIG.endAt})`);
  }

  const expandedStartAt = new Date(startAt.getTime() - CONFIG.expandMinutes * 60 * 1000);
  const expandedEndAt = new Date(endAt.getTime() + CONFIG.expandMinutes * 60 * 1000);
  const searchVariants = getSearchVariants(CONFIG.targetQuery);

  console.log('WhatsApp Embedded Signup incident investigation');
  console.log(`Target query: ${CONFIG.targetQuery}`);
  console.log(`Window (UTC): ${toUtcIso(startAt)} -> ${toUtcIso(endAt)}`);
  console.log(`Window (Turkey): ${formatInTimeZone(startAt, 'Europe/Istanbul')} -> ${formatInTimeZone(endAt, 'Europe/Istanbul')}`);
  console.log(`Expanded window (UTC): ${toUtcIso(expandedStartAt)} -> ${toUtcIso(expandedEndAt)}`);

  const candidateUsers = await prisma.user.findMany({
    where: {
      deletedAt: null,
      OR: searchVariants.flatMap((variant) => [
        { name: { contains: variant, mode: 'insensitive' } },
        { email: { contains: variant, mode: 'insensitive' } },
      ]),
    },
    select: {
      id: true,
      name: true,
      email: true,
      businessId: true,
      business: {
        select: {
          name: true,
          timezone: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  printSection('Candidate users');
  if (candidateUsers.length === 0) {
    console.log('No users matched the search query directly.');
  } else {
    printJson(
      'users',
      candidateUsers.map((user) => ({
        id: user.id,
        name: user.name,
        email: maskEmail(user.email),
        businessId: user.businessId,
        businessName: user.business?.name || null,
        businessTimezone: user.business?.timezone || null,
      }))
    );
  }

  const windowSessions = await prisma.whatsappEmbeddedSignupSession.findMany({
    where: buildTimeRangeFilter(startAt, endAt),
    select: {
      id: true,
      businessId: true,
      userId: true,
      status: true,
      configId: true,
      errorCode: true,
      errorMessage: true,
      expiresAt: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
      sessionInfo: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
      business: {
        select: {
          name: true,
          timezone: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const candidateUserIds = new Set(candidateUsers.map((user) => user.id));
  const matchedWindowSessions = windowSessions.filter((session) => {
    if (candidateUserIds.has(session.userId)) {
      return true;
    }

    return matchesQuery(CONFIG.targetQuery, [
      session.user?.name,
      session.user?.email,
      session.business?.name,
      session.errorMessage,
    ]);
  });

  const expandedUserSessions = candidateUsers.length === 0
    ? []
    : await prisma.whatsappEmbeddedSignupSession.findMany({
      where: {
        userId: { in: candidateUsers.map((user) => user.id) },
        ...buildTimeRangeFilter(expandedStartAt, expandedEndAt),
      },
      select: {
        id: true,
        businessId: true,
        userId: true,
        status: true,
        configId: true,
        errorCode: true,
        errorMessage: true,
        expiresAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        sessionInfo: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        business: {
          select: {
            name: true,
            timezone: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

  const focusSessions = matchedWindowSessions.length > 0
    ? matchedWindowSessions
    : expandedUserSessions;

  printSection('Sessions in target window');
  printJson(
    'sessions',
    windowSessions.map((session) => ({
      id: session.id,
      userId: session.userId,
      userName: session.user?.name || null,
      userEmail: maskEmail(session.user?.email),
      businessId: session.businessId,
      businessName: session.business?.name || null,
      status: session.status,
      errorCode: session.errorCode,
      errorMessage: clip(session.errorMessage, 220),
      createdAtUtc: toUtcIso(session.createdAt),
      createdAtTurkey: formatInTimeZone(session.createdAt, 'Europe/Istanbul'),
      updatedAtUtc: toUtcIso(session.updatedAt),
      updatedAtTurkey: formatInTimeZone(session.updatedAt, 'Europe/Istanbul'),
      completedAtUtc: session.completedAt ? toUtcIso(session.completedAt) : null,
      telemetryStages: summarizeTelemetry(session.sessionInfo).map((entry) => entry.stage),
    }))
  );

  printSection('Focus sessions');
  if (focusSessions.length === 0) {
    console.log('No WhatsApp Embedded Signup sessions were found for the target user in the window or expanded window.');
  } else {
    for (const session of focusSessions) {
      const sessionInfo = session.sessionInfo && typeof session.sessionInfo === 'object' ? session.sessionInfo : {};
      const summary = {
        id: session.id,
        userId: session.userId,
        userName: session.user?.name || null,
        userEmail: maskEmail(session.user?.email),
        businessId: session.businessId,
        businessName: session.business?.name || null,
        businessTimezone: session.business?.timezone || null,
        status: session.status,
        errorCode: session.errorCode,
        errorMessage: session.errorMessage,
        createdAtUtc: toUtcIso(session.createdAt),
        createdAtTurkey: formatInTimeZone(session.createdAt, 'Europe/Istanbul'),
        updatedAtUtc: toUtcIso(session.updatedAt),
        updatedAtTurkey: formatInTimeZone(session.updatedAt, 'Europe/Istanbul'),
        completedAtUtc: session.completedAt ? toUtcIso(session.completedAt) : null,
        expiresAtUtc: toUtcIso(session.expiresAt),
        sessionMilestones: {
          initiatedAt: sessionInfo?.initiatedAt || null,
          processingAt: sessionInfo?.processingAt || null,
          failedAt: sessionInfo?.failedAt || null,
          cancelledAt: sessionInfo?.cancelledAt || null,
          completedAt: sessionInfo?.completedAt || null,
        },
        telemetry: summarizeTelemetry(sessionInfo),
        completionResult: summarizeJson(sessionInfo?.completionResult || null),
        cancelPayload: summarizeJson(sessionInfo?.cancelPayload || null),
        completionPayload: summarizeJson(sessionInfo?.completionPayload || null),
      };

      printJson(`session ${session.id}`, summary);
    }
  }

  const focusBusinessIds = Array.from(new Set(focusSessions.map((session) => session.businessId)));
  const focusUserIds = Array.from(new Set(focusSessions.map((session) => session.userId)));

  if (focusBusinessIds.length > 0 || focusUserIds.length > 0) {
    const relatedErrorLogs = await prisma.errorLog.findMany({
      where: {
        createdAt: { gte: expandedStartAt, lte: expandedEndAt },
        OR: [
          focusBusinessIds.length > 0 ? { businessId: { in: focusBusinessIds } } : undefined,
          focusUserIds.length > 0 ? { userId: { in: focusUserIds } } : undefined,
          { endpoint: { contains: '/api/integrations/whatsapp', mode: 'insensitive' } },
          { source: { contains: 'whatsapp', mode: 'insensitive' } },
          { message: { contains: 'whatsapp', mode: 'insensitive' } },
        ].filter(Boolean),
      },
      select: {
        id: true,
        category: true,
        severity: true,
        errorCode: true,
        message: true,
        source: true,
        endpoint: true,
        method: true,
        businessId: true,
        userId: true,
        externalService: true,
        externalStatus: true,
        createdAt: true,
        lastSeenAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    printSection('Related ErrorLog entries');
    if (relatedErrorLogs.length === 0) {
      console.log('No related ErrorLog rows were found in the expanded window.');
    } else {
      printJson(
        'errorLogs',
        relatedErrorLogs.map((entry) => ({
          id: entry.id,
          category: entry.category,
          severity: entry.severity,
          errorCode: entry.errorCode,
          message: clip(entry.message, 220),
          source: entry.source,
          endpoint: entry.endpoint,
          method: entry.method,
          businessId: entry.businessId,
          userId: entry.userId,
          externalService: entry.externalService,
          externalStatus: entry.externalStatus,
          createdAtUtc: toUtcIso(entry.createdAt),
          createdAtTurkey: formatInTimeZone(entry.createdAt, 'Europe/Istanbul'),
          lastSeenAtUtc: toUtcIso(entry.lastSeenAt),
        }))
      );
    }
  }

  const probableFailure = focusSessions.find((session) => session.status === 'ERROR')
    || focusSessions.find((session) => summarizeTelemetry(session.sessionInfo).some((entry) => entry.stage === 'completion_timeout'))
    || focusSessions[0]
    || null;

  printSection('Likely root cause');
  if (!probableFailure) {
    console.log('No direct failure record was found for the target user in the inspected time range.');
  } else {
    const telemetry = summarizeTelemetry(probableFailure.sessionInfo);
    const timeoutTelemetry = telemetry.find((entry) => entry.stage === 'completion_timeout');
    const finishTelemetry = telemetry.find((entry) => entry.stage === 'finish_event_received');

    const diagnosis = {
      sessionId: probableFailure.id,
      status: probableFailure.status,
      errorCode: probableFailure.errorCode || (timeoutTelemetry ? 'META_AUTH_CODE_MISSING' : null),
      errorMessage: probableFailure.errorMessage || (timeoutTelemetry
        ? 'Meta signup flow completed, but authorization code did not return to Telyx.'
        : null),
      createdAtUtc: toUtcIso(probableFailure.createdAt),
      updatedAtUtc: toUtcIso(probableFailure.updatedAt),
      finishEventSeen: Boolean(finishTelemetry),
      completionTimeoutSeen: Boolean(timeoutTelemetry),
      telemetryStages: telemetry.map((entry) => entry.stage),
    };

    printJson('diagnosis', diagnosis);
  }
}

main()
  .catch((error) => {
    console.error(`Incident inspection failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
