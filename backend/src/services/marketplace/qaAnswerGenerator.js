import prisma from '../../prismaClient.js';
import { buildBusinessIdentity } from '../businessIdentity.js';
import { getGeminiModel, hasGeminiApiKey, isGeminiGenerationFailure } from '../gemini-utils.js';
import { retrieveKB } from '../kbRetrieval.js';
import { truncateMarketplaceAnswer } from './qaShared.js';
import { buildMarketplaceProductContextBlock, resolveMarketplaceProductContext } from './productContextService.js';

const MARKETPLACE_QA_MODEL = process.env.MARKETPLACE_QA_MODEL || 'gemini-2.5-flash';
const MAX_MARKETPLACE_ANSWER_LENGTH = 2000;
const QUESTION_STOPWORDS = new Set([
  'acaba', 'ama', 'bir', 'bu', 'da', 'de', 'diye', 'en', 'gibi', 'icin', 'için', 'ile', 'ilemi', 'ilemi',
  'mı', 'mi', 'mu', 'mü', 'muhtemel', 'nasil', 'nasıl', 'olan', 'olarak', 'sadece', 'seklinde', 'şeklinde',
  'var', 'yapar', 'yaparmi', 'yaparmi', 'uyumlu', 'uyumlu_mu', 've', 'veya', 'ya', 'yani'
]);

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

function normalizeForSearch(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractQuestionKeywords(questionText) {
  return normalizeForSearch(questionText)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !QUESTION_STOPWORDS.has(token));
}

function scoreFactAgainstQuestion(fact, keywords) {
  const normalizedFact = normalizeForSearch(fact);
  if (!normalizedFact || keywords.length === 0) {
    return 0;
  }

  let score = 0;
  for (const keyword of keywords) {
    if (normalizedFact.includes(keyword)) {
      score += keyword.length >= 5 ? 2 : 1;
    }
  }

  return score;
}

