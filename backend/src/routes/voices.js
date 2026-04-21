import express from 'express';
import axios from 'axios';

const router = express.Router();

// 11Labs API configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

// 🌍 VOICE LIBRARY - 15+ LANGUAGES SUPPORT
// Each language has 2 male + 2 female voices from 11Labs
// voice_id refers to actual 11Labs voice IDs
const VOICE_LIBRARY = {
  // TURKISH - 11Labs Turkish voices
  tr: [
    { id: 'tr-m-mirza', voice_id: '7VqWGAWwo2HMrylfKrcm', name: 'Fatih Yildirim', accent: 'Istanbul', gender: 'male', description: 'Derin, net ve zengin erkek ses', provider: '11labs' },
    { id: 'tr-m-ali', voice_id: 'j82ax9yhzfYwq9lDvRWL', name: 'Kadir Kayisci', accent: 'Standard Turkish', gender: 'male', description: 'Olgun, yumusak ve guven veren erkek ses', provider: '11labs' },
    { id: 'tr-m-berat', voice_id: '5ANiIbDLbNMQ65tBPPDe', name: 'Ali Burak', accent: 'Istanbul', gender: 'male', description: 'Sakin, net ve guvenilir erkek ses', provider: '11labs' },
    { id: 'tr-m-yasir', voice_id: 'dgeCtiGkvIwzoR09qzjl', name: 'Murat', accent: 'Istanbul', gender: 'male', description: 'Dinamik, genc ve kendinden emin erkek ses', provider: '11labs' },
    { id: 'tr-f-eda', voice_id: 'bj1uMlYGikistcXNmFoh', name: 'Nisa', accent: 'Standard Turkish', gender: 'female', description: 'Yumusak, sicak ve cesaret veren kadin sesi', provider: '11labs' },
    { id: 'tr-f-selen', voice_id: 'JgYekNWmelei0oWTtYie', name: 'Elvan', accent: 'Standard Turkish', gender: 'female', description: 'Enerjik, sicak ve profesyonel kadin sesi', provider: '11labs' },
    { id: 'tr-f-sare', voice_id: 'NNn9dv8zq2kUo7d3JSGG', name: 'Derya', accent: 'Standard Turkish', gender: 'female', description: 'Canli ve arkadas canlisi kadin sesi', provider: '11labs' },
    { id: 'tr-f-miray', voice_id: 'uvU9jrgGLWNPeNA4NgNT', name: 'Irem', accent: 'Istanbul', gender: 'female', description: 'Otoriter ve guven veren kadin sesi', provider: '11labs' }
  ],

  // ENGLISH - using actual 11Labs English voices
  en: [
    { id: 'en-m-josh', voice_id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', accent: 'American', gender: 'male', description: 'Professional American male', provider: '11labs' },
    { id: 'en-m-adam', voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', accent: 'American', gender: 'male', description: 'Friendly American male', provider: '11labs' },
    { id: 'en-f-rachel', voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', accent: 'American', gender: 'female', description: 'Warm American female', provider: '11labs' },
    { id: 'en-f-bella', voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', accent: 'American', gender: 'female', description: 'Professional American female', provider: '11labs' }
  ],
  
  // GERMAN (Deutsch)
  de: [
    { id: 'de-m-marcus', name: 'Marcus', accent: 'German', gender: 'male', description: 'Professionelle männliche Stimme', provider: '11labs' },
    { id: 'de-m-lukas', name: 'Lukas', accent: 'German', gender: 'male', description: 'Freundliche männliche Stimme', provider: '11labs' },
    { id: 'de-f-sarah', name: 'Sarah', accent: 'German', gender: 'female', description: 'Warme weibliche Stimme', provider: '11labs' },
    { id: 'de-f-hannah', name: 'Hannah', accent: 'German', gender: 'female', description: 'Professionelle weibliche Stimme', provider: '11labs' }
  ],
  
  // FRENCH (Français)
  fr: [
    { id: 'fr-m-antoine', name: 'Antoine', accent: 'French', gender: 'male', description: 'Voix masculine professionnelle', provider: '11labs' },
    { id: 'fr-m-julien', name: 'Julien', accent: 'French', gender: 'male', description: 'Voix masculine chaleureuse', provider: '11labs' },
    { id: 'fr-f-marie', name: 'Marie', accent: 'French', gender: 'female', description: 'Voix féminine élégante', provider: '11labs' },
    { id: 'fr-f-sophie', name: 'Sophie', accent: 'French', gender: 'female', description: 'Voix féminine professionnelle', provider: '11labs' }
  ],
  
  // SPANISH (Español)
  es: [
    { id: 'es-m-diego', name: 'Diego', accent: 'Spanish', gender: 'male', description: 'Voz masculina profesional', provider: '11labs' },
    { id: 'es-m-carlos', name: 'Carlos', accent: 'Spanish', gender: 'male', description: 'Voz masculina cálida', provider: '11labs' },
    { id: 'es-f-lucia', name: 'Lucía', accent: 'Spanish', gender: 'female', description: 'Voz femenina elegante', provider: '11labs' },
    { id: 'es-f-elena', name: 'Elena', accent: 'Spanish', gender: 'female', description: 'Voz femenina profesional', provider: '11labs' }
  ],
  
  // ITALIAN (Italiano)
  it: [
    { id: 'it-m-marco', name: 'Marco', accent: 'Italian', gender: 'male', description: 'Voce maschile professionale', provider: '11labs' },
    { id: 'it-m-luca', name: 'Luca', accent: 'Italian', gender: 'male', description: 'Voce maschile calda', provider: '11labs' },
    { id: 'it-f-giulia', name: 'Giulia', accent: 'Italian', gender: 'female', description: 'Voce femminile elegante', provider: '11labs' },
    { id: 'it-f-chiara', name: 'Chiara', accent: 'Italian', gender: 'female', description: 'Voce femminile professionale', provider: '11labs' }
  ],
  
  // PORTUGUESE (Português Brasileiro) - Uses same 11Labs voices with Portuguese language
  // These multilingual voices support Portuguese when language_code='pt' is set
  pt: [
    { id: 'pt-m-joao', voice_id: 'TxGEqnHWrfWFTfGW9XjX', name: 'João', accent: 'Portuguese', gender: 'male', description: 'Voz masculina profissional', provider: '11labs' },
    { id: 'pt-m-pedro', voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Pedro', accent: 'Portuguese', gender: 'male', description: 'Voz masculina amigável', provider: '11labs' },
    { id: 'pt-f-ana', voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Ana', accent: 'Portuguese', gender: 'female', description: 'Voz feminina calorosa', provider: '11labs' },
    { id: 'pt-f-maria', voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Maria', accent: 'Portuguese', gender: 'female', description: 'Voz feminina elegante', provider: '11labs' }
  ],
  
  // RUSSIAN (Русский)
  ru: [
    { id: 'ru-m-dmitri', name: 'Дмитрий', accent: 'Russian', gender: 'male', description: 'Профессиональный мужской голос', provider: '11labs' },
    { id: 'ru-m-alex', name: 'Александр', accent: 'Russian', gender: 'male', description: 'Тёплый мужской голос', provider: '11labs' },
    { id: 'ru-f-natasha', name: 'Наташа', accent: 'Russian', gender: 'female', description: 'Элегантный женский голос', provider: '11labs' },
    { id: 'ru-f-olga', name: 'Ольга', accent: 'Russian', gender: 'female', description: 'Профессиональный женский голос', provider: '11labs' }
  ],
  
  // ARABIC (العربية)
  ar: [
    { id: 'ar-m-ahmad', name: 'أحمد', accent: 'Arabic', gender: 'male', description: 'صوت ذكوري محترف', provider: '11labs' },
    { id: 'ar-m-omar', name: 'عمر', accent: 'Arabic', gender: 'male', description: 'صوت ذكوري دافئ', provider: '11labs' },
    { id: 'ar-f-fatima', name: 'فاطمة', accent: 'Arabic', gender: 'female', description: 'صوت أنثوي أنيق', provider: '11labs' },
    { id: 'ar-f-layla', name: 'ليلى', accent: 'Arabic', gender: 'female', description: 'صوت أنثوي محترف', provider: '11labs' }
  ],
  
  // JAPANESE (日本語)
  ja: [
    { id: 'ja-m-takeshi', name: 'タケシ', accent: 'Japanese', gender: 'male', description: 'プロフェッショナルな男性の声', provider: '11labs' },
    { id: 'ja-m-hiroshi', name: 'ヒロシ', accent: 'Japanese', gender: 'male', description: '温かい男性の声', provider: '11labs' },
    { id: 'ja-f-yuki', name: 'ユキ', accent: 'Japanese', gender: 'female', description: 'エレガントな女性の声', provider: '11labs' },
    { id: 'ja-f-sakura', name: 'サクラ', accent: 'Japanese', gender: 'female', description: 'プロフェッショナルな女性の声', provider: '11labs' }
  ],
  
  // KOREAN (한국어)
  ko: [
    { id: 'ko-m-minho', name: '민호', accent: 'Korean', gender: 'male', description: '전문적인 남성 목소리', provider: '11labs' },
    { id: 'ko-m-junho', name: '준호', accent: 'Korean', gender: 'male', description: '따뜻한 남성 목소리', provider: '11labs' },
    { id: 'ko-f-jiyeon', name: '지연', accent: 'Korean', gender: 'female', description: '우아한 여성 목소리', provider: '11labs' },
    { id: 'ko-f-soojin', name: '수진', accent: 'Korean', gender: 'female', description: '전문적인 여성 목소리', provider: '11labs' }
  ],
  
  // CHINESE (中文)
  zh: [
    { id: 'zh-m-wei', name: '伟', accent: 'Chinese', gender: 'male', description: '专业男性声音', provider: '11labs' },
    { id: 'zh-m-jun', name: '俊', accent: 'Chinese', gender: 'male', description: '温暖男性声音', provider: '11labs' },
    { id: 'zh-f-mei', name: '美', accent: 'Chinese', gender: 'female', description: '优雅女性声音', provider: '11labs' },
    { id: 'zh-f-ling', name: '玲', accent: 'Chinese', gender: 'female', description: '专业女性声音', provider: '11labs' }
  ],
  
  // HINDI (हिन्दी)
  hi: [
    { id: 'hi-m-raj', name: 'राज', accent: 'Hindi', gender: 'male', description: 'पेशेवर पुरुष आवाज़', provider: '11labs' },
    { id: 'hi-m-amit', name: 'अमित', accent: 'Hindi', gender: 'male', description: 'गर्म पुरुष आवाज़', provider: '11labs' },
    { id: 'hi-f-priya', name: 'प्रिया', accent: 'Hindi', gender: 'female', description: 'सुरुचिपूर्ण महिला आवाज़', provider: '11labs' },
    { id: 'hi-f-ananya', name: 'अनन्या', accent: 'Hindi', gender: 'female', description: 'पेशेवर महिला आवाज़', provider: '11labs' }
  ],
  
  // DUTCH (Nederlands)
  nl: [
    { id: 'nl-m-pieter', name: 'Pieter', accent: 'Dutch', gender: 'male', description: 'Professionele mannelijke stem', provider: '11labs' },
    { id: 'nl-m-lucas', name: 'Lucas', accent: 'Dutch', gender: 'male', description: 'Warme mannelijke stem', provider: '11labs' },
    { id: 'nl-f-emma', name: 'Emma', accent: 'Dutch', gender: 'female', description: 'Elegante vrouwelijke stem', provider: '11labs' },
    { id: 'nl-f-sophie', name: 'Sophie', accent: 'Dutch', gender: 'female', description: 'Professionele vrouwelijke stem', provider: '11labs' }
  ],
  
  // POLISH (Polski)
  pl: [
    { id: 'pl-m-piotr', name: 'Piotr', accent: 'Polish', gender: 'male', description: 'Profesjonalny głos męski', provider: '11labs' },
    { id: 'pl-m-jakub', name: 'Jakub', accent: 'Polish', gender: 'male', description: 'Ciepły głos męski', provider: '11labs' },
    { id: 'pl-f-anna', name: 'Anna', accent: 'Polish', gender: 'female', description: 'Elegancki głos damski', provider: '11labs' },
    { id: 'pl-f-zofia', name: 'Zofia', accent: 'Polish', gender: 'female', description: 'Profesjonalny głos damski', provider: '11labs' }
  ],
  
  // SWEDISH (Svenska)
  sv: [
    { id: 'sv-m-erik', name: 'Erik', accent: 'Swedish', gender: 'male', description: 'Professionell manlig röst', provider: '11labs' },
    { id: 'sv-m-oscar', name: 'Oscar', accent: 'Swedish', gender: 'male', description: 'Varm manlig röst', provider: '11labs' },
    { id: 'sv-f-emma', name: 'Emma', accent: 'Swedish', gender: 'female', description: 'Elegant kvinnlig röst', provider: '11labs' },
    { id: 'sv-f-maja', name: 'Maja', accent: 'Swedish', gender: 'female', description: 'Professionell kvinnlig röst', provider: '11labs' }
  ]
};

// Cache for 11Labs preview URLs (to avoid hitting API too often)
const previewUrlCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Helper to get preview URL from 11Labs
async function getPreviewUrl(voiceId) {
  // Check cache first
  const cached = previewUrlCache.get(voiceId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.url;
  }

  try {
    if (!ELEVENLABS_API_KEY) {
      console.warn('⚠️ ELEVENLABS_API_KEY not configured - voice previews unavailable');
      return null;
    }

    const response = await axios.get(`${ELEVENLABS_BASE_URL}/voices/${voiceId}`, {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
      timeout: 5000 // 5 second timeout
    });

    const previewUrl = response.data?.preview_url || null;

    // Cache the result (even if null to avoid repeated failed requests)
    previewUrlCache.set(voiceId, { url: previewUrl, timestamp: Date.now() });

    if (previewUrl) {
      console.log(`🎤 Got preview URL for voice ${voiceId}`);
    }

    return previewUrl;
  } catch (error) {
    console.error(`❌ Failed to get preview URL for voice ${voiceId}:`, error.message);
    // Cache the failure to avoid repeated requests
    previewUrlCache.set(voiceId, { url: null, timestamp: Date.now() });
    return null;
  }
}

// Enrich voices with preview URLs
async function enrichVoicesWithPreviews(voices, lang = null, baseUrl = null) {
  const enrichedVoices = await Promise.all(
    voices.map(async (voice) => {
      // For Turkish voices, use our Turkish preview endpoint
      if (lang === 'tr' && voice.id?.startsWith('tr-')) {
        const backendUrl = baseUrl || process.env.BACKEND_URL;
        return {
          ...voice,
          sampleUrl: `${backendUrl}/api/voices/preview/${voice.id}`
        };
      }
      // For Portuguese voices, use our Portuguese preview endpoint
      if (lang === 'pt' && voice.id?.startsWith('pt-')) {
        const backendUrl = baseUrl || process.env.BACKEND_URL;
        return {
          ...voice,
          sampleUrl: `${backendUrl}/api/voices/preview/${voice.id}`
        };
      }
      // First check if preview_url already exists in voice object
      if (voice.preview_url) {
        return { ...voice, sampleUrl: voice.preview_url };
      }
      // Otherwise try to fetch from 11Labs API
      if (voice.voice_id) {
        const sampleUrl = await getPreviewUrl(voice.voice_id);
        return { ...voice, sampleUrl };
      }
      return voice;
    })
  );
  return enrichedVoices;
}

// GET all voices
router.get('/', async (req, res) => {
  const { language, withSamples } = req.query;

  // Get base URL from request for Turkish previews
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const baseUrl = `${protocol}://${host}`;

  // If specific language requested
  if (language && VOICE_LIBRARY[language.toLowerCase()]) {
    console.log('🎤 GET /api/voices - language:', language);
    let voices = VOICE_LIBRARY[language.toLowerCase()];
    const lang = language.toLowerCase();

    // Enrich with preview URLs if requested
    if (withSamples === 'true') {
      // Pass language for proper preview endpoint selection
      voices = await enrichVoicesWithPreviews(voices, lang, baseUrl);
    }

    return res.json({
      voices,
      count: voices.length
    });
  }

  // Return all voices organized by language
  const allVoices = {};

  // If withSamples requested, enrich all voices with preview URLs
  if (withSamples === 'true') {
    for (const lang of Object.keys(VOICE_LIBRARY)) {
      // Pass language for proper preview endpoint selection
      allVoices[lang] = await enrichVoicesWithPreviews(VOICE_LIBRARY[lang], lang, baseUrl);
    }
  } else {
    Object.keys(VOICE_LIBRARY).forEach(lang => {
      allVoices[lang] = VOICE_LIBRARY[lang];
    });
  }

  res.json({
    voices: allVoices,
    languages: Object.keys(VOICE_LIBRARY),
    totalVoices: Object.values(VOICE_LIBRARY).flat().length
  });
});

// GET voice by ID
router.get('/:id', (req, res) => {
  const { id } = req.params;
  
  console.log('🎤 GET /api/voices/:id - id:', id);
  
  // Search across all languages
  let foundVoice = null;
  for (const lang in VOICE_LIBRARY) {
    foundVoice = VOICE_LIBRARY[lang].find(v => v.id === id);
    if (foundVoice) {
      foundVoice = { ...foundVoice, language: lang };
      break;
    }
  }
  
  if (!foundVoice) {
    return res.status(404).json({ error: 'Voice not found' });
  }
  
  res.json({ voice: foundVoice });
});

// GET voices by language code
router.get('/language/:code', (req, res) => {
  const { code } = req.params;

  console.log('🎤 GET /api/voices/language/:code - code:', code);

  const voices = VOICE_LIBRARY[code.toLowerCase()];

  if (!voices) {
    return res.status(404).json({
      error: 'Language not supported',
      supportedLanguages: Object.keys(VOICE_LIBRARY)
    });
  }

  res.json({
    voices,
    language: code,
    count: voices.length
  });
});

// Turkish preview text for each voice
const TURKISH_PREVIEW_TEXT = {
  'tr-m-mirza': 'Merhaba, ben Fatih. Size nasil yardimci olabilirim?',
  'tr-m-ali': 'Merhaba, ben Kadir. Bugun size nasil yardimci olabilirim?',
  'tr-m-berat': 'Merhaba, ben Ali Burak. Sizinle tanistigima memnun oldum.',
  'tr-m-yasir': 'Merhaba, ben Murat. Size yardimci olmak icin buradayim.',
  'tr-f-eda': 'Merhaba, ben Nisa. Size nasil yardimci olabilirim?',
  'tr-f-selen': 'Merhaba, ben Elvan. Bugun size nasil yardimci olabilirim?',
  'tr-f-sare': 'Merhaba, ben Derya. Sizinle tanistigima memnun oldum.',
  'tr-f-miray': 'Merhaba, ben Irem. Size yardimci olmak icin buradayim.'
};

// Portuguese (Brazilian) preview text for each voice
const PORTUGUESE_PREVIEW_TEXT = {
  'pt-m-joao': 'Olá, sou o João. Como posso ajudar você hoje?',
  'pt-m-pedro': 'Olá, sou o Pedro. Em que posso ajudar?',
  'pt-f-ana': 'Olá, sou a Ana. Como posso ajudar você?',
  'pt-f-maria': 'Olá, sou a Maria. Estou aqui para ajudar.'
};

// Cache for preview audio (Turkish and Portuguese)
const previewAudioCache = new Map();
const PREVIEW_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// GET preview audio for a voice (Turkish or Portuguese)
router.get('/preview/:voiceId', async (req, res) => {
  const { voiceId } = req.params;

  try {
    // Find voice in our library and determine its language
    let voice = null;
    let voiceLang = null;
    let elevenLabsVoiceId = voiceId;

    for (const lang in VOICE_LIBRARY) {
      voice = VOICE_LIBRARY[lang].find(v => v.id === voiceId);
      if (voice) {
        voiceLang = lang;
        elevenLabsVoiceId = voice.voice_id || voiceId;
        break;
      }
    }

    if (!voice) {
      return res.status(404).json({ error: 'Voice not found' });
    }

    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ error: 'Voice service is not configured' });
    }

    // Check cache first
    const cached = previewAudioCache.get(voiceId);
    if (cached && Date.now() - cached.timestamp < PREVIEW_CACHE_TTL) {
      res.set('Content-Type', 'audio/mpeg');
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(cached.audio);
    }

    // Get preview text based on language
    let previewText;
    let languageCode;

    if (voiceLang === 'pt') {
      previewText = PORTUGUESE_PREVIEW_TEXT[voiceId] || `Olá, sou ${voice.name}. Como posso ajudar você?`;
      languageCode = 'pt';
    } else {
      // Default to Turkish
      previewText = TURKISH_PREVIEW_TEXT[voiceId] || `Merhaba, ben ${voice.name}. Size nasıl yardımcı olabilirim?`;
      languageCode = 'tr';
    }

    console.log(`🎤 Generating ${languageCode} preview for ${voiceId} (${elevenLabsVoiceId})`);

    // Generate audio using 11Labs TTS with proper language
    const response = await axios.post(
      `${ELEVENLABS_BASE_URL}/text-to-speech/${elevenLabsVoiceId}`,
      {
        text: previewText,
        // Preview is not latency-sensitive, so prefer the higher-fidelity multilingual model.
        model_id: 'eleven_multilingual_v2',
        language_code: languageCode,
        voice_settings: {
          stability: 0.42,
          similarity_boost: 0.75,
          speed: 0.96
        }
      },
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        responseType: 'arraybuffer',
        timeout: 30000
      }
    );

    // Cache the audio
    previewAudioCache.set(voiceId, {
      audio: Buffer.from(response.data),
      timestamp: Date.now()
    });

    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(response.data));

  } catch (error) {
    console.error('Failed to generate Turkish preview:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// DELETE cache for previews (for development/testing)
router.delete('/preview/cache', (req, res) => {
  const count = previewAudioCache.size;
  previewAudioCache.clear();
  console.log(`🗑️ Cleared ${count} cached voice previews`);
  res.json({ success: true, cleared: count });
});

// GET sample audio for a voice from 11Labs (original English preview)
router.get('/sample/:voiceId', async (req, res) => {
  const { voiceId } = req.params;

  try {
    // Find voice in our library to get 11Labs voice_id
    let voice = null;
    let elevenLabsVoiceId = voiceId;

    for (const lang in VOICE_LIBRARY) {
      voice = VOICE_LIBRARY[lang].find(v => v.id === voiceId);
      if (voice) {
        elevenLabsVoiceId = voice.voice_id || voiceId;
        break;
      }
    }

    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ error: 'Voice service is not configured' });
    }

    // Get voice info from 11Labs which includes preview URL
    const response = await axios.get(`${ELEVENLABS_BASE_URL}/voices/${elevenLabsVoiceId}`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    const voiceData = response.data;

    res.json({
      voiceId,
      elevenLabsVoiceId,
      name: voiceData.name,
      previewUrl: voiceData.preview_url,
      labels: voiceData.labels
    });
  } catch (error) {
    console.error('Failed to get voice sample:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to get voice sample' });
  }
});

// GET all available voices from 11Labs
router.get('/elevenlabs/all', async (req, res) => {
  try {
    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ error: 'Voice service is not configured' });
    }

    const response = await axios.get(`${ELEVENLABS_BASE_URL}/voices`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    const voices = response.data.voices.map(v => ({
      voice_id: v.voice_id,
      name: v.name,
      labels: v.labels,
      previewUrl: v.preview_url,
      category: v.category
    }));

    res.json({ voices, count: voices.length });
  } catch (error) {
    console.error('Failed to get 11Labs voices:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to load voices' });
  }
});

export default router;
