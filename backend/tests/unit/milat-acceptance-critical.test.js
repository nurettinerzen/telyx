import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const loadContextMock = jest.fn();
const prepareContextMock = jest.fn();
const makeRoutingDecisionMock = jest.fn();
const buildLLMRequestMock = jest.fn();
const executeToolLoopMock = jest.fn();
const persistAndEmitMetricsMock = jest.fn();
const buildBusinessIdentityMock = jest.fn();
const containsChildSafetyViolationMock = jest.fn();
const detectPromptInjectionMock = jest.fn();
const detectUserRisksMock = jest.fn();
const checkSessionThrottleMock = jest.fn();
const ensurePolicyGuidanceMock = jest.fn();
const validateResponseAfterToolFailMock = jest.fn();
const isFeatureEnabledMock = jest.fn();

jest.unstable_mockModule('../../src/core/orchestrator/steps/01_loadContext.js', () => ({
  loadContext: loadContextMock
}));

jest.unstable_mockModule('../../src/core/orchestrator/steps/02_prepareContext.js', () => ({
  prepareContext: prepareContextMock
}));

jest.unstable_mockModule('../../src/core/orchestrator/steps/04_routerDecision.js', () => ({
  makeRoutingDecision: makeRoutingDecisionMock
}));

jest.unstable_mockModule('../../src/core/orchestrator/steps/05_buildLLMRequest.js', () => ({
  buildLLMRequest: buildLLMRequestMock
}));

jest.unstable_mockModule('../../src/core/orchestrator/steps/06_toolLoop.js', () => ({
  executeToolLoop: executeToolLoopMock
}));

jest.unstable_mockModule('../../src/core/orchestrator/steps/08_persistAndMetrics.js', () => ({
  persistAndEmitMetrics: persistAndEmitMetricsMock
}));

jest.unstable_mockModule('../../src/core/orchestrator/steps/03_classify.js', () => ({
  classifyMessage: jest.fn(async () => ({
    type: 'NEW_INTENT',
    confidence: 0.9,
    triggerRule: 'test'
  }))
}));

jest.unstable_mockModule('../../src/config/database.js', () => ({
  default: {}
}));

jest.unstable_mockModule('../../src/utils/content-safety.js', () => ({
  containsChildSafetyViolation: containsChildSafetyViolationMock,
  getBlockedContentMessage: jest.fn(() => 'blocked'),
  logContentSafetyViolation: jest.fn()
}));

jest.unstable_mockModule('../../src/services/user-risk-detector.js', () => ({
  detectPromptInjection: detectPromptInjectionMock,
  detectUserRisks: detectUserRisksMock,
  getPIIWarningMessages: jest.fn(() => [])
}));

jest.unstable_mockModule('../../src/services/session-lock.js', () => ({
  checkEnumerationAttempt: jest.fn(async () => ({ shouldBlock: false, attempts: 0 })),
  resetEnumerationCounter: jest.fn(async () => undefined),
  getLockMessage: jest.fn(() => 'locked'),
  lockSession: jest.fn(async () => undefined),
  ENUMERATION_LIMITS: { MAX_ATTEMPTS: 3 }
}));

jest.unstable_mockModule('../../src/messages/messageCatalog.js', () => ({
  getMessageVariant: jest.fn(() => ({ text: 'msg' }))
}));

jest.unstable_mockModule('../../src/services/sessionThrottle.js', () => ({
  checkSessionThrottle: checkSessionThrottleMock
}));

jest.unstable_mockModule('../../src/services/tool-fail-handler.js', () => ({
  ensurePolicyGuidance: ensurePolicyGuidanceMock
  ,
  validateResponseAfterToolFail: validateResponseAfterToolFailMock
}));

jest.unstable_mockModule('../../src/services/businessIdentity.js', () => ({
  buildBusinessIdentity: buildBusinessIdentityMock,
  normalizeForMatch: jest.fn((value) => String(value || '').toLowerCase().trim())
}));

jest.unstable_mockModule('../../src/config/feature-flags.js', () => ({
  isFeatureEnabled: isFeatureEnabledMock
}));

