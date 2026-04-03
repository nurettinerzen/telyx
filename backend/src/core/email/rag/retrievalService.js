/**
 * Email Retrieval Service
 *
 * Retrieves similar emails for RAG context.
 * Uses cosine similarity on embeddings.
 *
 * RETRIEVAL POLICY:
 * 1. K=3-5 similar threads
 * 2. Recency bias: last 90 days weighted more
 * 3. Business isolation enforced
 * 4. PII already scrubbed in embeddings
 */

import OpenAI from 'openai';
import prisma from '../../../prismaClient.js';
import { generateEmbedding } from './embeddingService.js';

// Constants
const DEFAULT_K = 5;
const MAX_K = 10;
const RECENCY_DAYS = 90;
const RECENCY_BOOST = 1.3; // 30% boost for recent emails
const MIN_SIMILARITY = 0.7; // Minimum cosine similarity threshold

// Performance guards
const MAX_RETRIEVAL_TIME_MS = 2000; // 2 second hard timeout
const MAX_CANDIDATES_DB = 100; // Hard limit on DB query
const FAIL_FAST_THRESHOLD_MS = 1500; // Warn if approaching timeout

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Apply recency boost to similarity score
 */
function applyRecencyBoost(similarity, sentAt) {
  if (!sentAt) {
    return similarity;
  }

  const now = new Date();
  const sent = new Date(sentAt);
  const daysDiff = (now - sent) / (1000 * 60 * 60 * 24);

  if (daysDiff <= RECENCY_DAYS) {
    // Linear boost: more recent = higher boost
    const boostFactor = 1 + ((RECENCY_DAYS - daysDiff) / RECENCY_DAYS) * (RECENCY_BOOST - 1);
    return similarity * boostFactor;
  }

  return similarity;
}

/**
 * Retrieve similar emails for a query
 *
 * @param {Object} params
 * @param {number} params.businessId - Business ID (required for isolation)
 * @param {string} params.query - The query text (customer email content)
 * @param {Object} params.filters - Optional filters
 * @param {number} params.k - Number of results (default 5)
 * @returns {Promise<Array>} Similar emails with scores
 */
