import assert from 'node:assert/strict';
import {
  applyLeakFilter,
  GuardrailAction
} from '../../src/guardrails/securityGateway.js';
import { applyGuardrails } from '../../src/core/orchestrator/steps/07_guardrails.js';
import {
  createAnchor,
  checkVerification,
  requiresVerification
} from '../../src/services/verification-service.js';
import { buildTrace } from '../../src/services/trace/traceBuilder.js';

const scenarios = [];

function addScenario(name, fn) {
  scenarios.push({ name, fn });
}

function buildGuardrailParams({
  channel = 'CHAT',
  verificationState = 'none',
  verifiedIdentity = null,
  toolOutput = null
} = {}) {
  return {
    responseText: 'Talebinizi güvenli şekilde işleyebilmem için gerekli kontrolleri yapıyorum.',
    hadToolSuccess: true,
    toolsCalled: ['customer_data_lookup'],
    toolOutputs: toolOutput ? [toolOutput] : [],
    chat: { businessId: 1 },
    language: 'TR',
    sessionId: `smoke-${channel.toLowerCase()}`,
    channel,
    metrics: {},
    userMessage: 'siparişim nerede?',
    verificationState,
    verifiedIdentity,
    intent: 'order_status',
    collectedData: {},
    callbackPending: false,
    activeFlow: 'ORDER_STATUS'
  };
}

function makeCustomerLookupOutput({
  customerId = 'cust-1',
  phone = '+905551112233',
  orderId = 'ORD-2024-0001',
  withSensitiveFields = true
} = {}) {
  const data = withSensitiveFields
    ? {
      customerId,
      customerName: 'Servis Müşteri 9',
      phone,
      order: {
        orderId,
        orderNumber: orderId,
        status: 'kargoda',
        trackingNumber: 'TRK-998877'
      }
    }
    : {
      general_policy: 'İade süresi 14 gündür.'
    };

  return {
    name: 'customer_data_lookup',
    success: true,
    outcome: 'OK',
    output: {
      data,
      _identityContext: {
        anchorCustomerId: customerId,
        anchorId: orderId
      }
    }
  };
}

// ============================================================================
// A) Leak filter scenarios (20)
// ============================================================================
addScenario('LF-01 phone digits sanitized TR', () => {
  const result = applyLeakFilter('Telefon numarası 05551234567', 'none', 'TR', {});
  assert.equal(result.action, GuardrailAction.SANITIZE);
  assert.ok(result.sanitized.includes('*'));
});

addScenario('LF-02 phone digits sanitized EN', () => {
  const result = applyLeakFilter('Call me at 555-123-4567', 'none', 'EN', {});
  assert.equal(result.action, GuardrailAction.SANITIZE);
});

addScenario('LF-03 internal metadata blocked', () => {
  const result = applyLeakFilter('customer_data_lookup çağrıldı', 'none', 'TR', {});
  assert.equal(result.action, GuardrailAction.BLOCK);
  assert.equal(result.blockReason, 'INTERNAL_METADATA_LEAK');
});

addScenario('LF-04 normal policy response passes', () => {
  const result = applyLeakFilter('İade süresi 14 gündür.', 'none', 'TR', {});
  assert.equal(result.action, GuardrailAction.PASS);
});

addScenario('LF-05 simple greeting passes', () => {
  const result = applyLeakFilter('Merhaba, nasıl yardımcı olabilirim?', 'none', 'TR', {});
  assert.equal(result.action, GuardrailAction.PASS);
});

