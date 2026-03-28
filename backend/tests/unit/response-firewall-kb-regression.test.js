import { describe, expect, it } from '@jest/globals';
import { sanitizeResponse } from '../../src/utils/response-firewall.js';

describe('response firewall KB regression', () => {
  it('allows normal KB-grounded wording that mentions a knowledge source', () => {
    const response = 'Bilgi kaynağımıza göre ürün hasarlı geldiyse önce kargo görevlisiyle tutanak tutmanız gerekiyor.';

    const result = sanitizeResponse(response, 'TR', {
      channel: 'CHAT',
      intent: 'GENERAL'
    });

    expect(result.safe).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('still blocks explicit prompt-style Bilgi Kaynağı headers', () => {
    const response = '## Bilgi Kaynağı\nÜrününüz hasarlı geldiyse önce kargo görevlisiyle tutanak tutun.';

    const result = sanitizeResponse(response, 'TR', {
      channel: 'CHAT',
      intent: 'GENERAL'
    });

    expect(result.safe).toBe(false);
    expect(result.violations).toContain('PROMPT_DISCLOSURE');
  });

  it('preserves public support emails when allowlisted', () => {
    const response = 'Bize destek için support@example.com adresinden ulaşabilirsiniz.';

    const result = sanitizeResponse(response, 'TR', {
      channel: 'CHAT',
      intent: 'GENERAL',
      allowedEmails: ['support@example.com']
    });

    expect(result.safe).toBe(true);
    expect(result.sanitized).toBe(response);
    expect(result.redactions).toEqual([]);
  });

  it('masks recoverable phone leaks instead of replacing the full answer', () => {
    const response = 'Kayıtlı telefon numaranız 05551234567 görünüyor.';

    const result = sanitizeResponse(response, 'TR', {
      channel: 'CHAT',
      intent: 'GENERAL'
    });

    expect(result.safe).toBe(true);
    expect(result.modified).toBe(true);
    expect(result.sanitized).not.toBe(response);
    expect(result.sanitized).toContain('055');
    expect(result.sanitized).toContain('4567');
  });
});
