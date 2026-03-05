#!/usr/bin/env node

import { ensurePolicyGuidance } from '../../src/services/tool-fail-handler.js';
import { buildTrace } from '../../src/services/trace/traceBuilder.js';
import {
  evaluateIncidents,
  OP_INCIDENT_CATEGORY
} from '../../src/services/operationalIncidentLogger.js';
import { overrideFeatureFlag } from '../../src/config/feature-flags.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  console.log('🧪 Unified Trace + Ops Incident smoke started');

  overrideFeatureFlag('POLICY_APPEND_MODE', 'monitor_only');
  const monitorResult = ensurePolicyGuidance(
    'İade talebiniz reddedildi.',
    'İade talebim neden reddedildi?',
    'TR',
    { businessId: 42 }
  );

  assert(monitorResult.guidanceAdded === false, 'monitor_only should not append text');
  assert(monitorResult.wouldAppend === true, 'monitor_only should mark wouldAppend');
  assert(typeof monitorResult.policyAppend?.append_key === 'string', 'monitor_only should record append_key');

  const traceBuild = buildTrace({
    context: {
      channel: 'CHAT',
      businessId: 42,
      userId: 'u_42',
      sessionId: 'sess_42',
      messageId: 'msg_42',
      requestId: 'req_42',
      language: 'TR',
      verificationState: 'requested',
      responseSource: 'TEMPLATE',
      llmUsed: false,
      llmBypassReason: 'BYPASS_PROMPT_INJECTION',
      policyAppend: monitorResult.policyAppend,
      latencyMs: 155
    },
    llmMeta: {
      called: false,
      model: 'gpt-4.1-mini',
      status: 'not_called',
      llm_bypass_reason: 'BYPASS_PROMPT_INJECTION'
    },
    plan: {
      intent: 'order_status',
      slots: { order_number: null },
      tool_candidates: ['customer_data_lookup'],
      tool_selected: 'customer_data_lookup',
      confidence: 0.91
    },
    tools: [],
    guardrail: {
      action: 'BLOCK',
      reason: 'VERIFICATION_REQUIRED'
    },
    postprocessors: ['prepend_pii_warning'],
    finalResponse: 'Siparişiniz kargoda görünüyor.'
  });

  assert(traceBuild.validation.valid === true, `trace validation failed: ${traceBuild.validation.errors.join(',')}`);

  traceBuild.payload.details.repeat_response = { detected: true, count: 3 };
  const incidents = evaluateIncidents(traceBuild.payload);

  const categories = new Set(incidents.map(item => item.category));
  assert(categories.has(OP_INCIDENT_CATEGORY.LLM_BYPASSED), 'LLM_BYPASSED incident expected');
  assert(categories.has(OP_INCIDENT_CATEGORY.TEMPLATE_FALLBACK_USED), 'TEMPLATE_FALLBACK_USED incident expected');
  assert(categories.has(OP_INCIDENT_CATEGORY.TOOL_NOT_CALLED_WHEN_EXPECTED), 'TOOL_NOT_CALLED_WHEN_EXPECTED incident expected');
  assert(categories.has(OP_INCIDENT_CATEGORY.VERIFICATION_INCONSISTENT), 'VERIFICATION_INCONSISTENT incident expected');
  assert(categories.has(OP_INCIDENT_CATEGORY.RESPONSE_STUCK), 'RESPONSE_STUCK incident expected');

  overrideFeatureFlag('POLICY_APPEND_MODE', 'off');
  const offResult = ensurePolicyGuidance(
    'İade talebiniz reddedildi.',
    'İade talebim neden reddedildi?',
    'TR',
    { businessId: 42 }
  );
  assert(offResult.guidanceAdded === false, 'off mode must not append text');
  assert(offResult.wouldAppend === undefined, 'off mode must not expose wouldAppend telemetry');

  console.log('✅ Unified Trace + Ops Incident smoke passed');
  console.log(JSON.stringify({
    monitor_only: monitorResult.policyAppend,
    trace_id: traceBuild.traceId,
    incident_categories: [...categories]
  }, null, 2));
}

run().catch((error) => {
  console.error('❌ Unified trace smoke failed:', error.message);
  process.exit(1);
});
