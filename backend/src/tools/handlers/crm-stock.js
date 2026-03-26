/**
 * CRM Stock Handler
 *
 * Search strategy:
 * - SKU given → exact match (single product)
 * - product_name given → backend retrieves and ranks candidate products
 * - LLM is used for final wording/disambiguation, not blind catalog matching
 *
 * Stock Disclosure Policy: NEVER return raw quantities to LLM
 */

import prisma from '../../prismaClient.js';
import { ok, notFound, systemError } from '../toolResult.js';
import {
  applyDisclosurePolicy,
  applyDisclosureToCandidates,
  formatAvailabilityStatus,
  formatQuantityCheck
} from '../../policies/stockDisclosurePolicy.js';
import { normalizeTurkish } from '../../utils/text.js';

const CATALOG_SCAN_LIMIT = 1000;
const MAX_DISAMBIGUATION_OPTIONS = 3;
const SEARCH_STOPWORDS = new Set([
  'bir', 'bu', 'bana', 've', 'ile', 'icin', 'için', 'lazim', 'lazım',
  'urun', 'ürün', 'model', 'stok', 'stokta', 'fiyat', 'var', 'mi', 'mı', 'mu', 'mü',
  'sizde', 'sizde', 'satiliyor', 'satılıyor', 'satiginiz', 'sattiginiz', 'sattiğiniz',
  'istedigim', 'istediğim', 'istiyorum', 'olan', 'bulunan', 'hakkinda', 'hakkında',
  'yardim', 'yardım', 'bilir', 'misin'
]);

function normalizeProductSearchText(text) {
  return normalizeTurkish(text)
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeProductSearch(text) {
  return normalizeProductSearchText(text)
    .split(/\s+/)
    .filter(token => {
      if (!token) return false;
      if (/^\d+$/.test(token)) return true;
      return token.length >= 2 && !SEARCH_STOPWORDS.has(token);
    });
}

function extractNumericTokens(tokens) {
  return tokens.filter(token => /\d/.test(token));
}

function candidateHasNumericToken(token, nameTokens, normalizedName) {
  if (!token) return false;
  if (nameTokens.includes(token)) return true;
  if (normalizedName.includes(` ${token} `)) return true;
  return nameTokens.some(nameToken => {
    if (!/\d/.test(nameToken)) return false;
    return nameToken.includes(token);
  });
}

function scoreCatalogCandidate(searchTerm, stockItem) {
  const normalizedQuery = normalizeProductSearchText(searchTerm);
  const normalizedName = normalizeProductSearchText(stockItem.productName || stockItem.name || '');

  if (!normalizedQuery || !normalizedName) return null;

  const queryTokens = tokenizeProductSearch(searchTerm);
  const nameTokens = normalizedName.split(/\s+/).filter(Boolean);
  const numericQueryTokens = extractNumericTokens(queryTokens);
  const textQueryTokens = queryTokens.filter(token => !/\d/.test(token));

  if (numericQueryTokens.length > 0) {
    const hasAllNumericSignals = numericQueryTokens.every(token =>
      candidateHasNumericToken(token, nameTokens, normalizedName)
    );

    if (!hasAllNumericSignals) {
      return null;
    }
  }

  let score = 0;
  let matchedExact = 0;
  let matchedPartial = 0;
  let matchedTextExact = 0;
  let matchedTextPartial = 0;

  const exactPhrase = normalizedName === normalizedQuery;
  const containsPhrase = normalizedName.includes(normalizedQuery);

  if (exactPhrase) score += 1000;
  if (containsPhrase) score += 450;
  if (normalizedName.startsWith(normalizedQuery)) score += 125;

  for (const token of queryTokens) {
    const isNumeric = /^\d+$/.test(token);

    if (nameTokens.includes(token)) {
      matchedExact += 1;
      if (!isNumeric) matchedTextExact += 1;
      score += isNumeric ? 160 : 85;
      continue;
    }

    if (normalizedName.includes(token)) {
      matchedPartial += 1;
      if (!isNumeric) matchedTextPartial += 1;
      score += isNumeric ? 80 : 40;
      continue;
    }

    const fuzzyMatch = nameTokens.some(nameToken =>
      nameToken.length >= 3 &&
      token.length >= 3 &&
      (
        nameToken.startsWith(token) ||
        token.startsWith(nameToken)
      )
    );

    if (fuzzyMatch) {
      matchedPartial += 1;
      if (!isNumeric) matchedTextPartial += 1;
      score += isNumeric ? 40 : 20;
    }
  }

  const tokenCoverage = queryTokens.length > 0
    ? (matchedExact + (matchedPartial * 0.5)) / queryTokens.length
    : (containsPhrase ? 1 : 0);
  const textCoverage = textQueryTokens.length > 0
    ? (matchedTextExact + (matchedTextPartial * 0.5)) / textQueryTokens.length
    : 1;

  if (textQueryTokens.length > 0 && matchedTextExact + matchedTextPartial === 0) {
    return null;
  }

  if (textQueryTokens.length >= 2 && !containsPhrase && textCoverage < 0.6) {
    return null;
  }

  if (queryTokens.length > 0 && matchedExact === queryTokens.length) {
    score += 250;
  }

  if (queryTokens.length >= 2 && matchedExact >= 2) {
    score += 80;
  }

  if (score <= 0) return null;

  return {
    ...stockItem,
    score,
    exactPhrase,
    containsPhrase,
    matchedExact,
    matchedPartial,
    matchedTextExact,
    matchedTextPartial,
    tokenCoverage,
    textCoverage,
    normalizedName
  };
}

export function resolveCatalogCandidates(stockCatalog, searchTerm) {
  const normalizedQuery = normalizeProductSearchText(searchTerm);
  const queryTokens = tokenizeProductSearch(searchTerm);

  const ranked = stockCatalog
    .map(item => scoreCatalogCandidate(searchTerm, item))
    .filter(Boolean)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.productName.length - b.productName.length;
    });

  if (ranked.length === 0) {
    return {
      directMatch: null,
      candidatePool: [],
      queryTokens,
      normalizedQuery
    };
  }

  const broadQuery = queryTokens.length <= 1;
  const filtered = ranked.filter(candidate => {
    if (candidate.exactPhrase || candidate.containsPhrase) return true;
    if (broadQuery) return candidate.matchedExact >= 1 || candidate.matchedPartial >= 1;
    return candidate.tokenCoverage >= 0.6 || candidate.matchedExact >= Math.min(2, queryTokens.length);
  });

  const allowLooseFallback = queryTokens.length <= 1;
  const candidatePool = filtered.length > 0
    ? filtered
    : (allowLooseFallback ? ranked : []);
  const top = candidatePool[0];
  const second = candidatePool[1];
  const topIsStrong = top && (
    top.exactPhrase ||
    top.containsPhrase ||
    top.tokenCoverage >= 0.95 ||
    (queryTokens.length >= 2 && top.matchedExact === queryTokens.length)
  );
  const broadSingleTokenQuery = queryTokens.length <= 1;
  const hasClearGap = !second ||
    (top.score - second.score >= 150) ||
    (second.tokenCoverage < 0.6 && top.tokenCoverage >= 0.85);

  const canDirectResolve = !broadSingleTokenQuery || top?.exactPhrase;
  const uniqueBroadCandidate = broadSingleTokenQuery && candidatePool.length === 1 ? top : null;
  const directMatch =
    uniqueBroadCandidate ||
    (topIsStrong && hasClearGap && canDirectResolve ? top : null);

  return {
    directMatch,
    candidatePool,
    queryTokens,
    normalizedQuery
  };
}

