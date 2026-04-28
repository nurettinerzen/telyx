import { describe, expect, it } from '@jest/globals';
import { formatEmailConnectionError } from '../../src/utils/emailConnectionErrors.js';

describe('formatEmailConnectionError', () => {
  it('maps IMAP authentication failures to an actionable message', () => {
    const result = formatEmailConnectionError({
      message: 'Command failed',
      responseText: 'Authentication failed.',
      serverResponseCode: 'AUTHENTICATIONFAILED',
      executedCommand: '2 AUTHENTICATE PLAIN',
      authenticationFailed: true
    });

    expect(result.code).toBe('IMAP_AUTH_FAILED');
    expect(result.message).toContain('IMAP login failed.');
    expect(result.message).toContain('app password');
    expect(result.details).toBe('Authentication failed.');
  });

  it('maps SMTP authentication failures separately', () => {
    const result = formatEmailConnectionError({
      code: 'EAUTH',
      responseCode: 535,
      response: '535 5.7.8 Username and Password not accepted.',
      command: 'AUTH PLAIN'
    });

    expect(result.code).toBe('SMTP_AUTH_FAILED');
    expect(result.message).toContain('SMTP login failed.');
    expect(result.details).toContain('Username and Password not accepted');
  });

  it('flags invalid server names clearly', () => {
    const result = formatEmailConnectionError({
      code: 'ENOTFOUND',
      message: 'getaddrinfo ENOTFOUND imap.example.com'
    });

    expect(result.code).toBe('EMAIL_SERVER_NOT_FOUND');
    expect(result.message).toContain('could not find the mail server');
  });

  it('flags TLS issues clearly', () => {
    const result = formatEmailConnectionError({
      code: 'ERR_TLS_CERT_ALTNAME_INVALID',
      message: 'Hostname/IP does not match certificate alt names'
    });

    expect(result.code).toBe('EMAIL_TLS_FAILED');
    expect(result.message).toContain('secure connection');
  });

  it('falls back to a generic connection error', () => {
    const result = formatEmailConnectionError({
      message: 'Unexpected failure while connecting'
    });

    expect(result.code).toBe('EMAIL_CONNECTION_FAILED');
    expect(result.message).toContain('could not connect to the mailbox');
  });
});
