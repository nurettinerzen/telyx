import { describe, it, expect } from 'vitest';
import { applyGuardrails } from '../../src/core/orchestrator/steps/07_guardrails.js';
import { applyLeakFilter } from '../../src/guardrails/securityGateway.js';

/**
 * P0 Guardrail Barrier Contract
 *
 * Leak filter artik SADECE phone maskeleme + internal metadata block yapiyor.
 * customerName / address / shipping / delivery / tracking KALDIRILDI.
 * NEED_MIN_INFO_FOR_TOOL artik leak filter'dan tetiklenmez.
 *
 * Guvenlik: Tool gating + LLM prompt ile saglaniyor.
 */

describe('P0 Guardrail Barrier Contract', () => {
  const baseParams = {
    hadToolSuccess: false,
    toolsCalled: [],
    toolOutputs: [],
    chat: null,
    language: 'TR',
    sessionId: 'barrier-test-session',
    channel: 'CHAT',
    metrics: {},
    userMessage: '',
    verificationState: 'none',
    verifiedIdentity: null,
    intent: null,
    collectedData: {}
  };

  it('1) Telyx product explanation with "telefon kanalı" stays PASS (no verification steering)', async () => {
    const result = await applyGuardrails({
      ...baseParams,
      userMessage: 'Telyx nasıl kullanılıyor?',
      responseText: "Telyx'e kaydolup panelden kurulum yaparsınız. Telefon kanalı, WhatsApp ve chat seçeneklerini buradan açabilirsiniz."
    });

    expect(result.action).toBe('PASS');
    expect(result.blocked).not.toBe(true);
    expect(result.finalResponse.toLowerCase()).not.toContain('sipariş');
  });

  it('2) Explicit phone number is sanitized and flow does not change mode', () => {
    const result = applyLeakFilter(
      'Telefon numaram 05551234567, bu numaradan bana ulaşabilirsiniz.',
      'none',
      'TR',
      {}
    );

    expect(result.action).toBe('SANITIZE');
    expect(result.sanitized).not.toContain('05551234567');
    expect(result.sanitized).toContain('*');
  });

  it('3) "kayıtlıdır" does not create any false positive', () => {
    const result = applyLeakFilter('Müşteri bilgisi sistemde kayıtlıdır.', 'none', 'TR', {});

    expect(result.action).toBe('PASS');
  });

  it('4) 11-digit number without tracking context is not classified as tracking', () => {
    const result = applyLeakFilter('Referans no 12345678901 olarak kaydedildi.', 'none', 'TR', {});
    const trackingLeaks = (result.leaks || []).filter(l => l.type === 'tracking');

    expect(trackingLeaks).toHaveLength(0);
  });

  it('5) Shipping/carrier text → PASS (detection removed, security via tool gating)', () => {
    // Eski davranis: NEED_MIN_INFO_FOR_TOOL
    // Yeni davranis: PASS — shipping detection kaldirildi
    const result = applyLeakFilter(
      'Siparişiniz Yurtiçi Kargo ile Kadıköy şubesine gönderildi.',
      'none',
      'TR',
      {}
    );

    expect(result.action).toBe('PASS');
    const shippingLeaks = (result.leaks || []).filter(l => l.type === 'shipping');
    expect(shippingLeaks).toHaveLength(0);
  });
});