let handleIncomingMessage;

beforeAll(async () => {
  ({ handleIncomingMessage } = await import('../../src/core/handleIncomingMessage.js'));
});

beforeEach(() => {
  jest.clearAllMocks();

  containsChildSafetyViolationMock.mockReturnValue(false);
  detectPromptInjectionMock.mockReturnValue({ detected: false });
  detectUserRisksMock.mockResolvedValue({ shouldLock: false, reason: null, warnings: [], stateUpdated: false });
  checkSessionThrottleMock.mockReturnValue({ allowed: true });
  ensurePolicyGuidanceMock.mockImplementation((response) => ({
    response,
    guidanceAdded: false,
    addedComponents: []
  }));
  validateResponseAfterToolFailMock.mockReturnValue({
    valid: true,
    forcedResponse: null,
    violationType: null
  });

  isFeatureEnabledMock.mockImplementation((featureName) => {
    if (featureName === 'SESSION_THROTTLE') return false;
    if (featureName === 'PLAINTEXT_INJECTION_BLOCK') return true;
    if (featureName === 'USE_MESSAGE_TYPE_ROUTING') return false;
    if (featureName === 'FIELD_GROUNDING_HARDBLOCK') return false;
    return true;
  });

  loadContextMock.mockResolvedValue({
    terminated: false,
    sessionId: 'session_milat_acceptance',
    state: {
      activeFlow: null,
      flowStatus: 'idle',
      verification: { status: 'none' },
      extractedSlots: {}
    }
  });

  buildBusinessIdentityMock.mockResolvedValue({
    businessName: 'Telyx',
    businessAliases: ['Telix'],
    productNames: [],
    keyEntities: [],
    allowedDomains: []
  });

  prepareContextMock.mockResolvedValue({
    systemPrompt: 'SYS',
    conversationHistory: [],
    toolsAll: [{ function: { name: 'customer_data_lookup' } }],
    hasKBMatch: true,
    kbConfidence: 'HIGH',
    retrievalMetadata: {}
  });

  makeRoutingDecisionMock.mockResolvedValue({
    directResponse: false,
    routing: { routing: { action: 'RUN_INTENT_ROUTER', intent: 'general' } }
  });

  buildLLMRequestMock.mockResolvedValue({
    chat: {},
    gatedTools: ['customer_data_lookup'],
    hasTools: true
  });

  executeToolLoopMock.mockResolvedValue({
    reply: 'Telyx işletmeler için yapay zeka destekli iletişim otomasyonudur.',
    inputTokens: 16,
    outputTokens: 11,
    hadToolSuccess: false,
    hadToolFailure: false,
    failedTool: null,
    toolsCalled: [],
    iterations: 1,
    toolResults: [],
    chat: {}
  });

  persistAndEmitMetricsMock.mockImplementation(async ({ assistantMessageMeta, metrics }) => ({
    shouldEndSession: false,
    forceEnd: false,
    metadata: {
      messageType: assistantMessageMeta?.messageType || 'assistant_claim',
      guardrailAction: assistantMessageMeta?.guardrailAction || 'PASS',
      LLM_CALLED: metrics?.LLM_CALLED === true,
      llm_call_reason: metrics?.llm_call_reason || metrics?.llmCallReason || 'CHAT',
      bypassed: metrics?.bypassed === true
    }
  }));
});

async function runTurn(userMessage) {
  return handleIncomingMessage({
    channel: 'CHAT',
    business: { id: 77, name: 'Telyx' },
    assistant: { id: 101, name: 'Asistan' },
    channelUserId: 'u-milat',
    sessionId: `s-${Date.now()}`,
    messageId: `m-${Math.random().toString(36).slice(2)}`,
    userMessage,
    language: 'TR'
  });
}

