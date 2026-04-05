import prisma from '../config/database.js';
import { isFeatureEnabled } from '../config/feature-flags.js';
import { getState, updateState } from './state-manager.js';

export const HANDOFF_MODE = Object.freeze({
  AI: 'AI',
  REQUESTED: 'REQUESTED',
  ACTIVE: 'ACTIVE',
});

export const SUPPORT_OFFER_MODE = Object.freeze({
  CHOICE: 'choice',
  CALLBACK_ONLY: 'callback_only',
});

const BUSINESS_HOUR_DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const HUMAN_HANDOFF_PATTERNS = [
  /\byetkili\s+biri(?:yle)?\s+g[öo]r[üu](?:ş|s|se|şe|use|üşe)(?:mek|mek\s+istiyorum|ebil(?:ir)?(?:\s+m[ıi]y[ıi]m)?|elim)?\b/i,
  /\bm[üu]şteri\s+temsilcisi(?:yle)?\s+g[öo]r[üu](?:ş|s|se|şe|use|üşe)(?:mek|mek\s+istiyorum|ebil(?:ir)?(?:\s+m[ıi]y[ıi]m)?|elim)?\b/i,
  /\bcanli\s+(bir\s+)?(destek|temsilci|yetkili|insan)\b/i,
  /\bcanl[ıi]\s+(bir\s+)?(destek|temsilci|yetkili|insan)\b/i,
  /\bmusteri\s+temsilcisi\b/i,
  /\bm[üu]şteri\s+temsilcisi\b/i,
  /\byetkiliyle?\s+gorus/i,
  /\byetkiliyle?\s+g[öo]r[üu][sş]/i,
  /\binsan(?:la)?\s+gorus/i,
  /\binsan(?:la)?\s+g[öo]r[üu][sş]/i,
  /\btemsilci(?:yle)?\s+gorus/i,
  /\btemsilci(?:yle)?\s+g[öo]r[üu][sş]/i,
  /\bcanli\s+biri(?:yle)?\s+gorus/i,
  /\bcanl[ıi]\s+biri(?:yle)?\s+g[öo]r[üu][sş]/i,
  /\boperat[öo]re?\s+bağla(?:r\s+m[ıi]s[ıi]n)?\b/i,
  /\boperatore?\s+bagla(?:r\s+misin)?\b/i,
  /\boperat[öo]re?\s+aktar\b/i,
  /\btemsilciye?\s+bağla(?:r\s+m[ıi]s[ıi]n)?\b/i,
  /\btemsilciye?\s+bagla(?:r\s+misin)?\b/i,
  /\btemsilciye?\s+aktar\b/i,
  /\bcanl[ıi]\s+deste[ğg]e?\s+bağla(?:r\s+m[ıi]s[ıi]n)?\b/i,
  /\bcanli\s+destege?\s+bagla(?:r\s+misin)?\b/i,
  /\bcanl[ıi]\s+deste[ğg]e?\s+aktar\b/i,
  /\bbeni\s+birine\s+bagla/i,
  /\bhuman\b.*\b(agent|support|representative)\b/i,
  /\blive\s+(agent|support|representative)\b/i,
  /\breal\s+person\b/i,
  /\bconnect\s+me\s+to\s+(a\s+)?(human|person|agent|representative)\b/i,
  /\bi\s+want\s+to\s+talk\s+to\s+(a\s+)?(human|person|agent|representative)\b/i,
];

