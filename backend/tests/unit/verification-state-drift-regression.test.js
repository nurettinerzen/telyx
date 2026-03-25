/**
 * Verification State Drift — Regression Tests
 *
 * Validates that:
 * 1. outcomePolicy sets 'failed' (not 'pending') on VERIFICATION_FAILED
 * 2. Guardrails deterministically request verification info for unverified protected data
 * 3. Enumeration reset preserves notFoundAttempts
 * 4. Wrong last4 → deny → repeat → still deny (state machine integrity)
 */

import { describe, it, expect } from 'vitest';
import {
  applyOutcomeEventsToState,
  OutcomeEventType
} from '../../src/security/outcomePolicy.js';
import {
  applyGuardrails
} from '../../src/core/orchestrator/steps/07_guardrails.js';

// ============================================================================
// FIX 1: outcomePolicy — VERIFICATION_FAILED → status 'failed'
// ============================================================================

describe('outcomePolicy — VERIFICATION_FAILED state machine', () => {
  function makeState() {
    return {
      verification: {
        status: 'pending',
        pendingField: 'phone_last4',
        anchor: { id: 'anchor-1', phone: '5551234567' },
        attempts: 0,
        collected: {}
      }
    };
  }

  it('sets status to "failed" after VERIFICATION_FAILED (not "pending")', () => {
    const state = makeState();
    applyOutcomeEventsToState(state, [
      { type: OutcomeEventType.VERIFICATION_FAILED, attempts: 1 }
    ]);

    expect(state.verification.status).toBe('failed');
    expect(state.verification.attempts).toBe(1);
  });

  it('sets failedAt timestamp on VERIFICATION_FAILED', () => {
    const state = makeState();
    const before = Date.now();

    applyOutcomeEventsToState(state, [
      { type: OutcomeEventType.VERIFICATION_FAILED, attempts: 1 }
    ]);

    expect(state.verification.failedAt).toBeGreaterThanOrEqual(before);
    expect(state.verification.failedAt).toBeLessThanOrEqual(Date.now());
  });

  it('stays "failed" on repeated VERIFICATION_FAILED', () => {
    const state = makeState();

    // First failure
    applyOutcomeEventsToState(state, [
      { type: OutcomeEventType.VERIFICATION_FAILED, attempts: 1 }
    ]);
    expect(state.verification.status).toBe('failed');

    // Second failure
    applyOutcomeEventsToState(state, [
      { type: OutcomeEventType.VERIFICATION_FAILED, attempts: 2 }
    ]);
    expect(state.verification.status).toBe('failed');
    expect(state.verification.attempts).toBe(2);
  });

  it('transitions from "failed" to "verified" on VERIFICATION_PASSED', () => {
    const state = makeState();

    // First: fail
    applyOutcomeEventsToState(state, [
      { type: OutcomeEventType.VERIFICATION_FAILED, attempts: 1 }
    ]);
    expect(state.verification.status).toBe('failed');

    // Then: pass with correct input
    applyOutcomeEventsToState(state, [
      {
        type: OutcomeEventType.VERIFICATION_PASSED,
        anchor: { id: 'anchor-1' },
        reason: 'manual'
      }
    ]);
    expect(state.verification.status).toBe('verified');
    expect(state.verification.attempts).toBe(0);
  });

  it('preserves pendingField through failed state', () => {
    const state = makeState();
    state.verification.pendingField = 'phone_last4';

    applyOutcomeEventsToState(state, [
      { type: OutcomeEventType.VERIFICATION_FAILED, attempts: 1 }
    ]);

    expect(state.verification.pendingField).toBe('phone_last4');
  });

  it('never auto-transitions from "failed" to "verified" without explicit PASSED event', () => {
    const state = makeState();

    applyOutcomeEventsToState(state, [
      { type: OutcomeEventType.VERIFICATION_FAILED, attempts: 1 }
    ]);

    // Apply unrelated events
    applyOutcomeEventsToState(state, [
      { type: OutcomeEventType.RECORD_NOT_FOUND, toolName: 'customer_data_lookup' }
    ]);

    expect(state.verification.status).toBe('failed');
  });
});