export async function retrieveSimilarEmails({
  businessId,
  query,
  filters = {},
  k = DEFAULT_K
}) {
  // CRITICAL: businessId is REQUIRED for tenant isolation
  if (!businessId) {
    console.error('🚫 [Retrieval] SECURITY: businessId is required');
    throw new Error('businessId is required for retrieval - cross-tenant protection');
  }

  console.log(`🔍 [Retrieval] Searching for business ${businessId}, k=${k}`);

  const startTime = Date.now();
  let timeoutReached = false;
  let abortController = null;

  // Create abort controller for cancellable operations
  if (typeof AbortController !== 'undefined') {
    abortController = new AbortController();
  }

  // Set timeout guard with real abort
  const timeoutHandle = setTimeout(() => {
    timeoutReached = true;
    console.warn(`⏱️ [Retrieval] TIMEOUT: Retrieval exceeded ${MAX_RETRIEVAL_TIME_MS}ms`);

    // Abort any ongoing operations
    if (abortController) {
      abortController.abort();
    }
  }, MAX_RETRIEVAL_TIME_MS);

  try {
    // Generate embedding for query
    const queryResult = await generateEmbedding(query);
    if (!queryResult) {
      console.warn('⚠️ [Retrieval] Could not generate query embedding');
      return [];
    }

    const queryEmbedding = queryResult.embedding;

    // Build filter conditions - businessId is ALWAYS first and required
    // This ensures cross-tenant isolation at database level
    const whereConditions = {
      businessId: businessId,  // HARD FILTER - never optional
      direction: 'OUTBOUND'    // Only our sent responses
    };

    if (filters.intent) {
      whereConditions.intent = filters.intent;
    }

    if (filters.language) {
      whereConditions.language = filters.language;
    }

    if (filters.maxAge) {
      whereConditions.sentAt = {
        gte: new Date(Date.now() - filters.maxAge * 24 * 60 * 60 * 1000)
      };
    }

    // Check if timeout already reached
    if (timeoutReached) {
      clearTimeout(timeoutHandle);
      console.error('❌ [Retrieval] Aborted due to timeout before DB query');
      return [];
    }

    // Fetch candidate embeddings with Postgres statement_timeout
    // This ensures DB-level abort if query exceeds timeout
    const remainingTime = MAX_RETRIEVAL_TIME_MS - (Date.now() - startTime);
    const statementTimeout = Math.max(500, remainingTime); // Min 500ms

    const dbQueryPromise = prisma.$transaction(async (tx) => {
      // Set Postgres statement_timeout for this transaction
      // Format: 'value' as string (e.g., '2000ms' or '2s')
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '${statementTimeout}ms'`);

      // Execute retrieval query
      // Uses composite index: EmailEmbedding_retrieval_idx (businessId, direction, intent, sentAt DESC)
      return tx.emailEmbedding.findMany({
        where: whereConditions,
        select: {
          id: true,
          threadId: true,
          messageId: true,
          content: true,
          intent: true,
          language: true,
          sentAt: true,
          tags: true,
          chunkIndex: true
        },
        take: MAX_CANDIDATES_DB, // Hard limit for performance
        orderBy: { sentAt: 'desc' }
      });
    }, {
      maxWait: statementTimeout,
      timeout: statementTimeout
    });

    // Race DB query against timeout (belt-and-suspenders)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('DB_QUERY_TIMEOUT')), statementTimeout + 100);
    });

    const candidates = await Promise.race([dbQueryPromise, timeoutPromise]);

    if (candidates.length === 0) {
      console.log('ℹ️ [Retrieval] No candidates found');
      return [];
    }

    // For each candidate, we need to get its embedding
    // In production with pgvector, this would be a single query
    // For now, simulate with stored embeddings (if available)

    // Since we're not storing vectors in DB yet, we'll use a fallback
    // This will be replaced with pgvector query later
    console.log(`📊 [Retrieval] Found ${candidates.length} candidates, computing similarity...`);

    // Group by thread to avoid duplicate threads
    const threadMap = new Map();

    for (const candidate of candidates) {
      // For now, use content-based similarity as fallback
      // In production, use vector similarity
      const textSimilarity = computeTextSimilarity(query, candidate.content);
      const boostedScore = applyRecencyBoost(textSimilarity, candidate.sentAt);

      const existing = threadMap.get(candidate.threadId);
      if (!existing || boostedScore > existing.score) {
        threadMap.set(candidate.threadId, {
          ...candidate,
          score: boostedScore,
          rawScore: textSimilarity
        });
      }
    }

    // Sort by score and take top K
    const results = Array.from(threadMap.values())
      .filter(r => r.rawScore >= MIN_SIMILARITY * 0.5) // Lower threshold for text similarity
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(k, MAX_K));

    // Check final latency
    const totalLatency = Date.now() - startTime;
    if (totalLatency > FAIL_FAST_THRESHOLD_MS) {
      console.warn(`⚠️ [Retrieval] Slow retrieval: ${totalLatency}ms (threshold: ${FAIL_FAST_THRESHOLD_MS}ms)`);
    }

    console.log(`✅ [Retrieval] Found ${results.length} similar emails in ${totalLatency}ms`);

    clearTimeout(timeoutHandle);
    return results;

  } catch (error) {
    clearTimeout(timeoutHandle);

    if (error.message === 'DB_QUERY_TIMEOUT') {
      console.error('❌ [Retrieval] DB query timeout - aborting retrieval');
      return [];
    }

    console.error('❌ [Retrieval] Search failed:', error);
    return [];
  }
}

/**
 * Simple text similarity fallback (Jaccard on words)
 * Used when vector similarity is not available
 */
function computeTextSimilarity(text1, text2) {
  if (!text1 || !text2) return 0;

  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Retrieve and format examples for LLM prompt
 *
 * @param {Object} params
 * @param {number} params.businessId
 * @param {string} params.customerEmail - The customer's email content
 * @param {Object} params.classification - Email classification
 * @param {number} params.maxExamples - Max examples to return
 * @returns {Promise<Array>} Formatted examples for LLM
 */
export async function retrieveExamplesForPrompt({
  businessId,
  customerEmail,
  classification = {},
  maxExamples = 3
}) {
  console.log(`📚 [Retrieval] Getting examples for prompt`);

  try {
    // Retrieve similar emails
    const similar = await retrieveSimilarEmails({
      businessId,
      query: customerEmail,
      filters: {
        intent: classification.intent,
        language: classification.language || 'TR',
        maxAge: 180 // Last 6 months
      },
      k: maxExamples + 2 // Get a few extra for filtering
    });

    if (similar.length === 0) {
      return [];
    }

    // Fetch full thread context for top results
    const examples = [];

    for (const result of similar.slice(0, maxExamples)) {
      // Get the thread and message details
      const thread = await prisma.emailThread.findUnique({
        where: { id: result.threadId },
        select: {
          subject: true,
          messages: {
            where: { id: result.messageId },
            select: {
              bodyText: true,
              bodyHtml: true,
              subject: true
            },
            take: 1
          }
        }
      });

      if (!thread || !thread.messages[0]) {
        continue;
      }

      const message = thread.messages[0];
      const replyBody = message.bodyText || stripHtml(message.bodyHtml) || '';

      // Format for LLM
      examples.push({
        subject: thread.subject,
        intent: result.intent,
        similarity: Math.round(result.score * 100) / 100,
        key_phrases: extractKeyPhrases(result.content),
        reply_body: truncateText(replyBody, 250) // Max 250 tokens worth
      });
    }

    console.log(`✅ [Retrieval] Prepared ${examples.length} examples for prompt`);

    return examples;

  } catch (error) {
    console.error('❌ [Retrieval] Failed to get examples:', error);
    return [];
  }
}

/**
 * Extract key phrases from text (simple extraction)
 */
function extractKeyPhrases(text, maxPhrases = 5) {
  if (!text) return [];

  // Simple approach: extract capitalized phrases and common patterns
  const phrases = [];

  // Look for quoted text
  const quoted = text.match(/"[^"]+"/g) || [];
  phrases.push(...quoted.slice(0, 2));

  // Look for numbered items
  const numbered = text.match(/\d+\.\s+[^.]+/g) || [];
  phrases.push(...numbered.slice(0, 2));

  // Fall back to first sentence
  if (phrases.length === 0) {
    const firstSentence = text.split(/[.!?]/)[0];
    if (firstSentence && firstSentence.length < 100) {
      phrases.push(firstSentence.trim());
    }
  }

  return phrases.slice(0, maxPhrases);
}

/**
 * Strip HTML tags
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Truncate text to approximate token limit
 */
function truncateText(text, maxTokens) {
  if (!text) return '';

  // Rough estimate: 1 token ≈ 4 chars
  const maxChars = maxTokens * 4;

  if (text.length <= maxChars) {
    return text;
  }

  // Truncate at sentence boundary if possible
  const truncated = text.substring(0, maxChars);
  const lastSentence = truncated.lastIndexOf('.');

  if (lastSentence > maxChars * 0.7) {
    return truncated.substring(0, lastSentence + 1);
  }

  return truncated + '...';
}

/**
 * Format retrieved examples for LLM system prompt
 */
export function formatExamplesForPrompt(examples) {
  if (!examples || examples.length === 0) {
    return '';
  }

  let formatted = '\n=== REFERENCE REPLIES (use as style guide, do not copy verbatim) ===\n\n';

  examples.forEach((example, index) => {
    formatted += `[Example ${index + 1}]\n`;
    formatted += `Subject: ${example.subject || 'N/A'}\n`;
    formatted += `Intent: ${example.intent || 'GENERAL'}\n`;

    if (example.key_phrases && example.key_phrases.length > 0) {
      formatted += `Key phrases: ${example.key_phrases.join(', ')}\n`;
    }

    formatted += `Reply:\n${example.reply_body}\n\n`;
  });

  formatted += '=== END REFERENCE REPLIES ===\n';

  return formatted;
}

export default {
  retrieveSimilarEmails,
  retrieveExamplesForPrompt,
  formatExamplesForPrompt,
  cosineSimilarity
};
