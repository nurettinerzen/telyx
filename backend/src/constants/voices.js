// ============================================================================
// VOICE CONSTANTS
// ============================================================================
// Central voice ID mapping for 11Labs
// Internal ID (frontend) → 11Labs Voice ID
// ============================================================================

/**
 * Maps internal voice IDs to 11Labs Voice IDs
 * Used when creating/updating agents in 11Labs Conversational AI
 */
export const VOICE_MAPPING = {
  // Turkish voices
  'tr-m-mirza': '7VqWGAWwo2HMrylfKrcm',
  'tr-m-ali': 'j82ax9yhzfYwq9lDvRWL',
  'tr-m-berat': '5ANiIbDLbNMQ65tBPPDe',
  'tr-m-yasir': 'dgeCtiGkvIwzoR09qzjl',
  'tr-f-eda': 'bj1uMlYGikistcXNmFoh',
  'tr-f-selen': 'JgYekNWmelei0oWTtYie',
  'tr-f-sare': 'NNn9dv8zq2kUo7d3JSGG',
  'tr-f-miray': 'uvU9jrgGLWNPeNA4NgNT',

  // English voices
  'en-m-jude': 'Yg7C1g7suzNt5TisIqkZ',
  'en-m-stokes': 'kHhWB9Fw3aF6ly7JvltC',
  'en-m-andrew': 'QCOsaFukRxK1IUh7WVlM',
  'en-m-ollie': 'jRAAK67SEFE9m7ci5DhD',
  'en-m-josh': 'TxGEqnHWrfWFTfGW9XjX',
  'en-m-adam': 'pNInz6obpgDQGcFmaJgB',
  'en-f-kayla': 'aTxZrSrp47xsP6Ot4Kgd',
  'en-f-shelby': 'rfkTsdZrVWEVhDycUYn9',
  'en-f-roshni': 'fq1SdXsX6OokE10pJ4Xw',
  'en-f-meera': '9TwzC887zQyDD4yBthzD',
  'en-f-rachel': '21m00Tcm4TlvDq8ikWAM',
  'en-f-bella': 'EXAVITQu4vr4xnSDxMaL'
};

/**
 * Default 11Labs voice IDs by language
 */
export const DEFAULT_VOICE_BY_LANGUAGE = {
  tr: 'j82ax9yhzfYwq9lDvRWL', // Kadir Kayışcı
  en: 'Yg7C1g7suzNt5TisIqkZ', // Jude
  de: 'Yg7C1g7suzNt5TisIqkZ', // Fallback to English
  fr: 'Yg7C1g7suzNt5TisIqkZ',
  es: 'Yg7C1g7suzNt5TisIqkZ',
  it: 'Yg7C1g7suzNt5TisIqkZ',
  pt: 'Yg7C1g7suzNt5TisIqkZ',
  ru: 'Yg7C1g7suzNt5TisIqkZ',
  ar: 'Yg7C1g7suzNt5TisIqkZ',
  ja: 'Yg7C1g7suzNt5TisIqkZ',
  ko: 'Yg7C1g7suzNt5TisIqkZ',
  zh: 'Yg7C1g7suzNt5TisIqkZ',
  hi: 'Yg7C1g7suzNt5TisIqkZ',
  nl: 'Yg7C1g7suzNt5TisIqkZ',
  pl: 'Yg7C1g7suzNt5TisIqkZ',
  sv: 'Yg7C1g7suzNt5TisIqkZ'
};

/**
 * Get 11Labs voice ID from internal voice ID
 * @param {string} internalVoiceId - Internal voice ID (e.g., 'tr-m-cihan')
 * @param {string} language - Language code for fallback (e.g., 'tr', 'en')
 * @returns {string} 11Labs voice ID
 */
export function getElevenLabsVoiceId(internalVoiceId, language = 'tr') {
  // Direct mapping lookup
  if (VOICE_MAPPING[internalVoiceId]) {
    return VOICE_MAPPING[internalVoiceId];
  }

  // If it's already an 11Labs ID (24 char alphanumeric), return as-is
  if (internalVoiceId && /^[a-zA-Z0-9]{20,}$/.test(internalVoiceId)) {
    return internalVoiceId;
  }

  // Fallback to default voice for language
  const lang = language?.toLowerCase() || 'tr';
  return DEFAULT_VOICE_BY_LANGUAGE[lang] || DEFAULT_VOICE_BY_LANGUAGE.en;
}

export default {
  VOICE_MAPPING,
  DEFAULT_VOICE_BY_LANGUAGE,
  getElevenLabsVoiceId
};