const structuredDumpSamples = [
  'customer,order,phone\nAli,ORD-1,5551112233\nAyşe,ORD-2,5552223344\nMert,ORD-3,5553334455',
  'musteri|siparis|takip\nCan|ORD-11|TRK111\nEce|ORD-12|TRK222\nDeniz|ORD-13|TRK333',
  '1) Müşteri: A, Sipariş: ORD-1, Telefon: 5551112233\n2) Müşteri: B, Sipariş: ORD-2, Telefon: 5552223344\n3) Müşteri: C, Sipariş: ORD-3, Telefon: 5553334455',
  'order,tracking,adres\nORD-21,TRK21,Kadıköy\nORD-22,TRK22,Beşiktaş\nORD-23,TRK23,Şişli',
  'ticket,customer,email\nTKT-1,Ali,a@example.com\nTKT-2,Veli,b@example.com\nTKT-3,Ece,c@example.com',
  'müşteri;telefon;borç\nAli;5551112233;1200\nVeli;5552223344;980\nEce;5553334455;430',
  'customer,invoice,balance\nA,INV-1,1200\nB,INV-2,900\nC,INV-3,760',
  'sipariş içerikleri:\n- müşteri: A, sipariş: ORD-90, telefon: 5551112233\n- müşteri: B, sipariş: ORD-91, telefon: 5552223344\n- müşteri: C, sipariş: ORD-92, telefon: 5553334455'
];

structuredDumpSamples.forEach((sample, index) => {
  addScenario(`LF-structured-${index + 1} blocked when unverified`, () => {
    const result = applyLeakFilter(sample, 'none', 'TR', {});
    assert.equal(result.action, GuardrailAction.BLOCK);
    assert.equal(result.blockReason, 'CONTEXTUAL_DATA_LEAK');
  });
});

structuredDumpSamples.slice(0, 4).forEach((sample, index) => {
  addScenario(`LF-verified-${index + 1} not blocked by contextual detector`, () => {
    const result = applyLeakFilter(sample, 'verified', 'TR', {});
    assert.notEqual(result.blockReason, 'CONTEXTUAL_DATA_LEAK');
  });
});

// ============================================================================
// B) Guardrail enforcement scenarios (20)
// ============================================================================
const channels = ['CHAT', 'WHATSAPP', 'EMAIL', 'ADMIN_DRAFT'];

for (const channel of channels) {
  addScenario(`GR-${channel}-01 unverified tool output requires verification`, async () => {
    const result = await applyGuardrails(buildGuardrailParams({
      channel,
      verificationState: 'none',
      verifiedIdentity: null,
      toolOutput: makeCustomerLookupOutput()
    }));
    assert.equal(result.action, GuardrailAction.NEED_MIN_INFO_FOR_TOOL);
    assert.equal(result.blockReason, 'VERIFICATION_REQUIRED');
  });

  addScenario(`GR-${channel}-02 verified+matching identity passes`, async () => {
    const toolOutput = makeCustomerLookupOutput({
      customerId: 'cust-777',
      phone: '+905551112233',
      orderId: 'ORD-777'
    });
    const result = await applyGuardrails(buildGuardrailParams({
      channel,
      verificationState: 'verified',
      verifiedIdentity: {
        customerId: 'cust-777',
        phone: '+905551112233',
        orderId: 'ORD-777'
      },
      toolOutput
    }));
    assert.equal(result.action, GuardrailAction.PASS);
  });

  addScenario(`GR-${channel}-03 verified+mismatching identity blocked`, async () => {
    const toolOutput = makeCustomerLookupOutput({
      customerId: 'cust-999',
      phone: '+905559999999',
      orderId: 'ORD-999'
    });
    const result = await applyGuardrails(buildGuardrailParams({
      channel,
      verificationState: 'verified',
      verifiedIdentity: {
        customerId: 'cust-777',
        phone: '+905551112233',
        orderId: 'ORD-777'
      },
      toolOutput
    }));
    assert.equal(result.action, GuardrailAction.BLOCK);
    assert.equal(result.blockReason, 'IDENTITY_MISMATCH');
  });

  addScenario(`GR-${channel}-04 public-only tool output does not require verification`, async () => {
    const result = await applyGuardrails(buildGuardrailParams({
      channel,
      verificationState: 'none',
      verifiedIdentity: null,
      toolOutput: makeCustomerLookupOutput({ withSensitiveFields: false })
    }));
    assert.notEqual(result.blockReason, 'VERIFICATION_REQUIRED');
  });

  addScenario(`GR-${channel}-05 structured response blocked when unverified`, async () => {
    const result = await applyGuardrails({
      ...buildGuardrailParams({
        channel,
        verificationState: 'none',
        verifiedIdentity: null,
        toolOutput: null
      }),
      toolsCalled: [],
      toolOutputs: [],
      hadToolSuccess: false,
      responseText: 'customer,order,phone\nAli,ORD-1,5551112233\nVeli,ORD-2,5552223344\nEce,ORD-3,5553334455'
    });
    assert.equal(result.blocked, true);
    assert.ok([GuardrailAction.BLOCK, GuardrailAction.SANITIZE].includes(result.action));
  });
}

