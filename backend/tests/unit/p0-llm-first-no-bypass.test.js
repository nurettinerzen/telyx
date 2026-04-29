import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  ENTITY_CLARIFICATION_HINTS,
  ENTITY_MATCH_TYPES,
  resolveMentionedEntity
} from '../../src/services/entityTopicResolver.js';

const loadContextMock = jest.fn();
const prepareContextMock = jest.fn();
const makeRoutingDecisionMock = jest.fn();
const buildLLMRequestMock = jest.fn();
const executeToolLoopMock = jest.fn();
const applyGuardrailsMock = jest.fn();
const persistAndEmitMetricsMock = jest.fn();
const buildBusinessIdentityMock = jest.fn();
const containsChildSafetyViolationMock = jest.fn();
const detectPromptInjectionMock = jest.fn();
const detectUserRisksMock = jest.fn();
const checkSessionThrottleMock = jest.fn();
const ensurePolicyGuidanceMock = jest.fn();
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

jest.unstable_mockModule('../../src/core/orchestrator/steps/07_guardrails.js', () => ({
  applyGuardrails: applyGuardrailsMock
}));

jest.unstable_mockModule('../../src/core/orchestrator/steps/08_persistAndMetrics.js', () => ({
  persistAndEmitMetrics: persistAndEmitMetricsMock
}));