/**
 * Execute CRM stock check
 */
export async function execute(args, business, context = {}) {
  try {
    const { product_name, sku, requested_qty } = args;
    const language = business.language || 'TR';

    console.log('🔍 CRM: Checking stock:', { product_name, sku, requested_qty });

    const reqQty = requested_qty ? parseInt(requested_qty, 10) : null;

    // ─── SKU: exact match ──────────────────────────────────────────
    if (sku) {
      const candidates = await prisma.crmStock.findMany({
        where: { businessId: business.id, sku: { equals: sku, mode: 'insensitive' } },
        take: 5
      });

      if (candidates.length === 0) {
        return notFound(
          language === 'TR'
            ? `"${sku}" SKU kodlu ürün bulunamadı.`
            : `Product with SKU "${sku}" not found.`
        );
      }

      const stock = candidates[0];
      const disclosed = applyDisclosurePolicy(stock, { requestedQty: reqQty });

      return ok({
        match_type: 'EXACT_SKU',
        sku: stock.sku,
        product_name: stock.productName,
        availability: disclosed.availability,
        price: stock.price,
        estimated_restock: disclosed.estimated_restock,
        quantity_check: disclosed.quantity_check || null,
        last_update: stock.externalUpdatedAt
      }, formatSingleStockMessage(stock, disclosed, language));
    }

    // ─── Product name: retrieve + rank candidates, then disambiguate ───────
    const allStock = await prisma.crmStock.findMany({
      where: { businessId: business.id },
      select: {
        sku: true,
        productName: true,
        inStock: true,
        quantity: true,
        price: true,
        estimatedRestock: true,
        externalUpdatedAt: true
      },
      orderBy: { productName: 'asc' },
      take: CATALOG_SCAN_LIMIT
    });

    if (allStock.length === 0) {
      return notFound(
        language === 'TR'
          ? 'Bu işletme için stok verisi bulunamadı.'
          : 'No stock data found for this business.'
      );
    }

    const { directMatch, candidatePool } = resolveCatalogCandidates(allStock, product_name || '');

    console.log('🔎 CRM Stock candidate resolution:', {
      searchTerm: product_name,
      totalProducts: allStock.length,
      candidateCount: candidatePool.length,
      directMatch: directMatch?.productName || null
    });

    if (candidatePool.length === 0) {
      return notFound(
        language === 'TR'
          ? `"${product_name}" için stok bilgisi bulunamadı.`
          : `Stock information not found for "${product_name}".`
      );
    }

    if (directMatch) {
      const disclosed = applyDisclosurePolicy(directMatch, { requestedQty: reqQty });

      return ok({
        match_type: 'EXACT_SKU',
        sku: directMatch.sku,
        product_name: directMatch.productName,
        availability: disclosed.availability,
        price: directMatch.price,
        estimated_restock: disclosed.estimated_restock,
        quantity_check: disclosed.quantity_check || null,
        last_update: directMatch.externalUpdatedAt
      }, formatSingleStockMessage(directMatch, disclosed, language));
    }

    const topCandidates = candidatePool.slice(0, MAX_DISAMBIGUATION_OPTIONS);
    const disambiguationSource = topCandidates.map(candidate => ({
      productName: candidate.productName,
      sku: candidate.sku,
      inStock: candidate.inStock,
      quantity: candidate.quantity,
      price: candidate.price
    }));
    const disambiguationResult = applyDisclosureToCandidates(disambiguationSource, {
      requestedQty: reqQty
    });

    const responseMessage = formatCatalogDisambiguationMessage(
      product_name || '',
      candidatePool.length,
      disambiguationResult.candidates_summary.top_options,
      language
    );

    return ok({
      match_type: 'MULTIPLE_CANDIDATES',
      search_term: product_name || null,
      total_matches: candidatePool.length,
      disambiguation_required: true,
      candidates_summary: {
        ...disambiguationResult.candidates_summary,
        count: candidatePool.length
      }
    }, responseMessage);

  } catch (error) {
    console.error('❌ CRM stock lookup error:', error);
    return systemError(
      business.language === 'TR'
        ? 'Stok sorgusunda sistem hatası oluştu.'
        : 'System error during stock query.',
      error
    );
  }
}

