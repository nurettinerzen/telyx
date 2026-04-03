import prisma from '../../prismaClient.js';
import { buildBusinessIdentity } from '../businessIdentity.js';
import { getGeminiModel } from '../gemini-utils.js';
import { retrieveKB } from '../kbRetrieval.js';
import { truncateComplaintReply } from './sikayetvarShared.js';

const SIKAYETVAR_MODEL = process.env.SIKAYETVAR_QA_MODEL || 'gemini-2.5-flash';
const MAX_COMPLAINT_REPLY_LENGTH = 4000;

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

function getFallbackReply(language, businessName, signature) {
  const normalized = String(language || 'tr').trim().toLowerCase();
  const safeSignature = String(signature || '').trim();

  let baseReply;
  if (normalized === 'en') {
    baseReply = `Hello, thank you for sharing your feedback with ${businessName}. We are reviewing the details carefully and will get back to you with a solution-oriented response as soon as possible.`;
  } else if (normalized === 'de') {
    baseReply = `Hallo, vielen Dank fuer Ihr Feedback zu ${businessName}. Wir pruefen die Details sorgfaeltig und melden uns so schnell wie moeglich mit einer loesungsorientierten Rueckmeldung.`;
  } else {
    baseReply = `Merhaba, ${businessName} hakkındaki geri bildiriminizi paylaştığınız için teşekkür ederiz. Detayları dikkatle inceliyor ve size en kısa sürede çözüm odaklı bir dönüş hazırlıyoruz.`;
  }

  return [baseReply, safeSignature].filter(Boolean).join('\n\n');
}

function buildPrompt({
  businessName,
  businessType,
  language,
  title,
  complaintText,
  priorMessages,
  kbContext,
  toneInstructions,
  identitySummary,
  signature,
}) {
  const languageLabel = getLanguageLabel(language);
  const safeToneInstructions = String(toneInstructions || '').trim();
  const safeSignature = String(signature || '').trim();
  const priorMessageBlock = priorMessages
    ? `ONCEKI MESAJLAR:\n${priorMessages}`
    : 'ONCEKI MESAJLAR: Bu sikayet icin ek mesaj kaydi bulunmuyor.';

  return `
SISTEM TALIMATLARI:
Sen ${businessName} adina Sikayetvar uzerindeki sikayetlere yanit hazirlayan bir asistansin.
Yanitin empatik, profesyonel, sakin, cozum odakli ve kurumsal olmali.
Mutlaka ${languageLabel} dilinde yaz.
Yaniti ${MAX_COMPLAINT_REPLY_LENGTH} karakterin altinda tut.
Haksiz kabul, kesin hukuki taahhut, iade/odeme/teslim tarihi garantisi veya ic soruşturma detayi uydurma.
Bilgi kesin degilse inceleme yapildigini ve netlestirilecegini belirt.
"AI", "dokuman", "bilgi bankasi", "sistem" gibi ic araclara referans verme.
Yanit direkt platforma gidecegi icin kopyalanabilir ve hazir formatta olmalı.
${safeToneInstructions ? `Ton tercihi: ${safeToneInstructions}` : ''}
${safeSignature ? `Imza tercihi: Mesajin sonuna su imzayi ekle -> ${safeSignature}` : 'Imza zorunlu degil.'}

ISLETME BAGLAMI:
- Isletme adi: ${businessName}
- Sektor: ${businessType || 'OTHER'}
- Kisa kimlik ozeti: ${identitySummary || 'Belirtilmedi'}

SIKAYET:
- Baslik: ${title || 'Belirtilmedi'}
- Govde: ${complaintText || 'Belirtilmedi'}

${priorMessageBlock}

${kbContext || 'BILGI BANKASI: Ilgili kayit bulunamadi.'}

CIKTI KURALLARI:
- Ilk cumlede anlayis ve tesekkur belirt.
- Mümkünse tek bir net sonraki adim ver.
- Gereksiz uzunluk ve tekrar yapma.
- Markdown, madde imi veya baslik kullanma; düz metin yaz.

Yanit:
`;
}

export async function generateComplaintAnswer({
  businessId,
  platform,
  title,
  complaintText,
  priorMessages = [],
  complaintSettings = {},
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

  const language = String(complaintSettings.language || business.language || 'tr').trim().toLowerCase();
  const kbQuery = [title, complaintText, ...priorMessages.map((item) => item.message)].filter(Boolean).join(' ').trim();
  const kbResult = await retrieveKB(businessId, kbQuery);
  const identity = await buildBusinessIdentity({ business });
  const priorMessagesText = priorMessages
    .map((item) => `${item.from === 'brand' ? 'Marka' : 'Musteri'}: ${String(item.message || '').trim()}`)
    .filter(Boolean)
    .slice(-8)
    .join('\n');

  if (!process.env.GEMINI_API_KEY) {
    return {
      answer: truncateComplaintReply(
        getFallbackReply(language, identity.businessName || business.name || 'isletmemiz', complaintSettings.signature),
        MAX_COMPLAINT_REPLY_LENGTH
      ),
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
    title,
    complaintText,
    priorMessages: priorMessagesText,
    kbContext: kbResult.context,
    toneInstructions: complaintSettings.toneInstructions,
    identitySummary: identity.identitySummary || business.identitySummary,
    signature: complaintSettings.signature,
  });

  const model = getGeminiModel({
    model: SIKAYETVAR_MODEL,
    temperature: 0.35,
    maxOutputTokens: 700,
  });

  const result = await model.generateContent(prompt);
  const rawAnswer = result.response.text() || '';
  const answer = truncateComplaintReply(rawAnswer, MAX_COMPLAINT_REPLY_LENGTH)
    || truncateComplaintReply(
      getFallbackReply(language, identity.businessName || business.name || 'isletmemiz', complaintSettings.signature),
      MAX_COMPLAINT_REPLY_LENGTH
    );

  return {
    answer,
    kbSourcesUsed: kbResult.queriesUsed || [],
    kbConfidence: kbResult.kbConfidence,
    model: SIKAYETVAR_MODEL,
    platform,
  };
}

export default generateComplaintAnswer;
