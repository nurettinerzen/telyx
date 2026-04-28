const AUTH_SERVER_CODES = new Set([
  'AUTHENTICATIONFAILED',
  'AUTHFAILED',
  'LOGINFAILED',
  'INVALID_CREDENTIALS'
]);

const HOST_LOOKUP_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN']);
const CONNECTIVITY_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ETIMEDOUT', 'ESOCKET']);
const TLS_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
]);

function normalizeValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeErrorText(error = {}) {
  return [
    error?.message,
    error?.responseText,
    error?.response,
    error?.serverResponseCode,
    error?.code,
    error?.command,
    error?.executedCommand
  ]
    .map(normalizeValue)
    .filter(Boolean)
    .join(' | ')
    .toLowerCase();
}

function extractErrorDetail(error = {}) {
  const candidates = [error?.responseText, error?.response, error?.message];

  for (const candidate of candidates) {
    const detail = normalizeValue(candidate);
    if (!detail) continue;
    if (/^error:\s*/i.test(detail)) {
      return detail.replace(/^error:\s*/i, '').slice(0, 220);
    }
    if (/^command failed$/i.test(detail)) continue;
    return detail.slice(0, 220);
  }

  return null;
}

function isImapAuthFailure(error, normalizedText) {
  const serverCode = normalizeValue(error?.serverResponseCode).toUpperCase();
  const executedCommand = normalizeValue(error?.executedCommand).toUpperCase();

  return (
    error?.authenticationFailed === true ||
    AUTH_SERVER_CODES.has(serverCode) ||
    executedCommand.includes('AUTHENTICATE') ||
    normalizedText.includes('authentication failed') ||
    normalizedText.includes('authenticate plain')
  );
}

function isSmtpAuthFailure(error, normalizedText) {
  const code = normalizeValue(error?.code).toUpperCase();
  const command = normalizeValue(error?.command).toUpperCase();
  const responseCode = Number(error?.responseCode || 0);

  return (
    code === 'EAUTH' ||
    responseCode === 535 ||
    command.includes('AUTH') ||
    normalizedText.includes('invalid login') ||
    normalizedText.includes('username and password not accepted') ||
    normalizedText.includes('authentication unsuccessful')
  );
}

function isHostLookupFailure(error, normalizedText) {
  const code = normalizeValue(error?.code).toUpperCase();
  return HOST_LOOKUP_CODES.has(code) || normalizedText.includes('getaddrinfo');
}

function isTlsFailure(error, normalizedText) {
  const code = normalizeValue(error?.code).toUpperCase();
  return (
    TLS_CODES.has(code) ||
    normalizedText.includes('certificate') ||
    normalizedText.includes('ssl routines') ||
    normalizedText.includes('tls')
  );
}

function isSmtpGreetingFailure(error, normalizedText) {
  const command = normalizeValue(error?.command).toUpperCase();

  return (
    command === 'CONN' &&
    (
      normalizedText.includes('greeting never received') ||
      normalizedText.includes('did not send a greeting')
    )
  );
}

function isConnectivityFailure(error, normalizedText) {
  const code = normalizeValue(error?.code).toUpperCase();
  return CONNECTIVITY_CODES.has(code) || normalizedText.includes('connection timeout');
}

function isMailboxUnavailable(normalizedText) {
  return (
    normalizedText.includes('mailbox') &&
    (
      normalizedText.includes('does not exist') ||
      normalizedText.includes('not found') ||
      normalizedText.includes('unavailable') ||
      normalizedText.includes('cannot open')
    )
  );
}

export function formatEmailConnectionError(error = {}) {
  const detail = extractErrorDetail(error);
  const normalizedText = normalizeErrorText(error);

  if (isSmtpAuthFailure(error, normalizedText)) {
    return {
      code: 'SMTP_AUTH_FAILED',
      message:
        'SMTP login failed. Double-check the outgoing mail username, password, and SMTP security settings.',
      details: detail
    };
  }

  if (isImapAuthFailure(error, normalizedText)) {
    return {
      code: 'IMAP_AUTH_FAILED',
      message:
        'IMAP login failed. Check your email address or username and password. If this mailbox uses 2FA, use an app password and make sure IMAP access is enabled.',
      details: detail
    };
  }

  if (isHostLookupFailure(error, normalizedText)) {
    return {
      code: 'EMAIL_SERVER_NOT_FOUND',
      message: 'We could not find the mail server. Double-check the IMAP and SMTP host names.',
      details: detail
    };
  }

  if (isTlsFailure(error, normalizedText)) {
    return {
      code: 'EMAIL_TLS_FAILED',
      message:
        'A secure connection to the mail server failed. Check the SSL or TLS setting and confirm the server certificate is valid.',
      details: detail
    };
  }

  if (isSmtpGreetingFailure(error, normalizedText)) {
    return {
      code: 'SMTP_GREETING_FAILED',
      message:
        'The SMTP server did not send its greeting. This usually means the SMTP host, port, or SSL or TLS mode is wrong. Try port 465 with SSL or TLS on, or port 587 with SSL or TLS off.',
      details: detail
    };
  }

  if (isConnectivityFailure(error, normalizedText)) {
    return {
      code: 'EMAIL_SERVER_UNREACHABLE',
      message:
        'We could not reach the mail server. Check the host, port, and SSL or TLS setting, then try again.',
      details: detail
    };
  }

  if (isMailboxUnavailable(normalizedText)) {
    return {
      code: 'EMAIL_MAILBOX_UNAVAILABLE',
      message: 'The mailbox could not be opened after login. Make sure the account has access to the inbox.',
      details: detail
    };
  }

  return {
    code: 'EMAIL_CONNECTION_FAILED',
    message: 'We could not connect to the mailbox. Double-check the IMAP and SMTP settings and try again.',
    details: detail
  };
}
