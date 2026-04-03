/**
 * Email Pair Retrieval Service
 *
 * Finds similar INBOUND → OUTBOUND pairs for a new inbound email.
 *
 * Hybrid Strategy:
 * 1. Filter by intent + language (fast DB query)
 * 2. Keyword/subject similarity (top 20)
 * 3. Embedding similarity (future enhancement)
 *
 * Returns: Top 3-5 most similar pairs for prompt context
 */

import prisma from '../prismaClient.js';

/**
 * Retrieve similar email pairs for a new inbound message
 *
 * @param {Object} params
 * @param {number} params.businessId - Business ID (required)
 * @param {string} params.inboundText - New inbound email text
 * @param {string} params.inboundTone - Classified tone (formal/neutral/casual/angry)
 * @param {string} params.intent - Email intent (INQUIRY/COMPLAINT/etc.)
 * @param {string} params.language - Email language (TR/EN)
 * @param {number} params.k - Number of results (default 3)
 * @returns {Promise<Array>} Similar pairs with similarity scores
 */
export async function retrieveSimilarPairs({
  businessId,
  inboundText,
  inboundTone = null,
  intent = null,
  language = 'EN',
  k = 3
}) {
  if (!businessId || !inboundText) {
    throw new Error('businessId and inboundText are required');
  }

  console.log(`[PairRetrieval] Retrieving similar pairs for business ${businessId}`);
  console.log(`[PairRetrieval] Tone: ${inboundTone}, Intent: ${intent}, Language: ${language}`);

  // Step 1: Filter candidates by metadata
  const whereConditions = {
    businessId
  };

  // Add optional filters
  if (language) {
    whereConditions.language = language;
  }

  // Intent filter is OPTIONAL since many pairs may have intent=null
  // We rely on keyword similarity + tone matching instead
  // Only use intent as a filter if we have high-quality intent data
  // For now, skip intent filtering to ensure we get candidates

  // Fetch candidates (max 50 for performance)
  const candidates = await prisma.emailPair.findMany({
    where: whereConditions,
    select: {
      id: true,
      threadId: true,
      inboundText: true,
      outboundText: true,
      inboundTone: true,
      outboundTone: true,
      closingPattern: true,
      signatureUsed: true,
      lengthBucket: true,
      contactType: true,
      language: true,
      intent: true,
      sentAt: true
    },
    orderBy: { sentAt: 'desc' },
    take: 50
  });

  if (candidates.length === 0) {
    console.log('[PairRetrieval] No candidates found');
    return [];
  }

  console.log(`[PairRetrieval] Found ${candidates.length} candidates`);

  // Step 2: Calculate keyword similarity for each candidate
  const scored = candidates.map(pair => {
    const similarity = calculateKeywordSimilarity(inboundText, pair.inboundText);

    // Bonus for matching tone
    const toneBonus = (inboundTone && pair.inboundTone === inboundTone) ? 0.15 : 0;

    // Recency bonus (prefer recent pairs)
    const recencyBonus = calculateRecencyBonus(pair.sentAt);

    const totalScore = similarity + toneBonus + recencyBonus;

    return {
      ...pair,
      similarity,
      toneBonus,
      recencyBonus,
      totalScore
    };
  });

  // Step 3: Sort by total score and take top K
  // Note: We don't filter by similarity here - let total score (including bonuses) determine ranking
  const results = scored
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, k);

  console.log(`[PairRetrieval] Top scores: ${scored.slice(0, 5).map(p => p.totalScore.toFixed(3)).join(', ')}`);
  console.log(`[PairRetrieval] Returning ${results.length} similar pairs`);

  return results;
}

/**
 * Calculate keyword similarity (Jaccard coefficient on words)
 */
function calculateKeywordSimilarity(text1, text2) {
  if (!text1 || !text2) return 0;

  // Extract significant words (length > 3, lowercase)
  const words1 = new Set(
    text1
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3 && !isCommonWord(w))
  );

  const words2 = new Set(
    text2
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3 && !isCommonWord(w))
  );

  if (words1.size === 0 || words2.size === 0) return 0;

  // Jaccard similarity: intersection / union
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Check if word is too common to be useful for matching
 */
function isCommonWord(word) {
  const commonWords = new Set([
    // English
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'been',
    'will', 'would', 'could', 'should', 'your', 'their', 'about', 'which',
    'there', 'where', 'when', 'what', 'email', 'message', 'hello', 'thank',
    'thanks', 'please', 'regards', 'best', 'dear',
    // Turkish
    'için', 'olan', 'olarak', 'ilgili', 'hakkında', 'üzerinde', 'sonra',
    'önce', 'daha', 'bile', 'gibi', 'kadar', 'ancak', 'şekilde', 'merhaba',
    'teşekkür', 'lütfen', 'sayın', 'iyi', 'günler', 'saygılar'
  ]);

  return commonWords.has(word.toLowerCase());
}

/**
 * Calculate recency bonus (newer pairs get higher score)
 */
function calculateRecencyBonus(sentAt) {
  if (!sentAt) return 0;

  const now = new Date();
  const sent = new Date(sentAt);
  const daysDiff = (now - sent) / (1000 * 60 * 60 * 24);

  // Linear decay: 0.1 bonus for today, 0 bonus after 90 days
  const maxBonus = 0.1;
  const maxDays = 90;

  if (daysDiff > maxDays) return 0;

  return maxBonus * (1 - daysDiff / maxDays);
}

/**
 * Format pairs for LLM prompt
 */
export function formatPairsForPrompt(pairs) {
  if (!pairs || pairs.length === 0) {
    return '';
  }

  let formatted = '\n=== REFERENCE EMAIL PAIRS (Your Past Responses) ===\n\n';
  formatted += 'Use these examples to match tone, style, and signature patterns.\n';
  formatted += 'DO NOT copy verbatim - adapt to the new context.\n\n';

  pairs.forEach((pair, index) => {
    formatted += `[Example ${index + 1}]\n`;
    formatted += `When you received (${pair.inboundTone} tone):\n`;
    formatted += `"${truncateText(pair.inboundText, 150)}"\n\n`;
    formatted += `You replied (${pair.outboundTone} tone):\n`;
    formatted += `"${truncateText(pair.outboundText, 200)}"\n`;

    if (pair.closingPattern) {
      formatted += `Closing used: "${pair.closingPattern}"\n`;
    }

    if (pair.signatureUsed) {
      formatted += `Signature:\n${truncateText(pair.signatureUsed, 100)}\n`;
    }

    formatted += `\n---\n\n`;
  });

  formatted += '=== END REFERENCE PAIRS ===\n\n';
  formatted += 'CRITICAL: Match the tone and style from these examples.\n';
  formatted += 'If you used a signature in similar past emails, use it again (no duplicates).\n';
  formatted += 'If you did NOT use a signature in past examples, do NOT add one.\n';

  return formatted;
}

/**
 * Truncate text to approximate character limit
 */
function truncateText(text, maxChars) {
  if (!text || text.length <= maxChars) return text;

  // Truncate at sentence boundary if possible
  const truncated = text.substring(0, maxChars);
  const lastPeriod = truncated.lastIndexOf('.');

  if (lastPeriod > maxChars * 0.7) {
    return truncated.substring(0, lastPeriod + 1);
  }

  return truncated + '...';
}

export default {
  retrieveSimilarPairs,
  formatPairsForPrompt
};