function buildNowIso() {
  return new Date().toISOString();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSupportOfferMode(value) {
  return value === SUPPORT_OFFER_MODE.CALLBACK_ONLY
    ? SUPPORT_OFFER_MODE.CALLBACK_ONLY
    : SUPPORT_OFFER_MODE.CHOICE;
}

function parseTimeToMinutes(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

function getLocalDateParts(timezone = 'Europe/Istanbul', now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const weekday = parts.find((part) => part.type === 'weekday')?.value?.toLowerCase() || 'monday';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);

  const dayKey = BUSINESS_HOUR_DAY_KEYS.includes(weekday) ? weekday : 'monday';
  return {
    dayKey,
    currentMinutes: (hour * 60) + minute,
    localTimeLabel: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

function normalizeDaySchedule(rawValue) {
  if (!isPlainObject(rawValue)) {
    return {
      open: '09:00',
      close: '17:00',
      closed: false,
    };
  }

  return {
    open: typeof rawValue.open === 'string' ? rawValue.open : '09:00',
    close: typeof rawValue.close === 'string' ? rawValue.close : '17:00',
    closed: rawValue.closed === true,
  };
}

export function getNormalizedHandoffState(state = {}) {
  const handoff = isPlainObject(state?.humanHandoff) ? state.humanHandoff : {};
  const mode = Object.values(HANDOFF_MODE).includes(handoff.mode) ? handoff.mode : HANDOFF_MODE.AI;

  return {
    mode,
    requestedAt: handoff.requestedAt || null,
    requestedBy: handoff.requestedBy || null,
    requestedReason: handoff.requestedReason || null,
    assignedUserId: Number.isInteger(handoff.assignedUserId) ? handoff.assignedUserId : null,
    assignedUserName: handoff.assignedUserName || null,
    claimedAt: handoff.claimedAt || null,
    releasedAt: handoff.releasedAt || null,
    lastHumanMessageAt: handoff.lastHumanMessageAt || null,
    lastCustomerAckAt: handoff.lastCustomerAckAt || null,
  };
}

export function buildHandoffView(state = {}, viewerUserId = null) {
  const handoff = getNormalizedHandoffState(state);
  const currentUserIsAssignee = handoff.assignedUserId !== null && viewerUserId === handoff.assignedUserId;

  return {
    ...handoff,
    active: handoff.mode !== HANDOFF_MODE.AI,
    currentUserIsAssignee,
    canClaim: handoff.mode !== HANDOFF_MODE.ACTIVE || currentUserIsAssignee,
    canReply: handoff.mode === HANDOFF_MODE.ACTIVE && currentUserIsAssignee,
    canReturnToAi: handoff.mode === HANDOFF_MODE.ACTIVE && currentUserIsAssignee,
  };
}

export function getSupportRoutingState(state = {}) {
  const supportRouting = isPlainObject(state?.supportRouting) ? state.supportRouting : {};

  return {
    pendingChoice: supportRouting.pendingChoice === true,
    offerMode: normalizeSupportOfferMode(supportRouting.offerMode),
    liveSupportAvailable: supportRouting.liveSupportAvailable === false ? false : true,
    askedAt: supportRouting.askedAt || null,
    reason: supportRouting.reason || null,
  };
}

export function shouldTriggerHumanHandoff(message = '') {
  const text = String(message || '').trim();
  if (!text) return false;
  return HUMAN_HANDOFF_PATTERNS.some((pattern) => pattern.test(text));
}

export function isWhatsAppLiveHandoffEnabled() {
  return isFeatureEnabled('WHATSAPP_LIVE_HANDOFF_V2');
}

export function isChatLiveHandoffEnabled() {
  return isFeatureEnabled('CHAT_LIVE_HANDOFF_V1');
}

export function isLiveHandoffEnabledForChannel(channel = '') {
  if (channel === 'WHATSAPP') return isWhatsAppLiveHandoffEnabled();
  if (channel === 'CHAT') return isChatLiveHandoffEnabled();
  return false;
}

export function getLiveHandoffClaimedMessage(language = 'TR', actorName = null) {
  if (String(language || 'TR').toUpperCase() === 'EN') {
    return 'A live support teammate has joined this conversation and will assist you from here.';
  }

  return 'Canli destek ekibimiz bu konuşmayı devraldı ve buradan size yardımcı olacak.';
}

export function getLiveHandoffReturnedToAiMessage(language = 'TR') {
  return String(language || 'TR').toUpperCase() === 'EN'
    ? 'This conversation has been handed back to our AI assistant. You can keep replying in this thread.'
    : 'Bu konuşma tekrar yapay zeka asistanımıza devredildi. Aynı yazışma üzerinden devam edebilirsiniz.';
}

export function getLiveHandoffAcknowledgementMessage(language = 'TR') {
  return String(language || 'TR').toUpperCase() === 'EN'
    ? 'A teammate will take over this conversation shortly. Please stay in this thread.'
    : 'Bir temsilcimiz bu konuşmayı birazdan devralacak. Lütfen bu konuşmada kalın.';
}

export function getLiveSupportClarifyMessage(language = 'TR') {
  return String(language || 'TR').toUpperCase() === 'EN'
    ? 'I can connect you to a live teammate now, or I can create a callback request for later. Which would you prefer?'
    : 'Sizi isterseniz şimdi canlı bir temsilciye bağlayabilirim, isterseniz geri arama talebi oluşturabilirim. Hangisini tercih edersiniz?';
}

export function getLiveSupportUnavailableMessage(language = 'TR') {
  return String(language || 'TR').toUpperCase() === 'EN'
    ? 'Our live support team does not appear to be available right now. If you want, I can create a callback request for you.'
    : 'Canlı destek ekibimiz şu an müsait görünmüyor. İsterseniz sizin için geri arama talebi oluşturabilirim.';
}

export function getWhatsappCallbackCollectionMessage(language = 'TR') {
  return String(language || 'TR').toUpperCase() === 'EN'
    ? 'Sure. To create a callback request, may I have your name? I already have your phone number from this WhatsApp conversation.'
    : 'Tabii. Geri arama talebi oluşturmam için adınızı paylaşır mısınız? Telefon numaranızı bu WhatsApp konuşmasından alıyorum.';
}

function buildUpdatedState(baseState = {}, handoffUpdate = {}) {
  const current = getNormalizedHandoffState(baseState);
  return {
    ...baseState,
    humanHandoff: {
      ...current,
      ...handoffUpdate,
    },
  };
}

export async function requestHumanHandoff({
  sessionId,
  businessId,
  requestedBy = 'customer',
  requestedReason = 'customer_requested_human',
  currentState = null,
}) {
  const state = currentState || await getState(sessionId);
  const existing = getNormalizedHandoffState(state);
  const now = buildNowIso();

  if (existing.mode === HANDOFF_MODE.REQUESTED || existing.mode === HANDOFF_MODE.ACTIVE) {
    return existing;
  }

  const nextState = buildUpdatedState(state, {
    mode: HANDOFF_MODE.REQUESTED,
    requestedAt: now,
    requestedBy,
    requestedReason,
    assignedUserId: null,
    assignedUserName: null,
    claimedAt: null,
    releasedAt: null,
  });

  nextState.businessId = businessId;

  await updateState(sessionId, {
    businessId,
    messageCount: state.messageCount || 0,
    humanHandoff: nextState.humanHandoff,
  });

  return getNormalizedHandoffState(nextState);
}

export async function setSupportRoutingPending({
  sessionId,
  businessId,
  offerMode = SUPPORT_OFFER_MODE.CHOICE,
  liveSupportAvailable = true,
  reason = 'support_preference_requested',
  currentState = null,
}) {
  const state = currentState || await getState(sessionId);

  await updateState(sessionId, {
    businessId,
    messageCount: state.messageCount || 0,
    supportRouting: {
      pendingChoice: true,
      offerMode: normalizeSupportOfferMode(offerMode),
      liveSupportAvailable: liveSupportAvailable !== false,
      askedAt: buildNowIso(),
      reason,
    },
  });

  return getSupportRoutingState({
    ...state,
    supportRouting: {
      pendingChoice: true,
      offerMode: normalizeSupportOfferMode(offerMode),
      liveSupportAvailable: liveSupportAvailable !== false,
      askedAt: buildNowIso(),
      reason,
    },
  });
}

export async function clearSupportRoutingState({
  sessionId,
  businessId,
  currentState = null,
}) {
  const state = currentState || await getState(sessionId);

  await updateState(sessionId, {
    businessId,
    messageCount: state.messageCount || 0,
    supportRouting: {
      pendingChoice: false,
      offerMode: SUPPORT_OFFER_MODE.CHOICE,
      liveSupportAvailable: true,
      askedAt: null,
      reason: null,
    },
  });

  return getSupportRoutingState({
    ...state,
    supportRouting: {
      pendingChoice: false,
      offerMode: SUPPORT_OFFER_MODE.CHOICE,
      liveSupportAvailable: true,
      askedAt: null,
      reason: null,
    },
  });
}

export async function claimHumanHandoff({
  sessionId,
  businessId,
  userId,
  userName,
  currentState = null,
}) {
  const state = currentState || await getState(sessionId);
  const existing = getNormalizedHandoffState(state);

  if (existing.mode === HANDOFF_MODE.ACTIVE && existing.assignedUserId && existing.assignedUserId !== userId) {
    const conflict = new Error('This conversation is already claimed by another teammate');
    conflict.statusCode = 409;
    throw conflict;
  }

  const now = buildNowIso();
  const nextState = buildUpdatedState(state, {
    mode: HANDOFF_MODE.ACTIVE,
    requestedAt: existing.requestedAt || now,
    requestedBy: existing.requestedBy || 'operator',
    requestedReason: existing.requestedReason || 'operator_claimed',
    assignedUserId: userId,
    assignedUserName: userName || null,
    claimedAt: existing.claimedAt || now,
    releasedAt: null,
  });

  nextState.businessId = businessId;

  await updateState(sessionId, {
    businessId,
    messageCount: state.messageCount || 0,
    humanHandoff: nextState.humanHandoff,
  });

  return getNormalizedHandoffState(nextState);
}

export async function returnConversationToAi({
  sessionId,
  businessId,
  userId,
  currentState = null,
}) {
  const state = currentState || await getState(sessionId);
  const existing = getNormalizedHandoffState(state);

  if (existing.mode === HANDOFF_MODE.ACTIVE && existing.assignedUserId && existing.assignedUserId !== userId) {
    const conflict = new Error('Only the teammate who claimed this conversation can return it to AI');
    conflict.statusCode = 409;
    throw conflict;
  }

  const nextState = buildUpdatedState(state, {
    mode: HANDOFF_MODE.AI,
    assignedUserId: null,
    assignedUserName: null,
    claimedAt: null,
    releasedAt: buildNowIso(),
  });

  nextState.businessId = businessId;

  await updateState(sessionId, {
    businessId,
    messageCount: state.messageCount || 0,
    humanHandoff: nextState.humanHandoff,
  });

  return getNormalizedHandoffState(nextState);
}

export async function noteHumanReply({
  sessionId,
  businessId,
  userId,
  userName,
  currentState = null,
}) {
  const state = currentState || await getState(sessionId);
  const existing = getNormalizedHandoffState(state);

  if (existing.mode !== HANDOFF_MODE.ACTIVE || existing.assignedUserId !== userId) {
    const conflict = new Error('Only the active assignee can send a live handoff reply');
    conflict.statusCode = 409;
    throw conflict;
  }

  const nextState = buildUpdatedState(state, {
    mode: HANDOFF_MODE.ACTIVE,
    assignedUserId: userId,
    assignedUserName: userName || existing.assignedUserName || null,
    lastHumanMessageAt: buildNowIso(),
  });

  nextState.businessId = businessId;

  await updateState(sessionId, {
    businessId,
    messageCount: state.messageCount || 0,
    humanHandoff: nextState.humanHandoff,
  });

  return getNormalizedHandoffState(nextState);
}

export async function getLiveSupportAvailability({
  businessId,
  timezone = 'Europe/Istanbul',
  now = new Date(),
}) {
  if (!businessId) {
    return {
      available: true,
      source: 'default',
      reason: 'missing_business',
      dayKey: null,
      localTimeLabel: null,
    };
  }

  const hours = await prisma.businessHours.findUnique({
    where: { businessId },
    select: {
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: true,
      sunday: true,
    }
  });

  if (!hours) {
    return {
      available: true,
      source: 'default',
      reason: 'hours_missing',
      dayKey: null,
      localTimeLabel: null,
    };
  }

  const { dayKey, currentMinutes, localTimeLabel } = getLocalDateParts(timezone, now);
  const schedule = normalizeDaySchedule(hours?.[dayKey]);
  if (schedule.closed) {
    return {
      available: false,
      source: 'business_hours',
      reason: 'closed_day',
      dayKey,
      localTimeLabel,
      open: schedule.open,
      close: schedule.close,
    };
  }

  const openMinutes = parseTimeToMinutes(schedule.open);
  const closeMinutes = parseTimeToMinutes(schedule.close);
  if (!Number.isInteger(openMinutes) || !Number.isInteger(closeMinutes) || closeMinutes <= openMinutes) {
    return {
      available: true,
      source: 'fallback_invalid_hours',
      reason: 'invalid_schedule',
      dayKey,
      localTimeLabel,
      open: schedule.open,
      close: schedule.close,
    };
  }

  const available = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  return {
    available,
    source: 'business_hours',
    reason: available ? 'open_now' : 'outside_hours',
    dayKey,
    localTimeLabel,
    open: schedule.open,
    close: schedule.close,
  };
}

export async function appendChatLogMessages({
  sessionId,
  businessId,
  channel = 'WHATSAPP',
  assistantId = null,
  customerPhone = null,
  messages = [],
}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return prisma.chatLog.findUnique({ where: { sessionId } });
  }

  const normalizedMessages = messages.map((message) => ({
    ...message,
    timestamp: message.timestamp || buildNowIso(),
  }));

  const existing = await prisma.chatLog.findUnique({
    where: { sessionId },
    select: {
      assistantId: true,
      businessId: true,
      channel: true,
      customerPhone: true,
      messages: true,
      status: true,
    }
  });

  const currentMessages = Array.isArray(existing?.messages) ? existing.messages : [];
  const updatedMessages = [...currentMessages, ...normalizedMessages];

  return prisma.chatLog.upsert({
    where: { sessionId },
    update: {
      messages: updatedMessages,
      customerPhone: existing?.customerPhone || customerPhone || null,
      messageCount: updatedMessages.length,
      status: existing?.status || 'active',
      updatedAt: new Date(),
    },
    create: {
      sessionId,
      businessId: existing?.businessId || businessId,
      assistantId: existing?.assistantId || assistantId,
      channel: existing?.channel || channel,
      customerPhone: existing?.customerPhone || customerPhone,
      messages: updatedMessages,
      messageCount: updatedMessages.length,
      status: existing?.status || 'active',
    }
  });
}

export function buildSystemEventMessage(content, metadata = {}) {
  return {
    role: 'system',
    content,
    metadata,
    timestamp: buildNowIso(),
  };
}