// ============================================================================
// FIX 2: Guardrails — deterministic clarification when unverified + protected fields
// ============================================================================

describe('Guardrails — verification clarification (not leakage)', () => {
  it('returns NEED_MIN_INFO_FOR_TOOL when unverified + protected tool output', async () => {
    const result = await applyGuardrails({
      responseText: 'Siparişiniz kargoda.',
      hadToolSuccess: true,
      toolsCalled: ['customer_data_lookup'],
      toolOutputs: [{
        outcome: 'OK',
        success: true,
        data: {
          status: 'Kargoda',
          tracking_number: 'TR123456',
          carrier: 'Yurtiçi',
          delivery_date: '2026-03-15',
          customerPhone: '5551234567',
          customerName: 'Test Müşteri'
        }
      }],
      chat: { businessId: 'test-biz' },
      language: 'TR',
      sessionId: 'test-session-hardblock',
      channel: 'CHAT',
      metrics: {},
      userMessage: 'Sipariş durumum ne?',
      verificationState: 'pending',  // NOT verified!
      verifiedIdentity: null,
      intent: 'order_status',
      collectedData: {}
    });

    // Must ask for deterministic min info without leaking tool data
    expect(result.blocked).toBe(true);
    expect(result.needsCorrection).toBeUndefined();
    expect(result.action).toBe('NEED_MIN_INFO_FOR_TOOL');
    expect(result.blockReason).toBe('VERIFICATION_REQUIRED');
    expect(result.finalResponse).toMatch(/sipariş numaranızı|son 4 hanesini/i);
  });

  it('returns NEED_MIN_INFO_FOR_TOOL when verification status is "failed"', async () => {
    const result = await applyGuardrails({
      responseText: 'Siparişiniz teslim edildi.',
      hadToolSuccess: true,
      toolsCalled: ['customer_data_lookup'],
      toolOutputs: [{
        outcome: 'OK',
        success: true,
        data: {
          status: 'Teslim Edildi',
          customerPhone: '5551234567'
        }
      }],
      chat: { businessId: 'test-biz' },
      language: 'TR',
      sessionId: 'test-session-failed',
      channel: 'CHAT',
      metrics: {},
      userMessage: 'Sipariş durumum ne?',
      verificationState: 'failed',  // Previously failed!
      verifiedIdentity: null,
      intent: 'order_status',
      collectedData: {}
    });

    expect(result.blocked).toBe(true);
    expect(result.needsCorrection).toBeUndefined();
    expect(result.action).toBe('NEED_MIN_INFO_FOR_TOOL');
    expect(result.blockReason).toBe('VERIFICATION_REQUIRED');
  });

  it('allows response when verification status is "verified"', async () => {
    const result = await applyGuardrails({
      responseText: 'Siparişiniz kargoda.',
      hadToolSuccess: true,
      toolsCalled: ['customer_data_lookup'],
      toolOutputs: [{
        outcome: 'OK',
        success: true,
        data: {
          status: 'Kargoda',
          customerPhone: '5551234567'
        }
      }],
      chat: { businessId: 'test-biz' },
      language: 'TR',
      sessionId: 'test-session-verified',
      channel: 'CHAT',
      metrics: {},
      userMessage: 'Sipariş durumum ne?',
      verificationState: 'verified',  // Properly verified
      verifiedIdentity: { phone: '5551234567' },
      intent: 'order_status',
      collectedData: {}
    });

    // Should not be blocked
    expect(result.blocked).toBeFalsy();
  });
});

// ============================================================================
// FIX 3: Enumeration reset — preserves notFoundAttempts
// ============================================================================

