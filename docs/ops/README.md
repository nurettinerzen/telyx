# Unified Response Trace + Operational Incidents

## Scope
- Channels: `WHATSAPP`, `CHAT`, `EMAIL`, `ADMIN_DRAFT`
- Trace payload schema: [`TRACE_SCHEMA.json`](./TRACE_SCHEMA.json)
- Runtime validator: `backend/src/services/trace/traceBuilder.js`
- Trace writer: `backend/src/services/trace/responseTraceLogger.js`
- Incident evaluator/emitter: `backend/src/services/operationalIncidentLogger.js`

## Feature Flags (Phase 1-2)
- `FEATURE_UNIFIED_RESPONSE_TRACE` (default: `false`)
- `FEATURE_UNIFIED_RESPONSE_TRACE_CANARY_BUSINESS_IDS` (default: empty)
- `FEATURE_OPERATIONAL_INCIDENTS` (default: `false`)
- `FEATURE_OPERATIONAL_INCIDENTS_CANARY_BUSINESS_IDS` (default: empty)
- `FEATURE_REDALERT_OPS_PANEL` (default: `false`)
- `FEATURE_REDALERT_OPS_PANEL_CANARY_BUSINESS_IDS` (default: empty)
- `FEATURE_POLICY_APPEND_MODE` (default: `legacy`, allowed: `legacy|monitor_only|off`)
- `FEATURE_POLICY_APPEND_CANARY_BUSINESS_IDS` (default: empty)
- Frontend: `NEXT_PUBLIC_FEATURE_REDALERT_OPS_PANEL` (default: `false`)

## Example Trace
```json
{
  "trace_id": "trc_4fd8f8f6b6e7442f8f9de62e",
  "timestamp": "2026-03-05T10:20:00.000Z",
  "channel": "WHATSAPP",
  "requestId": "req_1741170000000",
  "businessId": 42,
  "userId": "905555555555",
  "sessionId": "conv_01J...",
  "messageId": "wamid.HBg...",
  "llm_used": true,
  "model": "gpt-4.1-mini",
  "prompt_hash": null,
  "completion_id": null,
  "plan": {
    "intent": "order_status",
    "slots": {
      "order_number": "ORD-2024-0005"
    },
    "next_question": null,
    "tool_candidates": [],
    "tool_selected": "customer_data_lookup",
    "confidence": 0.94
  },
  "tools_called": [
    {
      "name": "customer_data_lookup",
      "input": {},
      "outcome": "OK",
      "latency_ms": 212,
      "retry_count": 0,
      "error_code": null
    }
  ],
  "verification_state": "passed",
  "response_source": "LLM",
  "postprocessors_applied": [
    "prepend_pii_warning"
  ],
  "guardrail": {
    "action": "PASS",
    "reason": null
  },
  "final_response_length": 163,
  "language": "TR",
  "latency_ms": 1520,
  "details": {
    "response_origin_raw": "LLM",
    "origin_id": "toolLoop.finalModelResponse",
    "llm_status": "success",
    "llm_bypass_reason": null,
    "response_hash": "f2f6...",
    "tool_outcome_hash": "a13b...",
    "policy_append": {
      "mode": "monitor_only",
      "topic": "policy_topic",
      "append_key": "nextStep+contactChannel",
      "length": 87,
      "would_append": true
    }
  }
}
```

## DB Query Examples
```sql
-- Recent traces (last 50)
SELECT id, "traceId", channel, "businessId", "sessionId", "responseSource", "createdAt"
FROM "ResponseTrace"
ORDER BY "createdAt" DESC
LIMIT 50;

-- Recent operational incidents
SELECT id, category, severity, channel, "traceId", summary, "createdAt"
FROM "OperationalIncident"
ORDER BY "createdAt" DESC
LIMIT 50;

-- Incident counts by category (24h)
SELECT category, COUNT(*) AS count
FROM "OperationalIncident"
WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
GROUP BY category
ORDER BY count DESC;

-- Response-source distribution (24h)
SELECT "responseSource", COUNT(*) AS count
FROM "ResponseTrace"
WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
GROUP BY "responseSource";
```