jest.unstable_mockModule('../../src/core/orchestrator/steps/03_classify.js', () => ({
  classifyMessage: jest.fn(async () => ({
    type: 'NEW_INTENT',
    confidence: 0.9
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
  ENUMERATION_LIMITS: { MAX_ATTEMPTS: 3 },
  lockSession: jest.fn(async () => ({
    reason: 'TEST_LOCK',
    lockUntil: null,
    lockedAt: new Date().toISOString()
  }))
}));

jest.unstable_mockModule('../../src/messages/messageCatalog.js', () => ({
  getMessageVariant: jest.fn(() => ({ text: 'msg' }))
}));

jest.unstable_mockModule('../../src/services/sessionThrottle.js', () => ({
  checkSessionThrottle: checkSessionThrottleMock
}));

jest.unstable_mockModule('../../src/services/tool-fail-handler.js', () => ({
  ensurePolicyGuidance: ensurePolicyGuidanceMock
}));

jest.unstable_mockModule('../../src/services/businessIdentity.js', () => ({
  buildBusinessIdentity: buildBusinessIdentityMock
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

  isFeatureEnabledMock.mockImplementation((featureName) => {
    if (featureName === 'SESSION_THROTTLE') return false;
    if (featureName === 'PLAINTEXT_INJECTION_BLOCK') return true;
    if (featureName === 'USE_MESSAGE_TYPE_ROUTING') return false;
    return true;
  });

  loadContextMock.mockResolvedValue({
    terminated: false,
    sessionId: 'session_llm_first',
    state: {}
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
    reply: 'LLM cevabı',
    inputTokens: 11,
    outputTokens: 7,
    hadToolSuccess: false,
    hadToolFailure: false,
    failedTool: null,
    toolsCalled: [],
    iterations: 1,
    toolResults: [],
    chat: {}
  });

  applyGuardrailsMock.mockResolvedValue({
    finalResponse: 'LLM cevabı',
    action: 'PASS',
    blocked: false,
    guardrailsApplied: []
  });

  persistAndEmitMetricsMock.mockResolvedValue({
    shouldEndSession: false,
    forceEnd: false,
    metadata: {}
  });
});

describe('P0 LLM-first no-bypass', () => {
  it('invariant: entity resolver never returns direct response text', () => {
    const fuzzy = resolveMentionedEntity('telix nedir', {
      businessName: 'Telyx',
      businessAliases: [],
      productNames: [],
      keyEntities: []
    });

    expect(Object.keys(fuzzy).sort()).toEqual([
      'clarificationQuestionHint',
      'confidence',
      'entityHint',
      'matchType',
      'needsClarification'
    ]);
    expect(fuzzy.matchType).toBe(ENTITY_MATCH_TYPES.FUZZY_MATCH);
    expect(fuzzy.clarificationQuestionHint).toBe(ENTITY_CLARIFICATION_HINTS.CONFIRM_ENTITY);
    expect(fuzzy.clarificationQuestion).toBeUndefined();
  });

  it('invariant: greeting request sets LLM_CALLED=true telemetry', async () => {
    makeRoutingDecisionMock.mockResolvedValueOnce({
      directResponse: false,
      isChatter: true,
      chatterDirective: {
        kind: 'greeting',
        activeTask: false,
        flowStatus: 'idle',
        verificationPending: false,
        responseSeed: 'seed',
        maxSentences: 1
      },
      routing: { routing: { action: 'ACKNOWLEDGE_CHATTER', intent: 'general' } }
    });

    const result = await handleIncomingMessage({
      channel: 'CHAT',
      business: { id: 7, name: 'Telyx' },
      assistant: { id: 1, name: 'Asistan' },
      channelUserId: 'u1',
      sessionId: 's1',
      messageId: 'm1',
      userMessage: 'Merhaba',
      language: 'TR'
    });

    expect(result.metadata.LLM_CALLED).toBe(true);
    expect(result.metadata.llm_call_reason).toBe('CHAT');
    expect(result.metadata.bypassed).toBe(false);
    expect(result.metrics.LLM_CALLED).toBe(true);
    expect(buildLLMRequestMock).toHaveBeenCalledTimes(1);
    expect(executeToolLoopMock).toHaveBeenCalledTimes(1);
  });

  it('invariant: selam/merhaba/nedir/özellik/fiyat prompts are all LLM-first (no bypass)', async () => {
    const prompts = [
      'selam',
      'merhaba',
      'Telyx nedir?',
      'Telyx’in özellikleri neler?',
      'fiyatlar nedir?'
    ];

    for (let i = 0; i < prompts.length; i += 1) {
      const result = await handleIncomingMessage({
        channel: 'CHAT',
        business: { id: 7, name: 'Telyx' },
        assistant: { id: 1, name: 'Asistan' },
        channelUserId: `u-p${i}`,
        sessionId: `s-p${i}`,
        messageId: `m-p${i}`,
        userMessage: prompts[i],
        language: 'TR'
      });

      expect(result.metadata.LLM_CALLED).toBe(true);
      expect(result.metadata.llm_call_reason).toBe('CHAT');
      expect(result.metadata.bypassed).toBe(false);
    }
  });

  it('invariant: guardrail trigger has no reprompt (repromptCount==0)', async () => {
    applyGuardrailsMock.mockResolvedValueOnce({
      finalResponse: 'Güvenli devam için sipariş numaranızı paylaşır mısınız?',
      action: 'NEED_MIN_INFO_FOR_TOOL',
      blocked: true,
      blockReason: 'NEED_MIN_INFO_FOR_TOOL',
      guardrailsApplied: ['SECURITY_GATEWAY_LEAK_FILTER']
    });

    const result = await handleIncomingMessage({
      channel: 'CHAT',
      business: { id: 7, name: 'Telyx' },
      assistant: { id: 1, name: 'Asistan' },
      channelUserId: 'u1',
      sessionId: 's2',
      messageId: 'm2',
      userMessage: 'siparişim nerede?',
      language: 'TR'
    });

    expect(result.metadata.guardrailAction).toBe('NEED_MIN_INFO_FOR_TOOL');
    expect(result.metrics.securityTelemetry.repromptCount).toBe(0);
    expect(executeToolLoopMock).toHaveBeenCalledTimes(1);
  });

  it('invariant: "Telyx nedir/özellik" request still goes through LLM, resolver only provides entityHint', async () => {
    buildBusinessIdentityMock.mockResolvedValueOnce({
      businessName: 'Telyx',
      businessAliases: [],
      productNames: [],
      keyEntities: [],
      allowedDomains: []
    });

    executeToolLoopMock.mockResolvedValueOnce({
      reply: 'Telyx işletmeler için yapay zeka destekli iletişim otomasyonudur.',
      inputTokens: 20,
      outputTokens: 18,
      hadToolSuccess: false,
      hadToolFailure: false,
      failedTool: null,
      toolsCalled: [],
      iterations: 1,
      toolResults: [],
      chat: {}
    });
    applyGuardrailsMock.mockResolvedValueOnce({
      finalResponse: 'Telyx işletmeler için yapay zeka destekli iletişim otomasyonudur.',
      action: 'PASS',
      blocked: false,
      guardrailsApplied: []
    });

    const result = await handleIncomingMessage({
      channel: 'CHAT',
      business: { id: 7, name: 'Telyx' },
      assistant: { id: 1, name: 'Asistan' },
      channelUserId: 'u1',
      sessionId: 's3',
      messageId: 'm3',
      userMessage: 'Telix nedir, özellikleri neler?',
      language: 'TR'
    });

    expect(buildLLMRequestMock).toHaveBeenCalledTimes(1);
    const llmParams = buildLLMRequestMock.mock.calls[0][0];
    expect(llmParams.entityResolution.entityHint).toBe('Telyx');
    expect(llmParams.entityResolution.clarificationQuestion).toBeUndefined();
    expect(result.reply).toContain('Telyx');
    expect(result.metadata.LLM_CALLED).toBe(true);
    expect(result.metadata.llm_call_reason).toBe('CHAT');
    expect(result.metadata.bypassed).toBe(false);
  });
});