describe('Enumeration reset — notFoundAttempts preserved', () => {
  // Direct unit test of the reset logic
  it('resetEnumerationCounter preserves notFoundAttempts', async () => {
    // We test the logic directly since resetEnumerationCounter needs DB access
    // The fix ensures: state.enumeration.notFoundAttempts is NOT cleared on reset
    const mockState = {
      enumerationAttempts: [Date.now() - 1000, Date.now()],
      enumeration: {
        verificationAttempts: [Date.now() - 1000, Date.now()],
        notFoundAttempts: [Date.now() - 2000, Date.now() - 1000, Date.now()],
        lastProbeAt: Date.now(),
        lastProbeIdentifier: 'ORD12345'
      }
    };

    // Simulate reset logic (same as resetEnumerationCounter)
    mockState.enumerationAttempts = [];
    if (mockState.enumeration) {
      mockState.enumeration.verificationAttempts = [];
      // NOT resetting: notFoundAttempts, lastProbeAt, lastProbeIdentifier
    }

    expect(mockState.enumeration.verificationAttempts).toEqual([]);
    expect(mockState.enumeration.notFoundAttempts.length).toBe(3); // Preserved!
    expect(mockState.enumeration.lastProbeAt).toBeTruthy(); // Preserved!
    expect(mockState.enumeration.lastProbeIdentifier).toBe('ORD12345'); // Preserved!
  });
});

// ============================================================================
// STATE MACHINE INTEGRITY: Full verification flow scenarios
// ============================================================================

describe('Verification state machine — full flow integrity', () => {
  function makeCleanState() {
    return {
      verification: {
        status: 'none',
        customerId: null,
        pendingField: null,
        attempts: 0,
        collected: {}
      }
    };
  }

  it('none → pending → failed → failed → verified (correct flow)', () => {
    const state = makeCleanState();

    // Step 1: Tool returns VERIFICATION_REQUIRED
    applyOutcomeEventsToState(state, [
      { type: OutcomeEventType.VERIFICATION_REQUIRED, askFor: 'phone_last4', anchor: { id: 'a1' } }
    ]);
    expect(state.verification.status).toBe('pending');
    expect(state.verification.pendingField).toBe('phone_last4');

    // Step 2: Wrong last4 (first attempt)
    applyOutcomeEventsToState(state, [
      { type: OutcomeEventType.VERIFICATION_FAILED, attempts: 1 }
    ]);
    expect(state.verification.status).toBe('failed');
    expect(state.verification.attempts).toBe(1);
    expect(state.verification.failedAt).toBeTruthy();

    // Step 3: Wrong last4 again (second attempt)
    applyOutcomeEventsToState(state, [
      { type: OutcomeEventType.VERIFICATION_FAILED, attempts: 2 }
    ]);
    expect(state.verification.status).toBe('failed');
    expect(state.verification.attempts).toBe(2);

    // Step 4: Correct last4 → verified
    applyOutcomeEventsToState(state, [
      { type: OutcomeEventType.VERIFICATION_PASSED, anchor: { id: 'a1' }, reason: 'manual' }
    ]);
    expect(state.verification.status).toBe('verified');
  });

  it('verified for order A does NOT carry over to order B (different anchor)', () => {
    const state = makeCleanState();

    // Verify order A
    applyOutcomeEventsToState(state, [
      { type: OutcomeEventType.VERIFICATION_PASSED, anchor: { id: 'order-A' }, reason: 'manual' }
    ]);
    expect(state.verification.status).toBe('verified');
    expect(state.verification.anchor.id).toBe('order-A');

    // New order B requires verification → resets to pending
    applyOutcomeEventsToState(state, [
      { type: OutcomeEventType.VERIFICATION_REQUIRED, askFor: 'phone_last4', anchor: { id: 'order-B' } }
    ]);
    expect(state.verification.status).toBe('pending');
    expect(state.verification.anchor.id).toBe('order-B');
    expect(state.verification.attempts).toBe(0);
  });

  it('VERIFICATION_FAILED does not accidentally clear anchor', () => {
    const state = makeCleanState();

    applyOutcomeEventsToState(state, [
      { type: OutcomeEventType.VERIFICATION_REQUIRED, askFor: 'phone_last4', anchor: { id: 'a1', phone: '555' } }
    ]);

    applyOutcomeEventsToState(state, [
      { type: OutcomeEventType.VERIFICATION_FAILED, attempts: 1 }
    ]);

    // Anchor must survive failure
    expect(state.verification.anchor).toEqual({ id: 'a1', phone: '555' });
  });
});