function buildFactBasedFallback(language, productName, questionText, productContext) {
  const facts = productContext?.facts || [];
  const keywords = extractQuestionKeywords(questionText);

  if (facts.length === 0 || keywords.length === 0) {
    return null;
  }

  const topMatches = facts
    .map((fact) => ({ fact, score: scoreFactAgainstQuestion(fact, keywords) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((item) => item.fact);

  if (topMatches.length === 0) {
    return null;
  }

  const productLabel = productName ? `"${productName}"` : 'ürün';

  if (language === 'en') {
    return `For ${productLabel}, the product details show: ${topMatches.join(' | ')}. Based on the listed specifications, this is the closest matching information for your question.`;
  }

  if (language === 'de') {
    return `Fuer ${productLabel} zeigen die Produktinformationen Folgendes: ${topMatches.join(' | ')}. Das ist die passendste Information zu Ihrer Frage.`;
  }

  return `${productLabel} için ürün bilgilerinde şu detaylar görünüyor: ${topMatches.join(' | ')}. Sorunuzla ilgili en yakın bilgi bu şekilde listelenmiş.`;
}

function isBrandQuestion(questionText) {
  const normalized = normalizeForSearch(questionText);
  return (
    normalized.includes('marka')
    || normalized.includes('brand')
    || normalized.includes('uretici')
    || normalized.includes('üretici')
  );
}

function getSafeNoEvidenceAnswer(language, productName) {
  const normalized = String(language || 'tr').trim().toLowerCase();
  const productLabel = productName ? `"${productName}"` : 'ürün';

  if (normalized === 'en') {
    return `For ${productLabel}, I cannot verify this detail from the current product data. Please review the listing details manually before sending a final reply.`;
  }

  if (normalized === 'de') {
    return `Fuer ${productLabel} kann ich dieses Detail mit den aktuellen Produktdaten nicht verifizieren. Bitte pruefen Sie die Angebotsdaten vor dem Versenden manuell.`;
  }

  return `${productLabel} için bu bilgiyi mevcut ürün verisinden doğrulayamıyorum. Göndermeden önce ürün kaydını manuel kontrol etmeniz iyi olur.`;
}

function getGroundedAnswer(language, productName, questionText, productContext) {
  const normalized = String(language || 'tr').trim().toLowerCase();

  if (!productContext) {
    return getSafeNoEvidenceAnswer(normalized, productName);
  }

  if (isBrandQuestion(questionText)) {
    if (productContext.brand) {
      if (normalized === 'en') {
        return `"${productName}" is listed under the ${productContext.brand} brand in the current product data.`;
      }

      if (normalized === 'de') {
        return `"${productName}" ist in den aktuellen Produktdaten unter der Marke ${productContext.brand} gelistet.`;
      }

      return `"${productName}" ürünü mevcut ürün kaydında ${productContext.brand} markası altında listeleniyor.`;
    }

    return getSafeNoEvidenceAnswer(normalized, productName);
  }

  const factBasedFallback = buildFactBasedFallback(normalized, productName, questionText, productContext);
  if (factBasedFallback) {
    return factBasedFallback;
  }

  return getSafeNoEvidenceAnswer(normalized, productName);
}

function answerMentionsBusinessAsBrand(answer, identity, productContext) {
  if (!answer) return false;

  const normalizedAnswer = normalizeForSearch(answer);
  const normalizedBrand = normalizeForSearch(productContext?.brand || '');
  const businessNames = [
    identity?.businessName,
    ...(identity?.aliases || []),
  ]
    .map((item) => normalizeForSearch(item))
    .filter(Boolean);

  return businessNames.some((item) => item && item !== normalizedBrand && normalizedAnswer.includes(item));
}

function enforceGroundedMarketplaceAnswer(answer, { language, productName, questionText, productContext, identity }) {
  const normalizedAnswer = String(answer || '').trim();

  if (!normalizedAnswer) {
    return getGroundedAnswer(language, productName, questionText, productContext);
  }

  if (answerMentionsBusinessAsBrand(normalizedAnswer, identity, productContext)) {
    return getGroundedAnswer(language, productName, questionText, productContext);
  }

  if (isBrandQuestion(questionText)) {
    const answerSearch = normalizeForSearch(normalizedAnswer);
    const expectedBrand = normalizeForSearch(productContext?.brand || '');

    if (expectedBrand) {
      if (!answerSearch.includes(expectedBrand)) {
        return getGroundedAnswer(language, productName, questionText, productContext);
      }
    } else if (!answerSearch.includes('doğrul') && !answerSearch.includes('verify')) {
      return getGroundedAnswer(language, productName, questionText, productContext);
    }
  }

  return normalizedAnswer;
}

function buildPrompt({
  businessName,
  businessType,
  language,
  productName,
  productContextBlock,
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
Elindeki urun baglami soruyu yanitlamak icin yeterliyse dogrudan somut cevap ver. Gereksiz sekilde "detaylari kontrol edip donecegiz" gibi oyalayici cevap yazma.
Urun markasini, ureticisini veya teknik ozelligini sadece verilen urun baglaminda acikca geciyorsa soyle. Isletme adindan veya genel tahminden marka uydurma.
Eger bilgi yetersizse bunu acikca belirt; emin olmadigin teknik ozelligi kesinmis gibi yazma.
${safeToneInstructions ? `Ton tercihi: ${safeToneInstructions}` : ''}

ISLETME BAGLAMI:
- Isletme adi: ${businessName}
- Sektor: ${businessType || 'OTHER'}
- Kisa kimlik ozeti: ${identitySummary || 'Belirtilmedi'}
- Urun adi: ${productName || 'Belirtilmedi'}

${productContextBlock}

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
  productBarcode = '',
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
  const productContext = await resolveMarketplaceProductContext({
    businessId,
    platform,
    productBarcode,
    productName,
  });
  const kbQuery = [productName, productBarcode, questionText].filter(Boolean).join(' ').trim() || questionText;
  const kbResult = await retrieveKB(businessId, kbQuery);
  const identity = await buildBusinessIdentity({ business });
  const prompt = buildPrompt({
    businessName: identity.businessName || business.name || 'Business',
    businessType: business.businessType,
    language,
    productName,
    productContextBlock: buildMarketplaceProductContextBlock(productContext),
    questionText,
    kbContext: kbResult.context,
    toneInstructions: qaSettings.toneInstructions,
    identitySummary: identity.identitySummary || business.identitySummary,
  });

  const groundedAnswer = getGroundedAnswer(language, productName, questionText, productContext);

  if (!hasGeminiApiKey()) {
    return {
      answer: truncateMarketplaceAnswer(groundedAnswer, MAX_MARKETPLACE_ANSWER_LENGTH),
      kbSourcesUsed: kbResult.queriesUsed || [],
      model: 'grounded-no-gemini-key',
      platform,
      kbConfidence: kbResult.kbConfidence,
    };
  }

  const model = getGeminiModel({
    model: MARKETPLACE_QA_MODEL,
    temperature: 0.35,
    maxOutputTokens: 500,
  });

  try {
    const result = await model.generateContent(prompt);
    const rawAnswer = result.response.text() || '';
    const answer = truncateMarketplaceAnswer(
      enforceGroundedMarketplaceAnswer(rawAnswer, {
        language,
        productName,
        questionText,
        productContext,
        identity,
      }),
      MAX_MARKETPLACE_ANSWER_LENGTH
    ) || truncateMarketplaceAnswer(groundedAnswer, MAX_MARKETPLACE_ANSWER_LENGTH);

    return {
      answer,
      kbSourcesUsed: kbResult.queriesUsed || [],
      kbConfidence: kbResult.kbConfidence,
      model: MARKETPLACE_QA_MODEL,
      platform,
    };
  } catch (error) {
    if (!isGeminiGenerationFailure(error)) {
      throw error;
    }

    console.warn('Marketplace QA Gemini generation failed, using grounded fallback answer:', error.message);

    return {
      answer: truncateMarketplaceAnswer(groundedAnswer, MAX_MARKETPLACE_ANSWER_LENGTH),
      kbSourcesUsed: kbResult.queriesUsed || [],
      kbConfidence: kbResult.kbConfidence,
      model: 'grounded-gemini-error',
      platform,
    };
  }
}

export default generateMarketplaceAnswer;
