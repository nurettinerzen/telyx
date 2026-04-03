import prisma from '../../prismaClient.js';
import { buildBusinessIdentity } from '../businessIdentity.js';
import { getGeminiModel } from '../gemini-utils.js';
import { retrieveKB } from '../kbRetrieval.js';
import { truncateMarketplaceAnswer } from './qaShared.js';

const MARKETPLACE_QA_MODEL = process.env.MARKETPLACE_QA_MODEL || 'gemini-2.5-flash';
const MAX_MARKETPLACE_ANSWER_LENGTH = 2000;

function getLanguageLabel(language) {
  const normalized = String(language || 'tr').trim().toLowerCase();
  switch (normalized) {
    case 'en':
      return 'English';
    case 'de':
      return 'Deutsch';
    default:
      return 'Türkçe';
  }
}

function getFallbackAnswer(language, productName) {
  const normalized = String(language || 'tr').trim().toLowerCase();
  const productLabel = productName ? `"${productName}"` : 'ürün';

  if (normalized === 'en') {
    return `Thank you for your question about ${productLabel}. We are reviewing the details and will share a clear answer shortly.`;
  }

  if (normalized === 'de') {
    return `Vielen Dank fuer Ihre Frage zu ${productLabel}. Wir pruefen die Details und melden uns in Kuerze mit einer klaren Antwort.`;
  }

  return `${productLabel} ile ilgili sorunuz icin tesekkur ederiz. Detaylari kontrol edip size kisa ve net bir yanit sunuyoruz.`;
}

function buildPrompt({
  businessName,
  businessType,
  language,
  productName,
  questionText,
  kbContext,
  toneInstructions,
  identitySummary,
}) {
  const languageLabel = getLanguageLabel(language);
  const safeToneInstructions = String(toneInstructions || '').trim();

  return `
SISTEM TALIMATLARI:
Sen ${businessName} adina pazaryeri musteri sorularini yanitlayan bir asistansin.
Kisa, profesyonel, net ve dogru cevaplar ver.
Mutlaka ${languageLabel} dilinde yaz.
Yaniti ${MAX_MARKETPLACE_ANSWER_LENGTH} karakterin altinda tut.
Urun ozelligi, stok, kargo, iade veya garanti konusunda bilgi kesin degilse uydurma; netlestirici ve guvenli bir cevap ver.
Ic sistemlerden, kaynak adlarindan, "AI", "bilgi bankasi", "dokuman" gibi ifadelerden bahsetme.
Eger kullanisli bir bilgi yoksa nazik bir sekilde sinirli bilgiyle cevap ver; bos bir yanit verme.
${safeToneInstructions ? `Ton tercihi: ${safeToneInstructions}` : ''}

ISLETME BAGLAMI:
- Isletme adi: ${businessName}
- Sektor: ${businessType || 'OTHER'}
- Kisa kimlik ozeti: ${identitySummary || 'Belirtilmedi'}
- Urun adi: ${productName || 'Belirtilmedi'}

${kbContext || 'BILGI BANKASI: Ilgili kayit bulunamadi.'}

KULLANICI SORUSU:
${questionText}

Yanit:
`;
}

export async function generateMarketplaceAnswer({
  businessId,
  platform,
  questionText,
  productName = '',
  qaSettings = {},
}) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      businessType: true,
      language: true,
      timezone: true,
      identitySummary: true,
      aliases: true,
      channelConfig: true,
    },
  });

  if (!business) {
    throw new Error(`Business bulunamadi: ${businessId}`);
  }

  const language = String(qaSettings.language || business.language || 'tr').trim().toLowerCase();
  const kbQuery = [productName, questionText].filter(Boolean).join(' ').trim() || questionText;
  const kbResult = await retrieveKB(businessId, kbQuery);
  const identity = await buildBusinessIdentity({ business });

  if (!process.env.GEMINI_API_KEY) {
    return {
      answer: truncateMarketplaceAnswer(getFallbackAnswer(language, productName), MAX_MARKETPLACE_ANSWER_LENGTH),
      kbSourcesUsed: kbResult.queriesUsed || [],
      model: 'fallback-no-gemini-key',
      platform,
      kbConfidence: kbResult.kbConfidence,
    };
  }

  const prompt = buildPrompt({
    businessName: identity.businessName || business.name || 'Business',
    businessType: business.businessType,
    language,
    productName,
    questionText,
    kbContext: kbResult.context,
    toneInstructions: qaSettings.toneInstructions,
    identitySummary: identity.identitySummary || business.identitySummary,
  });

  const model = getGeminiModel({
    model: MARKETPLACE_QA_MODEL,
    temperature: 0.35,
    maxOutputTokens: 500,
  });

  const result = await model.generateContent(prompt);
  const rawAnswer = result.response.text() || '';
  const answer = truncateMarketplaceAnswer(rawAnswer, MAX_MARKETPLACE_ANSWER_LENGTH)
    || truncateMarketplaceAnswer(getFallbackAnswer(language, productName), MAX_MARKETPLACE_ANSWER_LENGTH);

  return {
    answer,
    kbSourcesUsed: kbResult.queriesUsed || [],
    kbConfidence: kbResult.kbConfidence,
    model: MARKETPLACE_QA_MODEL,
    platform,
  };
}

export default generateMarketplaceAnswer;
