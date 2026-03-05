/**
 * Phase 3 prep: typed slot contract (not wired to runtime yet).
 */

export type SlotPrimitive = string | number | boolean | null;

export type SlotMap = Record<string, SlotPrimitive>;

export interface CrossSlotRuleResult {
  ok: boolean;
  code?: string;
  message?: string;
}

export interface SlotSchemaContract {
  intent: string;
  slots: SlotMap;
}

/**
 * Minimal cross-slot rules placeholder.
 * Router/orchestrator v2 integration is intentionally deferred behind flags.
 */
export function validateCrossSlotRules(contract: SlotSchemaContract): CrossSlotRuleResult[] {
  const results: CrossSlotRuleResult[] = [];

  const hasOrder = typeof contract.slots.order_number === 'string' && contract.slots.order_number.length > 0;
  const hasPhoneLast4 = typeof contract.slots.phone_last4 === 'string' && contract.slots.phone_last4.length > 0;
  if (hasPhoneLast4 && !hasOrder && contract.intent === 'order_status') {
    results.push({
      ok: false,
      code: 'ORDER_NUMBER_REQUIRED',
      message: 'order_status intent requires order_number when phone_last4 is provided'
    });
  }

  if (results.length === 0) {
    results.push({ ok: true });
  }

  return results;
}

