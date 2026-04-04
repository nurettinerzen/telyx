import prisma from '../config/database.js';
import { getState, updateState } from './state-manager.js';

export const HANDOFF_MODE = Object.freeze({
  AI: 'AI',
  REQUESTED: 'REQUESTED',
  ACTIVE: 'ACTIVE',
});

const HUMAN_HANDOFF_PATTERNS = [
  /\bcanli\s+(bir\s+)?(destek|temsilci|yetkili|insan)\b/i,
  /\bmusteri\s+temsilcisi\b/i,
  /\byetkiliyle?\s+gorus/i,
  /\binsan(?:la)?\s+gorus/i,
  /\btemsilci(?:yle)?\s+gorus/i,
  /\bcanli\s+biri(?:yle)?\s+gorus/i,
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

export function shouldTriggerHumanHandoff(message = '') {
  const text = String(message || '').trim();
  if (!text) return false;
  return HUMAN_HANDOFF_PATTERNS.some((pattern) => pattern.test(text));
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
