import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

process.env.JWT_SECRET = 'lead-preview-test-secret';

const prismaMock = {
  leadPreviewSession: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  }
};

const terminateConversationMock = jest.fn();

await jest.unstable_mockModule('../../src/prismaClient.js', () => ({
  default: prismaMock
}));

await jest.unstable_mockModule('../../src/services/elevenlabs.js', () => ({
  default: {
    terminateConversation: terminateConversationMock
  }
}));

let leadPreviewService;

beforeAll(async () => {
  leadPreviewService = await import('../../src/services/leadPreviewService.js');
});

describe('leadPreviewService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a one-time preview session and issues an access token', async () => {
    prismaMock.leadPreviewSession.findUnique.mockResolvedValueOnce(null);
    prismaMock.leadPreviewSession.create.mockResolvedValueOnce({
      id: 'preview_sess_1',
      leadId: 'lead_1',
      assistantId: 'assistant_1',
      status: 'READY'
    });

    const result = await leadPreviewService.createLeadPreviewSession({
      leadId: 'lead_1',
      assistantId: 'assistant_1'
    });

    expect(result.session.id).toBe('preview_sess_1');
    expect(result.previewAccessToken).toEqual(expect.any(String));
    expect(prismaMock.leadPreviewSession.create).toHaveBeenCalledWith({
      data: {
        leadId: 'lead_1',
        assistantId: 'assistant_1',
        status: 'READY'
      }
    });
  });

  it('rejects reused preview links', async () => {
    prismaMock.leadPreviewSession.findUnique.mockResolvedValueOnce({
      id: 'preview_sess_used',
      leadId: 'lead_1',
      status: 'ENDED',
      endReason: 'user_ended'
    });

    await expect(
      leadPreviewService.createLeadPreviewSession({
        leadId: 'lead_1',
        assistantId: 'assistant_1'
      })
    ).rejects.toMatchObject({
      statusCode: 410,
      code: 'preview_already_used'
    });
  });

  it('marks preview credential issuance and increments the issue counter', async () => {
    prismaMock.leadPreviewSession.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'preview_sess_2',
        leadId: 'lead_2',
        assistantId: 'assistant_2',
        status: 'READY',
        credentialIssueCount: 0,
        conversationId: null,
        expiresAt: null,
        endReason: null,
        lead: { id: 'lead_2', name: 'Ayse', responseToken: 'resp_2' },
        assistant: { id: 'assistant_2', name: 'Demo Assistant' }
      });

    prismaMock.leadPreviewSession.create.mockResolvedValueOnce({
      id: 'preview_sess_2',
      leadId: 'lead_2',
      assistantId: 'assistant_2',
      status: 'READY'
    });

    prismaMock.leadPreviewSession.update.mockResolvedValueOnce({
      id: 'preview_sess_2',
      leadId: 'lead_2',
      assistantId: 'assistant_2',
      status: 'CONNECTING',
      credentialIssueCount: 1,
      conversationId: null,
      lead: { id: 'lead_2', name: 'Ayse', responseToken: 'resp_2' },
      assistant: { id: 'assistant_2', name: 'Demo Assistant' }
    });

    const previewAccessToken = await leadPreviewService.createLeadPreviewSession({
      leadId: 'lead_2',
      assistantId: 'assistant_2'
    }).then((result) => result.previewAccessToken);

    const updatedSession = await leadPreviewService.markLeadPreviewCredentialIssued({
      previewAccessToken,
      assistantId: 'assistant_2'
    });

    expect(updatedSession.status).toBe('CONNECTING');
    expect(prismaMock.leadPreviewSession.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'preview_sess_2' },
      data: expect.objectContaining({
        status: 'CONNECTING',
        credentialIssueCount: {
          increment: 1
        }
      })
    }));
  });

  it('registers a connected preview conversation and sets a hard expiry', async () => {
    prismaMock.leadPreviewSession.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'preview_sess_3',
        leadId: 'lead_3',
        assistantId: 'assistant_3',
        status: 'CONNECTING',
        credentialIssueCount: 1,
        conversationId: null,
        expiresAt: null,
        endReason: null,
        lead: { id: 'lead_3', name: 'Mehmet', responseToken: 'resp_3' },
        assistant: { id: 'assistant_3', name: 'Preview Assistant' }
      });

    prismaMock.leadPreviewSession.create.mockResolvedValueOnce({
      id: 'preview_sess_3',
      leadId: 'lead_3',
      assistantId: 'assistant_3',
      status: 'READY'
    });

    prismaMock.leadPreviewSession.update.mockResolvedValueOnce({
      id: 'preview_sess_3',
      leadId: 'lead_3',
      assistantId: 'assistant_3',
      status: 'ACTIVE',
      conversationId: 'conv_123',
      expiresAt: new Date(Date.now() + (10 * 60 * 1000)),
      lead: { id: 'lead_3', name: 'Mehmet', responseToken: 'resp_3' },
      assistant: { id: 'assistant_3', name: 'Preview Assistant' }
    });

    const previewAccessToken = await leadPreviewService.createLeadPreviewSession({
      leadId: 'lead_3',
      assistantId: 'assistant_3'
    }).then((result) => result.previewAccessToken);

    const updatedSession = await leadPreviewService.registerLeadPreviewConversation({
      previewAccessToken,
      conversationId: 'conv_123'
    });

    expect(updatedSession.status).toBe('ACTIVE');
    expect(updatedSession.conversationId).toBe('conv_123');
    expect(updatedSession.expiresAt).toBeInstanceOf(Date);
  });

  it('returns a terminating guard when the preview session has timed out', async () => {
    const expiredAt = new Date(Date.now() - 5_000);

    prismaMock.leadPreviewSession.findUnique
      .mockResolvedValueOnce({
        id: 'preview_sess_4',
        leadId: 'lead_4',
        assistantId: 'assistant_4',
        status: 'ACTIVE',
        conversationId: 'conv_expired',
        expiresAt: expiredAt,
        endReason: null,
        lead: { id: 'lead_4', name: 'Zeynep', responseToken: 'resp_4' },
        assistant: { id: 'assistant_4', name: 'Preview Assistant' }
      })
      .mockResolvedValueOnce({
        id: 'preview_sess_4',
        leadId: 'lead_4',
        assistantId: 'assistant_4',
        status: 'ACTIVE',
        conversationId: 'conv_expired',
        expiresAt: expiredAt,
        endReason: null,
        lead: { id: 'lead_4', name: 'Zeynep', responseToken: 'resp_4' },
        assistant: { id: 'assistant_4', name: 'Preview Assistant' }
      });

    prismaMock.leadPreviewSession.update.mockResolvedValueOnce({
      id: 'preview_sess_4',
      leadId: 'lead_4',
      assistantId: 'assistant_4',
      status: 'EXPIRED',
      conversationId: 'conv_expired',
      expiresAt: expiredAt,
      endReason: 'timeout',
      lead: { id: 'lead_4', name: 'Zeynep', responseToken: 'resp_4' },
      assistant: { id: 'assistant_4', name: 'Preview Assistant' }
    });

    const guard = await leadPreviewService.getLeadPreviewPromptGuard({
      conversationId: 'conv_expired',
      assistantName: 'Preview Assistant'
    });

    expect(guard.shouldTerminate).toBe(true);
    expect(guard.promptOverride).toContain('TELYX DEMO SURESI DOLDU');
    expect(prismaMock.leadPreviewSession.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'preview_sess_4' },
      data: expect.objectContaining({
        status: 'EXPIRED',
        endReason: 'timeout'
      })
    }));
  });
});
