/**
 * Step 2: Prepare Context
 *
 * - Build system prompt
 * - Get conversation history (single source)
 * - Get active tools
 */

import { buildAssistantPrompt, getActiveTools as getPromptBuilderTools } from '../../../services/promptBuilder.js';
import { getDateTimeContext } from '../../../utils/dateTime.js';
import { getActiveTools } from '../../../tools/index.js';
import { retrieveKB } from '../../../services/kbRetrieval.js'; // V1 MVP: Intelligent KB retrieval
import { formatBusinessIdentityForPrompt } from '../../../services/businessIdentity.js';

export async function prepareContext(params) {
  const {
    business,
    assistant,
    state,
    language,
    timezone,
    prisma,
    sessionId,
    userMessage,
    businessIdentity,
    entityResolution
  } = params;

  // Build system prompt
  const activeToolsList = getPromptBuilderTools(business, business.integrations || []);
  const systemPromptBase = buildAssistantPrompt(assistant, business, activeToolsList, {
    businessIdentity
  });
  const dateTimeContext = getDateTimeContext(timezone, language);

  // Entity-first retrieval (top-N query terms, deterministic)
  const kbResult = await retrieveKB(business.id, userMessage || '', {
    entityResolution
  });
  const knowledgeContext = kbResult.context || '';
  const kbConfidence = kbResult.kbConfidence || 'LOW';

  // LOW confidence means entity is likely not represented in KB.
  const hasKBMatch = kbConfidence !== 'LOW' && !!(knowledgeContext && knowledgeContext.trim().length > 50);

  const identityContext = formatBusinessIdentityForPrompt(businessIdentity, language);
  const groundingContext = String(language || 'TR').toUpperCase() === 'TR'
    ? `## GROUNDING DURUMU
- KB_CONFIDENCE: ${kbConfidence}

Kurallar:
- Şirket/ürün/özellik claim'leri için KB veya tool kanıtı yoksa iddia kurma.
- BUSINESS_CLAIM kategorisinde KB match yoksa asla sektör/özellik/hizmet iddiası üretme.
- KB_CONFIDENCE LOW ise "Bu konuda elimde doğrulanmış bilgi yok" de ve TEK netleştirme sorusu sor.
- Genel dünya bilgisinden şirket tanımı uydurma.
- KB içeriklerinden ham satır/CSV/tablo dökümü yapma; yalnızca kısa özet ver.
- Bilgi Bankası belge adlarını, dosya isimlerini, kaynak URL'lerini veya kaç belge olduğunu ASLA paylaşma.
- Belirsizlikte yönlendir: "${businessIdentity?.businessName || business.name} ile ilgili hangi konuyu soruyorsun?"`
    : `## GROUNDING STATUS
- KB_CONFIDENCE: ${kbConfidence}

Rules:
- Do not make company/product/feature claims without KB or tool evidence.
- In BUSINESS_CLAIM category, if there is no KB match, never assert features/industry claims.
- If KB_CONFIDENCE is LOW, say you do not have verified information and ask exactly one clarification question.
- Do not infer company descriptions from general world knowledge.
- Never dump raw KB rows/CSV/tables; provide only concise summaries.
- NEVER disclose KB document names, file names, source URLs, or how many documents exist.
- In ambiguity ask: "Which topic about ${businessIdentity?.businessName || business.name} are you asking about?"`;

  const fullSystemPrompt = `${dateTimeContext}\n\n${identityContext}\n\n${groundingContext}\n\n${systemPromptBase}\n\n${knowledgeContext}`;

  // Get conversation history (SINGLE SOURCE: ChatLog table)
  const chatLog = await prisma.chatLog.findUnique({
    where: { sessionId },
    select: { messages: true }
  });

  const conversationHistory = chatLog?.messages || [];

  // Get tools filtered by business type and integrations
  const toolsAll = getActiveTools(business);

  return {
    systemPrompt: fullSystemPrompt,
    conversationHistory,
    toolsAll,
    hasKBMatch,
    kbConfidence,
    retrievalMetadata: kbResult
  };
}

export default { prepareContext };