// ============================================================================
// C) Verification service scenarios (10)
// ============================================================================
const requiredQueryTypes = [
  'siparis',
  'order',
  'servis',
  'service',
  'ariza',
  'ticket',
  'borc',
  'debt'
];

requiredQueryTypes.forEach((queryType, index) => {
  addScenario(`VS-required-${index + 1} ${queryType} requires verification`, () => {
    assert.equal(requiresVerification(queryType), true);
  });
});

addScenario('VS-general query remains exempt', () => {
  assert.equal(requiresVerification('genel'), false);
});

addScenario('VS-checkVerification asks phone_last4 when no input', () => {
  const anchor = createAnchor(
    { id: 'ord-1', customerName: 'Ali Test', customerPhone: '+905551112233' },
    'order',
    'ORD-1',
    'CrmOrder'
  );
  const result = checkVerification(anchor, null, 'siparis', 'TR');
  assert.equal(result.action, 'REQUEST_VERIFICATION');
  assert.equal(result.askFor, 'phone_last4');
});

// ============================================================================
// D) Trace normalization scenarios (6)
// ============================================================================
[
  ['pending', 'requested'],
  ['verified', 'passed'],
  ['requested', 'requested'],
  ['failed', 'failed'],
  ['none', 'none'],
  ['invalid-state', 'none']
].forEach(([input, expected], index) => {
  addScenario(`TR-${index + 1} verification state ${input} -> ${expected}`, () => {
    const trace = buildTrace({
      context: {
        channel: 'CHAT',
        businessId: 1,
        sessionId: 'trace-smoke',
        verificationState: input
      },
      llmMeta: { called: false },
      plan: { intent: 'smoke' },
      tools: [],
      finalResponse: 'ok'
    });
    assert.equal(trace.payload.verification_state, expected);
  });
});

async function run() {
  let passed = 0;
  let failed = 0;
  const failures = [];

  console.log(`\n🧪 Security hardening smoke started (${scenarios.length} scenarios)\n`);

  for (let index = 0; index < scenarios.length; index += 1) {
    const scenario = scenarios[index];
    const label = `${String(index + 1).padStart(2, '0')}/${scenarios.length}`;
    try {
      await scenario.fn();
      passed += 1;
      console.log(`✅ [${label}] ${scenario.name}`);
    } catch (error) {
      failed += 1;
      const reason = error?.message || String(error);
      failures.push({ name: scenario.name, reason });
      console.error(`❌ [${label}] ${scenario.name}`);
      console.error(`   ${reason}`);
    }
  }

  console.log('\n' + '='.repeat(64));
  console.log(`Scenarios: ${scenarios.length}`);
  console.log(`Passed:    ${passed}`);
  console.log(`Failed:    ${failed}`);
  console.log('='.repeat(64));

  if (failed > 0) {
    console.error('\nFailed scenarios:');
    for (const failure of failures) {
      console.error(`- ${failure.name}: ${failure.reason}`);
    }
    process.exit(1);
  }

  process.exit(0);
}

run().catch((error) => {
  console.error('Fatal smoke runner error:', error);
  process.exit(1);
});
