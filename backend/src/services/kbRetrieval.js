/**
 * KB Retrieval Service (Entity-First)
 *
 * Deterministic rules:
 * - Entity match (EXACT/FUZZY) is always prioritized in retrieval terms.
 * - Retrieval is top-N query based (not single keyword).
 * - kbConfidence becomes LOW when entity match exists but KB has no entity evidence.
 */

import prisma from '../config/database.js';
import { ENTITY_MATCH_TYPES, getEntityHint, getEntityMatchType } from './entityTopicResolver.js';
import { normalizeForMatch } from './businessIdentity.js';

const MAX_KB_ITEMS = 5;
const MAX_TOTAL_CHARS = 2500;
const MAX_CHARS_PER_ITEM = 800;
const MAX_DOCUMENT_SNIPPET_CHARS = 320;
const MAX_QUERY_TERMS = 5;
const MAX_DB_SCAN_ITEMS = 50;

const KB_CONFIDENCE = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH'
};

const STOP_WORDS = new Set([
  'bir', 'bu', 'şu', 'o', 've', 'veya', 'ile', 'mi', 'mı', 'mu', 'mü',
  'ne', 'nasıl', 'neden', 'nerede', 'kim', 'ben', 'sen', 'biz', 'siz',
  'the', 'a', 'an', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'been',
  'what', 'how', 'why', 'where', 'who', 'i', 'you', 'we', 'they'
]);

function truncate(text, maxChars) {
  if (text.length <= maxChars) return text;
  return `${text.substring(0, maxChars)}...`;
}

