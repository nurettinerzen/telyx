import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const executeToolMock = jest.fn();
const tryAutoverifyMock = jest.fn();

jest.unstable_mockModule('../../src/tools/index.js', () => ({
  executeTool: executeToolMock
}));

jest.unstable_mockModule('../../src/security/autoverify.js', () => ({
  tryAutoverify: tryAutoverifyMock
}));

let executeEmailToolLoop;

beforeAll(async () => {
  const module = await import('../../src/core/email/steps/05_toolLoop.js');
  executeEmailToolLoop = module.executeEmailToolLoop;
});

beforeEach(() => {
  jest.clearAllMocks();
  executeToolMock.mockResolvedValue({
    success: true,
    outcome: 'OK',
    data: { status: 'Hazirlaniyor' },
    message: 'ok'
  });
  tryAutoverifyMock.mockResolvedValue({ applied: false });
});

describe('email tool loop follow-up regressions', () => {
  it('uses order number from subject/history even when classifier sets needs_tools=false', async () => {
    const ctx = {
      classification: {
        intent: 'FOLLOW_UP',
        needs_tools: false
      },
      gatedTools: ['customer_data_lookup'],
      business: { id: 21, language: 'TR' },
      customerEmail: 'eyup@example.com',
      inboundMessage: {
        id: 'msg-latest',
        subject: 'RE: 3769479 siparis nolu',
        bodyText: 'Siparis numarami paylasmistim'
      },
      thread: { id: 'thread-1' },
      threadMessages: [
        {
          direction: 'INBOUND',
          subject: '3769479 siparis nolu',
          body: 'Merhaba'
        },
        {
          direction: 'OUTBOUND',
          subject: 'Re: 3769479 siparis nolu',
          body: 'Merhaba, yardimci olabilmem icin dogrulama bilgisi gerekli.'
        }
      ],
      language: 'TR',
      metrics: {}
    };

    const result = await executeEmailToolLoop(ctx);

    expect(result.success).toBe(true);
    expect(executeToolMock).toHaveBeenCalledTimes(1);
    const [toolName, args] = executeToolMock.mock.calls[0];
    expect(toolName).toBe('customer_data_lookup');
    expect(args.query_type).toBe('siparis');
    expect(args.order_number).toBe('3769479');
  });

  it('synthesizes pending state for name-based verification follow-up after prior verification prompt', async () => {
    const ctx = {
      classification: {
        intent: 'ORDER',
        needs_tools: true
      },
      gatedTools: ['customer_data_lookup'],
      business: { id: 21, language: 'TR' },
      customerEmail: 'eyup@example.com',
      inboundMessage: {
        id: 'msg-followup',
        subject: 'RE: ORD-202635327',
        bodyText: 'My full name is Eyup Yorulmaz'
      },
      thread: { id: 'thread-2' },
      threadMessages: [
        {
          direction: 'INBOUND',
          subject: 'ORD-202635327 urun degisikligi',
          body: 'ORD-202635327 nolu siparisimde urun degisikligi istiyorum'
        },
        {
          direction: 'OUTBOUND',
          subject: 'RE: ORD-202635327',
          body: 'For verification, could you share your full name?'
        },
        {
          direction: 'INBOUND',
          subject: 'RE: ORD-202635327',
          body: 'My full name is Eyup Yorulmaz'
        }
      ],
      language: 'TR',
      metrics: {}
    };

    const result = await executeEmailToolLoop(ctx);

    expect(result.success).toBe(true);
    expect(executeToolMock).toHaveBeenCalledTimes(1);
    const [, , , toolContext] = executeToolMock.mock.calls[0];
    expect(toolContext?.state?.verification?.status).toBe('pending');
    expect(toolContext?.state?.verification?.pendingField).toBe('name');
  });
});