// ─── Formatting helpers ──────────────────────────────────────────────

function formatSingleStockMessage(stock, disclosed, language) {
  const statusLabel = formatAvailabilityStatus(disclosed.availability, language);

  if (language === 'TR') {
    let message = `${stock.productName}: ${statusLabel}.`;

    if (disclosed.quantity_check) {
      message += ` ${formatQuantityCheck(disclosed.quantity_check, 'TR')}`;
    }

    if (disclosed.availability === 'OUT_OF_STOCK' && stock.estimatedRestock) {
      const date = new Date(stock.estimatedRestock);
      message += ` Tahmini stok yenileme tarihi: ${date.toLocaleDateString('tr-TR')}.`;
    }

    if (stock.price) {
      message += ` Fiyat: ${stock.price.toLocaleString('tr-TR')} TL.`;
    }

    return message;
  }

  let message = `${stock.productName}: ${statusLabel}.`;

  if (disclosed.quantity_check) {
    message += ` ${formatQuantityCheck(disclosed.quantity_check, 'EN')}`;
  }

  if (disclosed.availability === 'OUT_OF_STOCK' && stock.estimatedRestock) {
    const date = new Date(stock.estimatedRestock);
    message += ` Expected restock date: ${date.toLocaleDateString('en-US')}.`;
  }

  if (stock.price) {
    message += ` Price: ${stock.price} TL.`;
  }

  return message;
}

function formatCatalogDisambiguationMessage(searchTerm, totalMatches, topOptions, language) {
  const optionLabels = topOptions
    .map(option => option.sku ? `${option.label} (${option.sku})` : option.label)
    .join(', ');

  if (language === 'TR') {
    if (totalMatches > MAX_DISAMBIGUATION_OPTIONS) {
      return `"${searchTerm}" araması için ${totalMatches} uygun ürün buldum. Daha net yardımcı olabilmem için ürün adını biraz daha spesifik paylaşır mısınız? Öne çıkan seçenekler: ${optionLabels}.`;
    }

    return `"${searchTerm}" araması için ${totalMatches} uygun ürün buldum. Şunlardan hangisini kastediyorsunuz: ${optionLabels}?`;
  }

  if (totalMatches > MAX_DISAMBIGUATION_OPTIONS) {
    return `I found ${totalMatches} matching products for "${searchTerm}". Could you be a bit more specific? Top options: ${optionLabels}.`;
  }

  return `I found ${totalMatches} matching products for "${searchTerm}". Which one do you mean: ${optionLabels}?`;
}

export default { execute };
