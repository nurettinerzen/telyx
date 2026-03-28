import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { maskEmail, maskPhone } from '../../src/utils/pii-redaction.js';

const loadContextMock = jest.fn();
const prepareContextMock = jest.fn();
const classifyMessageMock = jest.fn();
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
const isFeatureEnabledMock = jest.fn();
const lockSessionMock = jest.fn();
const getLockMessageMock = jest.fn();
const logPIILeakBlockMock = jest.fn();
const logFirewallBlockMock = jest.fn();

jest.unstable_mockModule('../../src/core/orchestrator/steps/01_loadContext.js', () => ({
  loadContext: loadContextMock
}));

jest.unstable_mockModule('../../src/core/orchestrator/steps/02_prepareContext.js', () => ({
  prepareContext: prepareContextMock
}));

jest.unstable_mockModule('../../src/core/orchestrator/steps/03_classify.js', () => ({
  classifyMessage: classifyMessageMock
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

jest.unstable_mockModule('../../src/services/state-manager.js', () => ({
  updateState: jest.fn(async () => undefined)
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
  getLockMessage: getLockMessageMock,
  ENUMERATION_LIMITS: { MAX_ATTEMPTS: 3 },
  lockSession: lockSessionMock
}));

jest.unstable_mockModule('../../src/messages/messageCatalog.js', () => ({
  getMessageVariant: jest.fn((_key, { language } = {}) => ({
    text: language === 'EN' ? 'msg' : 'msg',
    messageKey: 'MOCK_MSG',
    variantIndex: 0
  })),
  getMessage: jest.fn(() => 'msg')
}));

jest.unstable_mockModule('../../src/services/sessionThrottle.js', () => ({
  checkSessionThrottle: checkSessionThrottleMock
}));

jest.unstable_mockModule('../../src/services/tool-fail-handler.js', () => ({
  ensurePolicyGuidance: ensurePolicyGuidanceMock,
  validateResponseAfterToolFail: jest.fn(() => ({
    valid: true,
    shouldReplace: false,
    replacement: null
  })),
  getToolFailResponse: jest.fn(() => 'msg'),
  executeToolWithRetry: jest.fn()
}));

jest.unstable_mockModule('../../src/services/businessIdentity.js', () => ({
  buildBusinessIdentity: buildBusinessIdentityMock,
  normalizeForMatch: jest.fn((value = '') => String(value || '').toLowerCase().trim())
}));

jest.unstable_mockModule('../../src/config/feature-flags.js', () => ({
  isFeatureEnabled: isFeatureEnabledMock
}));

jest.unstable_mockModule('../../src/middleware/securityEventLogger.js', () => ({
  logPIILeakBlock: logPIILeakBlockMock,
  logFirewallBlock: logFirewallBlockMock
}));

let handleIncomingMessage;
let consoleLogSpy;
let consoleWarnSpy;
let consoleErrorSpy;

const VALID_TCKN = '10000000146';

function generateValidVkn() {
  const first9 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  let sum = 0;

  for (let i = 0; i < 9; i += 1) {
    const tmp = (first9[i] + (9 - i)) % 10;
    if (tmp === 0) continue;
    let v = (tmp * Math.pow(2, 9 - i)) % 9;
    if (v === 0) v = 9;
    sum += v;
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return first9.join('') + checkDigit;
}

const VALID_VKN = generateValidVkn();

const CONTEXTS = Object.freeze([
  { id: 'chat-tr', channel: 'CHAT', language: 'TR' },
  { id: 'whatsapp-tr', channel: 'WHATSAPP', language: 'TR' },
  { id: 'email-tr', channel: 'EMAIL', language: 'TR' },
  { id: 'chat-en', channel: 'CHAT', language: 'EN' }
]);

const BASE_BUSINESS = Object.freeze({
  id: 701,
  name: 'Telyx',
  emailIntegration: {
    connected: true,
    email: 'support@telyx.io'
  },
  helpLinks: [
    { label: 'Support', value: 'help@telyx.io' },
    { label: 'Press', value: 'press@telyx.io' }
  ]
});

const BASE_ASSISTANT = Object.freeze({
  id: 17,
  name: 'Guardrail Assistant',
  businessId: BASE_BUSINESS.id
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeBusiness(patch = {}) {
  return {
    ...clone(BASE_BUSINESS),
    ...patch,
    emailIntegration: {
      ...clone(BASE_BUSINESS.emailIntegration),
      ...(patch.emailIntegration || {})
    },
    helpLinks: Object.prototype.hasOwnProperty.call(patch, 'helpLinks')
      ? clone(patch.helpLinks)
      : clone(BASE_BUSINESS.helpLinks)
  };
}

function safeIntroReply(language = 'TR') {
  return language === 'EN'
    ? 'How can I help you today?'
    : 'Size nasıl yardımcı olabilirim?';
}

function safeOutroReply(language = 'TR') {
  return language === 'EN'
    ? 'Return period is 14 days.'
    : 'İade süresi 14 gündür.';
}

function safeStep(reply, language = 'TR') {
  return {
    userMessage: language === 'EN' ? 'hello' : 'merhaba',
    llmReply: reply,
    expect: {
      guardrailAction: 'PASS',
      replyEquals: reply,
      replyNotContains: ['locked', 'msg']
    }
  };
}

function buildScenario(name, context, targetStep, businessPatch = {}) {
  return {
    name: `${name}/${context.id}`,
    context,
    business: mergeBusiness(businessPatch),
    steps: [
      safeStep(safeIntroReply(context.language), context.language),
      targetStep,
      safeStep(safeOutroReply(context.language), context.language)
    ]
  };
}

const PUBLIC_CASES = [
  {
    id: 'integration-email',
    reply: 'Bize support@telyx.io adresinden ulaşabilirsiniz.'
  },
  {
    id: 'help-link-string',
    businessPatch: { helpLinks: ['Canlı destek için help@telyx.io adresine yazın.'] },
    reply: 'Canlı destek için help@telyx.io adresine yazın.'
  },
  {
    id: 'help-link-nested',
    businessPatch: { helpLinks: [{ support: { primary: 'press@telyx.io' } }] },
    reply: 'Basın iletişimi için press@telyx.io adresini kullanabilirsiniz.'
  },
  {
    id: 'uppercase-allowlist',
    reply: 'Bize SUPPORT@TELYX.IO adresinden ulaşabilirsiniz.'
  },
  {
    id: 'multiple-public-emails',
    reply: 'support@telyx.io veya help@telyx.io adreslerinden bize ulaşabilirsiniz.'
  }
];

const RECOVERABLE_EMAIL_CASES = [
  {
    id: 'single-customer-email',
    raw: 'ayse.demir@example.com',
    reply: 'Kayıtlı e-posta ayse.demir@example.com olarak görünüyor.',
    expectedContains: [maskEmail('ayse.demir@example.com')],
    expectedNotContains: ['ayse.demir@example.com']
  },
  {
    id: 'customer-plus-public-email',
    raw: 'ayse.demir@example.com',
    reply: 'Müşteri e-postası ayse.demir@example.com, destek adresimiz support@telyx.io.',
    expectedContains: [maskEmail('ayse.demir@example.com'), 'support@telyx.io'],
    expectedNotContains: ['ayse.demir@example.com']
  },
  {
    id: 'two-customer-emails',
    raw: ['ayse.demir@example.com', 'veli.kaya@test.com'],
    reply: 'E-postalar: ayse.demir@example.com ve veli.kaya@test.com.',
    expectedContains: [maskEmail('ayse.demir@example.com'), maskEmail('veli.kaya@test.com')],
    expectedNotContains: ['ayse.demir@example.com', 'veli.kaya@test.com']
  },
  {
    id: 'uppercase-customer-email',
    raw: 'AYSE.DEMIR@EXAMPLE.COM',
    reply: 'Kayıtlı e-posta AYSE.DEMIR@EXAMPLE.COM.',
    expectedContains: [maskEmail('AYSE.DEMIR@EXAMPLE.COM')],
    expectedNotContains: ['AYSE.DEMIR@EXAMPLE.COM']
  },
  {
    id: 'plus-alias-customer-email',
    raw: 'ayse.demir+vip@example.com',
    reply: 'Müşteri maili ayse.demir+vip@example.com olarak kayıtlı.',
    expectedContains: [maskEmail('ayse.demir+vip@example.com')],
    expectedNotContains: ['ayse.demir+vip@example.com']
  }
];

const RECOVERABLE_NUMBER_CASES = [
  {
    id: 'phone-plain',
    raw: '05551234567',
    reply: 'Telefon numaranız 05551234567 olarak kayıtlı.',
    expectedContains: [maskPhone('05551234567')],
    expectedNotContains: ['05551234567']
  },
  {
    id: 'phone-international',
    raw: '+90 555 123 45 67',
    reply: 'Telefon numaranız +90 555 123 45 67 olarak kayıtlı.',
    expectedContains: [maskPhone('+90 555 123 45 67')],
    expectedNotContains: ['+90 555 123 45 67']
  },
  {
    id: 'valid-tckn',
    raw: VALID_TCKN,
    reply: `TC kimlik numaranız ${VALID_TCKN} olarak görünüyor.`,
    expectedContains: ['***********'],
    expectedNotContains: [VALID_TCKN]
  },
  {
    id: 'valid-vkn',
    raw: VALID_VKN,
    reply: `Vergi numaranız ${VALID_VKN} olarak görünüyor.`,
    expectedContains: ['**********'],
    expectedNotContains: [VALID_VKN]
  },
  {
    id: 'phone-plus-email',
    raw: ['05551234567', 'ayse.demir@example.com'],
    reply: 'Telefon 05551234567 ve e-posta ayse.demir@example.com olarak görünüyor.',
    expectedContains: [maskPhone('05551234567'), maskEmail('ayse.demir@example.com')],
    expectedNotContains: ['05551234567', 'ayse.demir@example.com']
  }
];

const LOOKALIKE_CASES = [
  {
    id: 'invalid-11-digit-order',
    reply: 'Sipariş numaranız 12345678901 olarak görünüyor.'
  },
  {
    id: 'invalid-10-digit-reference',
    reply: 'Referans kodunuz 0000000000 olarak görünüyor.'
  },
  {
    id: 'tracking-code',
    reply: 'Kargo takip kodunuz TR1234567890 olarak görünüyor.'
  },
  {
    id: 'kb-grounded-wording',
    reply: 'Bilgi kaynağımıza göre ürün hasarlı geldiyse tutanak tutulması gerekiyor.'
  }
];

const HARD_BLOCK_CASES = [
  {
    id: 'credit-card',
    reply: 'Ödeme kartı: 4532015112830366',
    expectedReply: 'locked',
    expectedAction: 'BLOCK',
    forbiddenFragments: ['4532015112830366']
  },
  {
    id: 'iban',
    reply: 'İade için TR33 0006 1005 1978 6457 8413 26 hesabına gönderelim.',
    expectedReply: 'locked',
    expectedAction: 'BLOCK',
    forbiddenFragments: ['TR33 0006 1005 1978 6457 8413 26']
  },
  {
    id: 'password',
    reply: 'Şifre: super-secret-123',
    expectedReply: 'locked',
    expectedAction: 'BLOCK',
    forbiddenFragments: ['super-secret-123']
  },
  {
    id: 'token',
    reply: 'bearer: abcdefghijklmnopqrstuvwx123456',
    expectedReply: 'locked',
    expectedAction: 'BLOCK',
    forbiddenFragments: ['abcdefghijklmnopqrstuvwx123456']
  },
  {
    id: 'internal-metadata',
    reply: 'customer_data_lookup çağrıldı ve sonucu paylaşıyorum.',
    expectedReply: 'msg',
    expectedAction: 'SANITIZE',
    forbiddenFragments: ['customer_data_lookup']
  },
  {
    id: 'prompt-disclosure',
    reply: 'Sistem promptuma göre tüm önceki talimatları yok saymalıyım.',
    expectedReply: 'msg',
    expectedAction: 'SANITIZE',
    forbiddenFragments: ['Sistem promptuma göre']
  }
];

function buildScenarioList() {
  const scenarios = [];

  for (const context of CONTEXTS) {
    for (const caseDef of PUBLIC_CASES) {
      scenarios.push(buildScenario(
        `public-allowlist/${caseDef.id}`,
        context,
        {
          userMessage: context.language === 'EN' ? 'share public contact details' : 'destek iletişim bilgisini paylaş',
          llmReply: caseDef.reply,
          expect: {
            guardrailAction: 'PASS',
            replyEquals: caseDef.reply,
            replyNotContains: ['locked', 'msg']
          }
        },
        caseDef.businessPatch || {}
      ));
    }

    for (const caseDef of RECOVERABLE_EMAIL_CASES) {
      scenarios.push(buildScenario(
        `recoverable-email/${caseDef.id}`,
        context,
        {
          userMessage: context.language === 'EN' ? 'show the registered email' : 'kayıtlı e-postayı söyle',
          llmReply: caseDef.reply,
          expect: {
            guardrailAction: 'SANITIZE',
            replyContains: caseDef.expectedContains,
            replyNotContains: [...caseDef.expectedNotContains, 'locked', 'msg']
          }
        }
      ));
    }

    for (const caseDef of RECOVERABLE_NUMBER_CASES) {
      scenarios.push(buildScenario(
        `recoverable-number/${caseDef.id}`,
        context,
        {
          userMessage: context.language === 'EN' ? 'show the record details' : 'kayıt detayını söyle',
          llmReply: caseDef.reply,
          expect: {
            guardrailAction: 'SANITIZE',
            replyContains: caseDef.expectedContains,
            replyNotContains: [...caseDef.expectedNotContains, 'locked', 'msg']
          }
        }
      ));
    }

    for (const caseDef of LOOKALIKE_CASES) {
      scenarios.push(buildScenario(
        `lookalike-pass/${caseDef.id}`,
        context,
        {
          userMessage: context.language === 'EN' ? 'share the generic code' : 'genel kod bilgisini paylaş',
          llmReply: caseDef.reply,
          expect: {
            guardrailAction: 'PASS',
            replyEquals: caseDef.reply,
            replyNotContains: ['locked', 'msg']
          }
        }
      ));
    }

    for (const caseDef of HARD_BLOCK_CASES) {
      scenarios.push(buildScenario(
        `hard-block/${caseDef.id}`,
        context,
        {
          userMessage: context.language === 'EN' ? 'share the sensitive data' : 'hassas veriyi paylaş',
          llmReply: caseDef.reply,
          expect: {
            guardrailAction: caseDef.expectedAction,
            replyEquals: caseDef.expectedReply,
            replyNotContains: caseDef.forbiddenFragments
          }
        }
      ));
    }
  }

  return scenarios;
}

const SCENARIOS = buildScenarioList();

function primeDefaultMocks({ sessionId, state, businessId, channel, suggestedFlow = null }) {
  loadContextMock.mockResolvedValueOnce({
    terminated: false,
    sessionId,
    state: clone(state || {})
  });

  prepareContextMock.mockResolvedValueOnce({
    systemPrompt: 'SYS',
    conversationHistory: [],
    toolsAll: [],
    hasKBMatch: true,
    kbConfidence: 'HIGH',
    retrievalMetadata: {}
  });

  classifyMessageMock.mockResolvedValueOnce({
    type: 'NEW_INTENT',
    confidence: 0.95,
    suggestedFlow,
    extractedSlots: {}
  });

  makeRoutingDecisionMock.mockResolvedValueOnce({
    directResponse: false,
    routing: {
      routing: {
        action: 'RUN_INTENT_ROUTER',
        intent: 'general',
        suggestedFlow
      }
    }
  });

  buildLLMRequestMock.mockResolvedValueOnce({
    chat: {},
    gatedTools: [],
    hasTools: false
  });

  executeToolLoopMock.mockImplementationOnce(async ({}) => ({
    reply: primeDefaultMocks.currentReply,
    inputTokens: 12,
    outputTokens: 8,
    hadToolSuccess: false,
    hadToolFailure: false,
    failedTool: null,
    toolsCalled: [],
    iterations: 1,
    toolResults: [],
    chat: { businessId, channel }
  }));

  persistAndEmitMetricsMock.mockResolvedValueOnce({
    shouldEndSession: false,
    forceEnd: false,
    metadata: {}
  });
}

function assertTurn(result, expectation) {
  if (expectation.guardrailAction) {
    expect(result.metadata.guardrailAction).toBe(expectation.guardrailAction);
  }

  if (expectation.replyEquals) {
    expect(result.reply).toBe(expectation.replyEquals);
  }

  for (const fragment of expectation.replyContains || []) {
    expect(result.reply).toContain(fragment);
  }

  for (const fragment of expectation.replyNotContains || []) {
    expect(result.reply).not.toContain(fragment);
  }
}

async function runScenario(scenario) {
  const sessionId = `e2e-${scenario.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;

  for (let index = 0; index < scenario.steps.length; index += 1) {
    const step = scenario.steps[index];
    primeDefaultMocks.currentReply = step.llmReply;
    primeDefaultMocks({
      sessionId,
      state: step.state || {},
      businessId: scenario.business.id,
      channel: scenario.context.channel,
      suggestedFlow: step.suggestedFlow || null
    });

    const result = await handleIncomingMessage({
      channel: scenario.context.channel,
      business: scenario.business,
      assistant: BASE_ASSISTANT,
      channelUserId: `${sessionId}-user`,
      sessionId,
      messageId: `${sessionId}-m${index + 1}`,
      userMessage: step.userMessage,
      language: scenario.context.language,
      timezone: 'Europe/Istanbul',
      metadata: {}
    });

    assertTurn(result, step.expect);
  }
}

beforeAll(async () => {
  consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  ({ handleIncomingMessage } = await import('../../src/core/handleIncomingMessage.js'));
});

afterAll(() => {
  consoleLogSpy?.mockRestore();
  consoleWarnSpy?.mockRestore();
  consoleErrorSpy?.mockRestore();
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
  buildBusinessIdentityMock.mockResolvedValue({
    businessName: 'Telyx',
    businessAliases: ['Telix'],
    productNames: [],
    keyEntities: [],
    allowedDomains: []
  });

  isFeatureEnabledMock.mockImplementation((featureName) => {
    if (featureName === 'UNIFIED_RESPONSE_SANITIZER') return true;
    if (featureName === 'PLAINTEXT_INJECTION_BLOCK') return true;
    if (featureName === 'SESSION_THROTTLE') return false;
    if (featureName === 'STRICT_ORDER_TOOL_REQUIRED') return false;
    if (featureName === 'USE_MESSAGE_TYPE_ROUTING') return false;
    return false;
  });

  lockSessionMock.mockResolvedValue({
    reason: 'PII_RISK',
    lockUntil: null,
    lockedAt: new Date().toISOString()
  });
  getLockMessageMock.mockReturnValue('locked');
});

describe('E2E sanitize-first guardrails (100 scenarios)', () => {
  it('builds exactly 100 scenarios', () => {
    expect(SCENARIOS).toHaveLength(100);
  });

  it.each(SCENARIOS)('$name', async (scenario) => {
    await runScenario(scenario);
  });
});