describe('Milat acceptance (critical)', () => {
  it('1) "Telyx nedir / özellikleri neler" -> LLM called, PASS, no bypass', async () => {
    const result = await runTurn('Telyx nedir, özellikleri neler?');

    expect(result.metadata.LLM_CALLED).toBe(true);
    expect(result.metadata.llm_call_reason).toBe('CHAT');
    expect(result.metadata.bypassed).toBe(false);
    expect(result.metadata.guardrailAction).toBe('PASS');
    expect(result.metadata.messageType).toBe('assistant_claim');
  });

  it('2) "Telyx nasıl kullanılır" -> PASS (no sanitize/block)', async () => {
    const result = await runTurn('Telyx nasıl kullanılır?');

    expect(result.metadata.LLM_CALLED).toBe(true);
    expect(result.metadata.llm_call_reason).toBe('CHAT');
    expect(result.metadata.bypassed).toBe(false);
    expect(result.metadata.guardrailAction).toBe('PASS');
    expect(result.metadata.messageType).toBe('assistant_claim');
  });

  it('3) "Siparişimin durumu" -> NEED_MIN_INFO_FOR_TOOL clarification (no template override)', async () => {
    loadContextMock.mockResolvedValueOnce({
      terminated: false,
      sessionId: 'session_order_need_info',
      state: {
        activeFlow: 'ORDER_STATUS',
        flowStatus: 'in_progress',
        verification: { status: 'none' },
        extractedSlots: {}
      }
    });

    makeRoutingDecisionMock.mockResolvedValueOnce({
      directResponse: false,
      routing: { routing: { action: 'RUN_INTENT_ROUTER', intent: 'order_status' } }
    });

    executeToolLoopMock.mockResolvedValueOnce({
      reply: 'Siparişinizi kontrol ediyorum.',
      inputTokens: 18,
      outputTokens: 8,
      hadToolSuccess: false,
      hadToolFailure: false,
      failedTool: null,
      toolsCalled: [],
      iterations: 1,
      toolResults: [],
      chat: {}
    });

    const result = await runTurn('Siparişimin durumu nedir?');

    expect(result.metadata.LLM_CALLED).toBe(true);
    expect(result.metadata.llm_call_reason).toBe('CHAT');
    expect(result.metadata.bypassed).toBe(false);
    expect(result.metadata.guardrailAction).toBe('NEED_MIN_INFO_FOR_TOOL');
    expect(result.metadata.messageType).toBe('clarification');
    expect(result.reply).toMatch(/\?/);
  });

  it('4) "Numaram 0555..." -> SANITIZE + messageType=sanitized_assistant', async () => {
    executeToolLoopMock.mockResolvedValueOnce({
      reply: 'Numaram 05551234567, buradan ulaşabilirsiniz.',
      inputTokens: 15,
      outputTokens: 9,
      hadToolSuccess: false,
      hadToolFailure: false,
      failedTool: null,
      toolsCalled: [],
      iterations: 1,
      toolResults: [],
      chat: {}
    });

    const result = await runTurn('Numaram 05551234567');

    expect(result.metadata.LLM_CALLED).toBe(true);
    expect(result.metadata.llm_call_reason).toBe('CHAT');
    expect(result.metadata.bypassed).toBe(false);
    expect(result.metadata.guardrailAction).toBe('SANITIZE');
    expect(result.metadata.messageType).toBe('sanitized_assistant');
    expect(result.reply).toContain('*');
  });

  it('5) tool 500 -> safe fallback + system_barrier typing (no snowball)', async () => {
    executeToolLoopMock.mockResolvedValueOnce({
      reply: 'Şu an sistem cevap vermiyor. Lütfen birazdan tekrar deneyin.',
      inputTokens: 21,
      outputTokens: 7,
      hadToolSuccess: false,
      hadToolFailure: true,
      failedTool: 'customer_data_lookup',
      toolsCalled: ['customer_data_lookup'],
      iterations: 1,
      toolResults: [],
      chat: {}
    });

    const result = await runTurn('Siparişimi kontrol eder misin?');

    expect(result.metadata.LLM_CALLED).toBe(true);
    expect(result.metadata.llm_call_reason).toBe('CHAT');
    expect(result.metadata.bypassed).toBe(false);
    expect(result.metadata.guardrailAction).toBe('BLOCK');
    expect(result.metadata.messageType).toBe('system_barrier');
    expect(result.reply).toMatch(/tekrar deneyin/i);
  });
});
