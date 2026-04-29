import { beforeAll, describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('../../src/config/database.js', () => ({
  default: {}
}));

let evaluateIncidents;
let OP_INCIDENT_CATEGORY;

function buildTracePayload(overrides = {}) {
  return {
    trace_id: 'trc_test_123',
    channel: 'CHAT',
    businessId: 101,
    sessionId: 'sess_123',
    requestId: 'req_123',
    userId: 'user_123',
    messageId: 'msg_123',
    llm_used: true,
    response_source: 'LLM',
    verification_state: 'none',
    plan: {
      intent: 'general',
      tool_selected: null,
      tool_candidates: []
    },
    tools_called: [],
    postprocessors_applied: [],
    guardrail: {
      action: 'PASS',
      reason: null
    },
    details: {
      response_preview: 'Merhaba, size yardimci olabilirim.',
      response_grounding: 'GROUNDED',
      origin_id: 'toolLoop.unknown',
      policy_append: null
    },
    ...overrides
  };
}

beforeAll(async () => {
  ({
    evaluateIncidents,
    OP_INCIDENT_CATEGORY
  } = await import('../../src/services/operationalIncidentLogger.js'));
});

describe('assistant quality incident evaluation', () => {
  it('emits blocked and intervention incidents for blocked assistant replies', () => {
    const incidents = evaluateIncidents(buildTracePayload({
      response_source: 'template',
      guardrail: {
        action: 'BLOCK',
        reason: 'PII_RISK'
      },
      details: {
        response_preview: 'locked',
        response_grounding: 'CLARIFICATION',
        origin_id: 'guardrail.PII_RISK'
      },
      postprocessors_applied: ['route_firewall']
    }));

    const categories = incidents.map(item => item.category);

    expect(categories).toContain(OP_INCIDENT_CATEGORY.ASSISTANT_BLOCKED);
    expect(categories).toContain(OP_INCIDENT_CATEGORY.ASSISTANT_INTERVENTION);
    expect(categories).toContain(OP_INCIDENT_CATEGORY.TEMPLATE_FALLBACK_USED);
  });

  it('emits sanitize incident for recoverable masking paths', () => {
    const incidents = evaluateIncidents(buildTracePayload({
      guardrail: {
        action: 'SANITIZE',
        reason: null
      },
      details: {
        response_preview: 'Telefon numaraniz 055******4567 olarak kayitli.',
        response_grounding: 'GROUNDED',
        origin_id: 'toolLoop.unknown'
      }
    }));

    expect(incidents.map(item => item.category)).toContain(OP_INCIDENT_CATEGORY.ASSISTANT_SANITIZED);
  });

  it('does not emit an incident for normal clarification and verification prompts', () => {
    const incidents = evaluateIncidents(buildTracePayload({
      guardrail: {
        action: 'NEED_MIN_INFO_FOR_TOOL',
        reason: 'NEED_MIN_INFO_FOR_TOOL'
      },
      details: {
        response_preview: 'Devam edebilmem icin siparis numaranizi paylasir misiniz?',
        response_grounding: 'CLARIFICATION',
        origin_id: 'guardrail.NEED_MIN_INFO_FOR_TOOL'
      }
    }));

    expect(incidents.map(item => item.category)).not.toContain(OP_INCIDENT_CATEGORY.ASSISTANT_NEEDS_CLARIFICATION);
    expect(incidents.map(item => item.category)).not.toContain(OP_INCIDENT_CATEGORY.HALLUCINATION_RISK);
    expect(incidents.map(item => item.category)).not.toContain(OP_INCIDENT_CATEGORY.VERIFICATION_INCONSISTENT);
  });

  it('keeps existing tool skipped and hallucination signals', () => {
    const incidents = evaluateIncidents(buildTracePayload({
      plan: {
        intent: 'order_status',
        tool_selected: 'customer_data_lookup',
        tool_candidates: ['customer_data_lookup']
      },
      details: {
        response_preview: 'Siparisiniz kargoda, yarin teslim edilir.',
        response_grounding: 'GROUNDED',
        origin_id: 'toolLoop.unknown'
      }
    }));

    const categories = incidents.map(item => item.category);

    expect(categories).toContain(OP_INCIDENT_CATEGORY.TOOL_NOT_CALLED_WHEN_EXPECTED);
    expect(categories).toContain(OP_INCIDENT_CATEGORY.HALLUCINATION_RISK);
  });

  it('does not emit verification drift for clarification-style verification prompts', () => {
    const incidents = evaluateIncidents(buildTracePayload({
      verification_state: 'requested',
      guardrail: {
        action: 'PASS',
        reason: null
      },
      details: {
        response_preview: 'Siparişinize ulaştım. Güvenliğiniz için telefon numaranızın son dört hanesini teyit etmenizi rica ederim.',
        response_grounding: 'CLARIFICATION',
        origin_id: 'toolLoop.unknown'
      }
    }));

    expect(incidents.map(item => item.category)).not.toContain(OP_INCIDENT_CATEGORY.VERIFICATION_INCONSISTENT);
  });

  it('does not emit hallucination risk for clarification-style prompts without tool evidence', () => {
    const incidents = evaluateIncidents(buildTracePayload({
      details: {
        response_preview: 'Elbette, siparişinizin durumunu öğrenmek için sipariş numaranızı rica edebilir miyim?',
        response_grounding: 'CLARIFICATION',
        origin_id: 'toolLoop.unknown'
      }
    }));

    expect(incidents.map(item => item.category)).not.toContain(OP_INCIDENT_CATEGORY.HALLUCINATION_RISK);
    expect(incidents.map(item => item.category)).not.toContain(OP_INCIDENT_CATEGORY.ASSISTANT_NEEDS_CLARIFICATION);
  });
});
