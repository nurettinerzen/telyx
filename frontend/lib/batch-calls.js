const RESTART_SUFFIX_PATTERNS = [
  /(?:\s*-\s*)?Retry \d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/i,
  /(?:\s*-\s*)?Tekrar Arama$/i,
  /(?:\s*-\s*)?Repeat Call$/i,
  /(?:\s*-\s*)?Restarted$/i,
  /(?:\s*-\s*)?Restart$/i
];

export function extractBatchCallNameParts(name = '') {
  const originalName = String(name || '').trim();
  let baseName = originalName;
  let isRestart = false;
  let changed = true;

  while (baseName && changed) {
    changed = false;

    for (const pattern of RESTART_SUFFIX_PATTERNS) {
      if (pattern.test(baseName)) {
        baseName = baseName.replace(pattern, '').trim();
        isRestart = true;
        changed = true;
      }
    }
  }

  return {
    baseName: baseName || '',
    isRestart,
    originalName
  };
}

export function formatBatchCallDisplayName(name = '', {
  restartLabel = 'Repeat Call',
  fallbackName = 'Campaign'
} = {}) {
  const { baseName, isRestart, originalName } = extractBatchCallNameParts(name);

  if (isRestart) {
    return baseName ? `${baseName} - ${restartLabel}` : restartLabel;
  }

  return baseName || originalName || fallbackName;
}

export function normalizeBatchTerminationReason(reason) {
  const rawReason = String(reason || '').trim();
  if (!rawReason) {
    return null;
  }

  const normalized = rawReason.toLowerCase();

  if (
    normalized === 'agent_goodbye'
    || normalized === 'agent_ended'
    || normalized.includes('end_call')
    || normalized.includes('tool was called')
    || normalized.includes('assistant')
    || normalized.includes('agent')
    || normalized.includes('ai ended')
    || normalized.includes('local')
  ) {
    return 'agent_goodbye';
  }

  if (
    normalized === 'user_goodbye'
    || normalized === 'client_ended'
    || normalized === 'client ended'
    || normalized === 'user_ended'
    || normalized.includes('remote party')
    || normalized.includes('client')
    || normalized.includes('customer')
    || normalized.includes('hangup')
    || normalized.includes('hung up')
    || normalized.includes('user ended')
  ) {
    return 'user_goodbye';
  }

  if (normalized === 'voicemail_detected' || normalized.includes('voicemail')) {
    return 'voicemail_detected';
  }

  if (
    normalized === 'no_input'
    || normalized === 'system_timeout'
    || normalized === 'no_answer'
    || normalized.includes('timeout')
    || normalized.includes('silence')
    || normalized.includes('inactivity')
    || normalized.includes('no input')
    || normalized.includes('no_answer')
  ) {
    return 'no_input';
  }

  if (
    normalized === 'completed'
    || normalized === 'call_ended'
    || normalized === 'call ended'
    || normalized === 'done'
    || normalized === 'finished'
  ) {
    return 'completed';
  }

  if (normalized === 'failed' || normalized === 'error' || normalized.includes('failed') || normalized.includes('error')) {
    return 'failed';
  }

  return rawReason;
}
