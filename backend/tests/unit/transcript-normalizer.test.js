import { describe, expect, it } from '@jest/globals';

import {
  cleanTranscriptText,
  getTranscriptAbsoluteTimestamp,
  getTranscriptTimeInCallSeconds,
  normalizeTranscriptBundle,
} from '../../src/utils/transcript.js';

describe('transcript normalization helpers', () => {
  it('removes bracketed speech style tags from transcript text', () => {
    expect(
      cleanTranscriptText('[warmly] Merhaba. [confidently] Size nasil yardimci olabilirim?')
    ).toBe('Merhaba. Size nasil yardimci olabilirim?');
  });

  it('treats small numeric timestamps as seconds within the call', () => {
    expect(getTranscriptTimeInCallSeconds({ timestamp: 15 })).toBe(15);
    expect(getTranscriptAbsoluteTimestamp({ timestamp: 15 })).toBeNull();
  });

  it('keeps real timestamps and cleans transcript payloads', () => {
    const { transcript, transcriptText } = normalizeTranscriptBundle([
      {
        role: 'agent',
        message: '[warmly] Merhaba, ben Telyx.',
        time_in_call_secs: 5,
      },
      {
        role: 'user',
        message: 'Merhaba',
        timestamp: '2026-04-21T09:30:00.000Z',
      },
    ]);

    expect(transcript).toEqual([
      {
        speaker: 'assistant',
        text: 'Merhaba, ben Telyx.',
        timeInCallSecs: 5,
        time_in_call_secs: 5,
      },
      {
        speaker: 'user',
        text: 'Merhaba',
        timestamp: '2026-04-21T09:30:00.000Z',
      },
    ]);

    expect(transcriptText).toBe('assistant: Merhaba, ben Telyx.\nuser: Merhaba');
  });
});
