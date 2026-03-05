/**
 * Phase 3 prep: response trace TS contract + lightweight validator.
 * Runtime write path currently uses JS validator in services/trace/traceBuilder.js.
 */

import type { ToolOutcomeCode } from './toolOutcome';

export type ResponseTraceChannel = 'WHATSAPP' | 'CHAT' | 'EMAIL' | 'ADMIN_DRAFT';
export type VerificationState = 'none' | 'requested' | 'provided' | 'failed' | 'passed';
export type ResponseSource = 'LLM' | 'template' | 'fallback' | 'policy_append';

export interface ResponseTraceToolCall {
  name: string;
  input: Record<string, unknown>;
  outcome: ToolOutcomeCode;
  latency_ms: number;
  retry_count?: number;
  error_code?: string | null;
}

export interface ResponseTraceContract {
  trace_id: string;
  timestamp: string;
  channel: ResponseTraceChannel;
  requestId: string;
  businessId: number | string;
  userId: number | string | null;
  sessionId: string;
  messageId: string | null;
  llm_used: boolean;
  model: string | null;
  prompt_hash: string | null;
  completion_id: string | null;
  plan: {
    intent: string;
    slots: Record<string, string | number | boolean | null>;
    next_question?: string | null;
    tool_candidates: string[];
    tool_selected: string | null;
    confidence?: number | null;
  };
  tools_called: ResponseTraceToolCall[];
  verification_state: VerificationState;
  response_source: ResponseSource;
  postprocessors_applied: string[];
  guardrail?: { action: string; reason?: string | null };
  final_response_length: number;
  language: string;
  latency_ms?: number | null;
  details?: Record<string, unknown>;
}

export function validateResponseTraceContract(payload: unknown): payload is ResponseTraceContract {
  if (!payload || typeof payload !== 'object') return false;
  const trace = payload as Partial<ResponseTraceContract>;
  return (
    typeof trace.trace_id === 'string' &&
    typeof trace.timestamp === 'string' &&
    typeof trace.channel === 'string' &&
    typeof trace.requestId === 'string' &&
    trace.businessId !== undefined &&
    typeof trace.sessionId === 'string' &&
    typeof trace.llm_used === 'boolean' &&
    !!trace.plan &&
    Array.isArray(trace.tools_called) &&
    typeof trace.response_source === 'string' &&
    Array.isArray(trace.postprocessors_applied) &&
    typeof trace.final_response_length === 'number' &&
    typeof trace.language === 'string'
  );
}

