/**
 * Phase 3 prep: tool outcome contract (not yet active in orchestrator).
 */

export type ToolOutcomeCode =
  | 'OK'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'NEED_MORE_INFO'
  | 'VERIFICATION_REQUIRED'
  | 'DENIED'
  | 'INFRA_ERROR';

export interface ToolOutcomeContract<TData = unknown> {
  toolName: string;
  outcome: ToolOutcomeCode;
  data: TData | null;
  message?: string | null;
  latencyMs?: number;
  retryCount?: number;
  errorCode?: string | null;
}

export function isToolOutcomeCode(value: string): value is ToolOutcomeCode {
  return [
    'OK',
    'NOT_FOUND',
    'VALIDATION_ERROR',
    'NEED_MORE_INFO',
    'VERIFICATION_REQUIRED',
    'DENIED',
    'INFRA_ERROR'
  ].includes(value);
}

