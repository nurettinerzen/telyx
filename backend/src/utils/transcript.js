const BRACKETED_SPEECH_DIRECTION_REGEX = /\[(?:[a-z]+(?:[\s-][a-z]+)*)\]/gi;
const MULTI_SPACE_REGEX = /\s{2,}/g;
const SPACE_BEFORE_PUNCTUATION_REGEX = /\s+([,.;!?])/g;

function coerceFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return numericValue;
}

export function cleanTranscriptText(text) {
  if (text === null || text === undefined) return '';

  return String(text)
    .replace(BRACKETED_SPEECH_DIRECTION_REGEX, ' ')
    .replace(SPACE_BEFORE_PUNCTUATION_REGEX, '$1')
    .replace(MULTI_SPACE_REGEX, ' ')
    .trim();
}

export function getTranscriptTimeInCallSeconds(message = {}) {
  const explicitSeconds = coerceFiniteNumber(
    message.timeInCallSecs ?? message.time_in_call_secs ?? null
  );

  if (explicitSeconds !== null && explicitSeconds >= 0) {
    return Math.floor(explicitSeconds);
  }

  const rawTimestamp = coerceFiniteNumber(message.timestamp);
  if (rawTimestamp === null || rawTimestamp < 0) return null;

  // Small numeric values from older records are relative offsets in the call,
  // not real Unix timestamps.
  if (rawTimestamp < 24 * 60 * 60) {
    return Math.floor(rawTimestamp);
  }

  return null;
}

export function getTranscriptAbsoluteTimestamp(message = {}) {
  const rawTimestamp = message.timestamp;
  if (rawTimestamp === null || rawTimestamp === undefined || rawTimestamp === '') {
    return null;
  }

  if (rawTimestamp instanceof Date) {
    return Number.isNaN(rawTimestamp.getTime()) ? null : rawTimestamp.toISOString();
  }

  const numericTimestamp = coerceFiniteNumber(rawTimestamp);
  if (numericTimestamp !== null) {
    if (numericTimestamp > 1e12) {
      const fromMilliseconds = new Date(numericTimestamp);
      return Number.isNaN(fromMilliseconds.getTime()) ? null : fromMilliseconds.toISOString();
    }

    if (numericTimestamp > 1e9) {
      const fromSeconds = new Date(numericTimestamp * 1000);
      return Number.isNaN(fromSeconds.getTime()) ? null : fromSeconds.toISOString();
    }

    return null;
  }

  const parsedDate = new Date(rawTimestamp);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString();
}

export function normalizeTranscriptMessage(message = {}) {
  const normalizedSpeaker = message.speaker === 'assistant' || message.role === 'agent' || message.role === 'assistant'
    ? 'assistant'
    : 'user';

  const normalizedText = cleanTranscriptText(
    message.text ?? message.message ?? message.content ?? ''
  );

  const timeInCallSecs = getTranscriptTimeInCallSeconds(message);
  const absoluteTimestamp = getTranscriptAbsoluteTimestamp(message);

  const normalizedMessage = {
    speaker: normalizedSpeaker,
    text: normalizedText
  };

  if (timeInCallSecs !== null) {
    normalizedMessage.timeInCallSecs = timeInCallSecs;
    normalizedMessage.time_in_call_secs = timeInCallSecs;
  }

  if (absoluteTimestamp) {
    normalizedMessage.timestamp = absoluteTimestamp;
  }

  return normalizedMessage;
}

export function normalizeTranscript(transcript) {
  if (!Array.isArray(transcript)) return [];

  return transcript
    .map(normalizeTranscriptMessage)
    .filter((message) => message.text);
}

export function buildTranscriptText(transcript) {
  const normalizedTranscript = normalizeTranscript(transcript);

  return normalizedTranscript
    .map((message) => `${message.speaker}: ${message.text}`)
    .join('\n');
}

export function normalizeTranscriptBundle(transcript) {
  const normalizedTranscript = normalizeTranscript(transcript);

  return {
    transcript: normalizedTranscript,
    transcriptText: buildTranscriptText(normalizedTranscript)
  };
}
