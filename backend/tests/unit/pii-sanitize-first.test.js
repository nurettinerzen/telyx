import { describe, expect, it } from '@jest/globals';
import { sanitizeResponse } from '../../src/utils/response-firewall.js';
import { preventPIILeak } from '../../src/core/email/policies/piiPreventionPolicy.js';

describe('sanitize-first PII pipeline', () => {
  it('keeps public business emails when allowlisted', () => {
    const response = 'Destek için support@example.com adresine yazabilirsiniz.';

    const result = sanitizeResponse(response, 'TR', {
      channel: 'CHAT',
      allowedEmails: ['support@example.com']
    });

    expect(result.safe).toBe(true);
    expect(result.modified).toBe(false);
    expect(result.sanitized).toBe(response);
  });

  it('masks recoverable phone leaks without full fallback', () => {
    const response = 'Kayıtlı telefon numaranız 05551234567 görünüyor.';

    const result = sanitizeResponse(response, 'TR', {
      channel: 'CHAT'
    });

    expect(result.safe).toBe(true);
    expect(result.modified).toBe(true);
    expect(result.sanitized).not.toBe(response);
    expect(result.redactions.map(item => item.type)).toContain('PHONE');
  });

  it('sanitizes phone and TCKN in strict mode instead of blocking the whole response', () => {
    const response = 'Telefon: 05551234567, TC: 10000000146';

    const result = preventPIILeak(response, {
      strict: true,
      language: 'TR'
    });

    expect(result.blocked).toBe(false);
    expect(result.modified).toBe(true);
    expect(result.content).not.toContain('05551234567');
    expect(result.content).not.toContain('10000000146');
    expect(result.modifications.map(item => item.type)).toEqual(expect.arrayContaining(['FULL_PHONE', 'TC_KIMLIK']));
  });

  it('still blocks hard secrets in strict mode', () => {
    const response = 'Ödeme kartı: 4532015112830366';

    const result = preventPIILeak(response, {
      strict: true,
      language: 'TR'
    });

    expect(result.blocked).toBe(true);
    expect(result.findings.map(item => item.type)).toContain('CREDIT_CARD');
  });

  it('blocks Turkish password disclosures with uppercase sifre label', () => {
    const response = 'Şifre: super-secret-123';

    const result = preventPIILeak(response, {
      strict: true,
      language: 'TR'
    });

    expect(result.blocked).toBe(true);
    expect(result.findings.map(item => item.type)).toContain('PASSWORD');
  });
});