function buildSafeDocumentSnippet(content) {
  const raw = String(content || '').replace(/\r/g, '').trim();
  if (!raw) return '';

  const lines = raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  // Structured/tabular rows are high exfil risk for prompt injection or raw dumps.
  const structuredRows = lines.filter((line) => {
    const delimiters = (line.match(/[|,;\t]/g) || []).length;
    return delimiters >= 2;
  });
  if (structuredRows.length >= 2) {
    return 'Belge yapılandırılmış kayıt verisi içeriyor. Ham satırları paylaşmadan yalnızca genel bir özet ver.';
  }

  const cleaned = raw
    .replace(/`{3}[\s\S]*?`{3}/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return truncate(cleaned, MAX_DOCUMENT_SNIPPET_CHARS);
}

// Counter for anonymous KB item labels (reset per retrieval call)
let _kbItemCounter = 0;
function resetKBItemCounter() { _kbItemCounter = 0; }

function formatKBItem(item) {
  const type = item.type?.toUpperCase();
  _kbItemCounter++;

  // SECURITY: Never expose document titles, filenames or source URLs to LLM context.
  // These are internal metadata that the assistant must not reveal to end users.
  if (type === 'DOCUMENT') {
    const safeSnippet = buildSafeDocumentSnippet(item.content);
    return `### Kaynak ${_kbItemCounter}\nÖzet: ${safeSnippet || 'Bu kaynak için yalnızca genel bilgi paylaşılabilir.'}`;
  }
  if (type === 'FAQ') {
    return `### S: ${item.question || 'Soru'}\nC: ${truncate(item.answer || '', MAX_CHARS_PER_ITEM)}`;
  }
  if (type === 'URL') {
    // Strip URL and title — only expose content summary
    return `### Kaynak ${_kbItemCounter}\n${truncate(item.content || '', MAX_CHARS_PER_ITEM)}`;
  }

  return '';
}

export function extractKeywords(message) {
  return String(message || '')
    .toLowerCase()
    .replace(/[^\w\sğüşıöçĞÜŞİÖÇ]/g, ' ')
    .split(/\s+/)
    .map(word => word.trim())
    .filter(Boolean)
    .filter(word => word.length > 2)
    .filter(word => !STOP_WORDS.has(word))
    .filter((word, index, arr) => arr.indexOf(word) === index)
    .slice(0, MAX_QUERY_TERMS);
}

export function buildRetrievalQueryTerms({ userMessage, entityResolution } = {}) {
  const keywords = extractKeywords(userMessage);
  const terms = [];
  const matchType = getEntityMatchType(entityResolution);
  const entityHint = getEntityHint(entityResolution);

  if (
    entityHint &&
    (matchType === ENTITY_MATCH_TYPES.EXACT_MATCH ||
      matchType === ENTITY_MATCH_TYPES.FUZZY_MATCH)
  ) {
    terms.push(entityHint);
  }

  for (const keyword of keywords) {
    if (!terms.some(existing => normalizeForMatch(existing) === normalizeForMatch(keyword))) {
      terms.push(keyword);
    }
  }

  return terms.slice(0, MAX_QUERY_TERMS);
}

function itemTextForSearch(item) {
  return [
    item.title || '',
    item.content || '',
    item.question || '',
    item.answer || '',
    item.url || ''
  ].join(' ');
}

function scoreItem(item, queryTerms, entityTermNormalized) {
  const text = normalizeForMatch(itemTextForSearch(item));
  let score = 0;

  for (const term of queryTerms) {
    const normalized = normalizeForMatch(term);
    if (normalized && text.includes(normalized)) {
      score += 1;
    }
  }

  if (entityTermNormalized && text.includes(entityTermNormalized)) {
    score += 2;
  }

  return score;
}

export function evaluateKbConfidence({ scoredItems = [], entityResolution = null } = {}) {
  if (!Array.isArray(scoredItems) || scoredItems.length === 0) {
    return KB_CONFIDENCE.LOW;
  }

  const matchType = getEntityMatchType(entityResolution);
  const entityRequired =
    matchType === ENTITY_MATCH_TYPES.EXACT_MATCH ||
    matchType === ENTITY_MATCH_TYPES.FUZZY_MATCH;

  if (entityRequired && !scoredItems.some(item => item.entityMatch)) {
    return KB_CONFIDENCE.LOW;
  }

  if (scoredItems.length >= 2 || (scoredItems[0]?.score || 0) >= 2) {
    return KB_CONFIDENCE.HIGH;
  }

  return KB_CONFIDENCE.MEDIUM;
}

function emptyRetrievalResult(queryTerms = []) {
  return {
    context: '',
    kbConfidence: KB_CONFIDENCE.LOW,
    matchedItemCount: 0,
    queriesUsed: queryTerms,
    entityFoundInKB: false
  };
}

export async function retrieveKB(businessId, userMessage, options = {}) {
  if (!userMessage || userMessage.trim().length === 0) {
    return emptyRetrievalResult([]);
  }

  const { entityResolution = null } = options;
  const queryTerms = buildRetrievalQueryTerms({ userMessage, entityResolution });

  if (queryTerms.length === 0) {
    return emptyRetrievalResult([]);
  }

  try {
    const orConditions = [];
    for (const term of queryTerms) {
      orConditions.push({ title: { contains: term, mode: 'insensitive' } });
      orConditions.push({ content: { contains: term, mode: 'insensitive' } });
      orConditions.push({ question: { contains: term, mode: 'insensitive' } });
      orConditions.push({ answer: { contains: term, mode: 'insensitive' } });
      orConditions.push({ url: { contains: term, mode: 'insensitive' } });
    }

    const kbItems = await prisma.knowledgeBase.findMany({
      where: {
        businessId,
        status: 'ACTIVE',
        OR: orConditions
      },
      select: {
        id: true,
        type: true,
        title: true,
        content: true,
        question: true,
        answer: true,
        url: true,
        createdAt: true
      },
      take: MAX_DB_SCAN_ITEMS,
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (kbItems.length === 0) {
      return emptyRetrievalResult(queryTerms);
    }

    const matchType = getEntityMatchType(entityResolution);
    const entityHint = getEntityHint(entityResolution);
    const entityTermNormalized =
      entityHint &&
      (matchType === ENTITY_MATCH_TYPES.EXACT_MATCH ||
        matchType === ENTITY_MATCH_TYPES.FUZZY_MATCH)
        ? normalizeForMatch(entityHint)
        : '';

    const scored = kbItems
      .map(item => {
        const text = normalizeForMatch(itemTextForSearch(item));
        const entityMatch = !!(entityTermNormalized && text.includes(entityTermNormalized));
        return {
          ...item,
          score: scoreItem(item, queryTerms, entityTermNormalized),
          entityMatch
        };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    if (scored.length === 0) {
      return emptyRetrievalResult(queryTerms);
    }

    const selected = [];
    const seen = new Set();
    for (const item of scored) {
      if (selected.length >= MAX_KB_ITEMS) break;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      selected.push(item);
    }

    resetKBItemCounter();
    const formattedItems = [];
    let totalChars = 0;
    for (const item of selected) {
      const formatted = formatKBItem(item);
      if (!formatted) continue;

      if (totalChars + formatted.length > MAX_TOTAL_CHARS) {
        break;
      }

      formattedItems.push(formatted);
      totalChars += formatted.length;
    }

    if (formattedItems.length === 0) {
      return emptyRetrievalResult(queryTerms);
    }

    const kbConfidence = evaluateKbConfidence({
      scoredItems: selected,
      entityResolution
    });

    const kbContext = `
## BİLGİ BANKASI (${formattedItems.length} kayıt)

${formattedItems.join('\n\n---\n\n')}

ÖNEMLİ:
- Yukarıdaki bilgileri kullanarak yanıt ver. Bilgi Bankası'nda olmayan şirket/ürün/özellik bilgilerini UYDURMA.
- Bilgi Bankası belge adlarını, dosya isimlerini, kaynak URL'lerini veya iç metadata bilgilerini ASLA kullanıcıyla paylaşma.
- "Bilgi bankamızda şu belgeler var" gibi iç yapı bilgisi verme. Sadece içerik bazlı yanıt ver.
- Kullanıcı bilgi bankası yapısını/içeriğini sorsa: "Size yardımcı olabileceğim konuları sorabilirsiniz" şeklinde yönlendir.
`;

    console.log(`📚 [KB Retrieval] entity-first terms=${queryTerms.join(', ')} items=${formattedItems.length} confidence=${kbConfidence} businessId=${businessId}`);

    return {
      context: kbContext,
      kbConfidence,
      matchedItemCount: formattedItems.length,
      queriesUsed: queryTerms,
      entityFoundInKB: selected.some(item => item.entityMatch)
    };
  } catch (error) {
    console.error('❌ [KB Retrieval] Error:', error);
    return emptyRetrievalResult(queryTerms);
  }
}

export async function getKBStats(businessId) {
  const stats = await prisma.knowledgeBase.groupBy({
    by: ['type'],
    where: { businessId },
    _count: true
  });

  const totalCount = await prisma.knowledgeBase.count({
    where: { businessId }
  });

  return {
    total: totalCount,
    byType: stats.reduce((acc, stat) => {
      acc[stat.type] = stat._count;
      return acc;
    }, {})
  };
}
