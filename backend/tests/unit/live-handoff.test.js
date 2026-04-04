import { describe, expect, it, beforeEach, jest } from '@jest/globals';

const getStateMock = jest.fn();
const updateStateMock = jest.fn();
const chatLogFindUniqueMock = jest.fn();
const chatLogUpsertMock = jest.fn();

await jest.unstable_mockModule('../../src/services/state-manager.js', () => ({
  getState: getStateMock,
  updateState: updateStateMock,
}));

await jest.unstable_mockModule('../../src/config/database.js', () => ({
  default: {
    chatLog: {
      findUnique: chatLogFindUniqueMock,
      upsert: chatLogUpsertMock,
    },
  },
}));

const {
  HANDOFF_MODE,
  appendChatLogMessages,
  buildHandoffView,
  claimHumanHandoff,
  requestHumanHandoff,
  returnConversationToAi,
  shouldTriggerHumanHandoff,
} = await import('../../src/services/liveHandoff.js');

describe('liveHandoff service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('detects explicit human handoff phrases in Turkish and English', () => {
    expect(shouldTriggerHumanHandoff('Canli destek almak istiyorum')).toBe(true);
    expect(shouldTriggerHumanHandoff('I want to talk to a human agent')).toBe(true);
    expect(shouldTriggerHumanHandoff('siparisim nerede')).toBe(false);
  });

  it('creates a REQUESTED handoff when customer asks for live support', async () => {
    getStateMock.mockResolvedValueOnce({
      sessionId: 'sess_1',
      businessId: 12,
      messageCount: 4,
    });

    const handoff = await requestHumanHandoff({
      sessionId: 'sess_1',
      businessId: 12,
      requestedBy: 'customer',
    });

    expect(handoff.mode).toBe(HANDOFF_MODE.REQUESTED);
    expect(handoff.requestedBy).toBe('customer');
    expect(updateStateMock).toHaveBeenCalledWith(
      'sess_1',
      expect.objectContaining({
        businessId: 12,
        messageCount: 4,
        humanHandoff: expect.objectContaining({
          mode: HANDOFF_MODE.REQUESTED,
          requestedBy: 'customer',
        }),
      })
    );
  });

  it('claims a requested conversation for the active teammate', async () => {
    getStateMock.mockResolvedValueOnce({
      sessionId: 'sess_2',
      businessId: 44,
      messageCount: 2,
      humanHandoff: {
        mode: HANDOFF_MODE.REQUESTED,
        requestedBy: 'customer',
      },
    });

    const handoff = await claimHumanHandoff({
      sessionId: 'sess_2',
      businessId: 44,
      userId: 7,
      userName: 'Ada',
    });

    expect(handoff.mode).toBe(HANDOFF_MODE.ACTIVE);
    expect(handoff.assignedUserId).toBe(7);
    expect(handoff.assignedUserName).toBe('Ada');
  });

  it('rejects claim attempts from another teammate when already active', async () => {
    getStateMock.mockResolvedValueOnce({
      sessionId: 'sess_3',
      businessId: 44,
      messageCount: 2,
      humanHandoff: {
        mode: HANDOFF_MODE.ACTIVE,
        assignedUserId: 9,
        assignedUserName: 'Existing Owner',
      },
    });

    await expect(
      claimHumanHandoff({
        sessionId: 'sess_3',
        businessId: 44,
        userId: 5,
        userName: 'New Owner',
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('returns a claimed conversation back to AI', async () => {
    getStateMock.mockResolvedValueOnce({
      sessionId: 'sess_4',
      businessId: 99,
      messageCount: 8,
      humanHandoff: {
        mode: HANDOFF_MODE.ACTIVE,
        assignedUserId: 2,
        assignedUserName: 'Owner',
      },
    });

    const handoff = await returnConversationToAi({
      sessionId: 'sess_4',
      businessId: 99,
      userId: 2,
    });

    expect(handoff.mode).toBe(HANDOFF_MODE.AI);
    expect(updateStateMock).toHaveBeenCalledWith(
      'sess_4',
      expect.objectContaining({
        humanHandoff: expect.objectContaining({
          mode: HANDOFF_MODE.AI,
        }),
      })
    );
  });

  it('builds viewer-specific handoff permissions', () => {
    const view = buildHandoffView({
      humanHandoff: {
        mode: HANDOFF_MODE.ACTIVE,
        assignedUserId: 21,
        assignedUserName: 'Mina',
      },
    }, 21);

    expect(view.currentUserIsAssignee).toBe(true);
    expect(view.canReply).toBe(true);
    expect(view.canReturnToAi).toBe(true);
  });

  it('appends transcript messages to ChatLog', async () => {
    chatLogFindUniqueMock.mockResolvedValueOnce({
      businessId: 77,
      assistantId: 'asst_1',
      channel: 'WHATSAPP',
      customerPhone: '905551112233',
      status: 'active',
      messages: [{ role: 'user', content: 'hello' }],
    });
    chatLogUpsertMock.mockResolvedValueOnce({ id: 'log_1' });

    await appendChatLogMessages({
      sessionId: 'sess_5',
      businessId: 77,
      channel: 'WHATSAPP',
      customerPhone: '905551112233',
      messages: [{ role: 'system', content: 'claimed' }],
    });

    expect(chatLogUpsertMock).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        messageCount: 2,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'hello' }),
          expect.objectContaining({ role: 'system', content: 'claimed' }),
        ]),
      }),
    }));
  });
});

