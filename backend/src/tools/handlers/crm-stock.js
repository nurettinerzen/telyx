/**
 * CRM Stock Handler
 * Checks stock from custom CRM webhook data
 *
 * ARCHITECTURE:
 * - Phase A: Candidate listing (findMany, not findFirst)
 * - Phase B: Disambiguation if multiple candidates
 * - Stock Disclosure Policy: NEVER return raw quantities to LLM
 *
 * match_type: EXACT_SKU | MULTIPLE_CANDIDATES | NO_MATCH
 */

import prisma from '../../prismaClient.js';
import { ok, notFound, validationError, systemError } from '../toolResult.js';
import {
  applyDisclosurePolicy,
  applyDisclosureToCandidates,
  formatAvailabilityStatus,
  formatQuantityCheck
} from '../../policies/stockDisclosurePolicy.js';

/**
 * Execute CRM stock check
 */
export async function execute(args, business, context = {}) {
  try {
    const { product_name, sku, requested_qty } = args;
    const language = business.language || 'TR';

    console.log('🔍 CRM: Checking stock:', { product_name, sku, requested_qty });

    // Validate - at least one parameter required
    if (!product_name && !sku) {
      return validationError(
        language === 'TR'
          ? 'Ürün adı veya SKU kodu gerekli.'
          : 'Product name or SKU is required.',
        'product_name | sku'
      );
    }

    // ─── Phase A: Candidate listing ───────────────────────────────
    let candidates;

    if (sku) {
      // Exact SKU match → Prisma is fine
      candidates = await prisma.crmStock.findMany({
        where: { businessId: business.id, sku: { equals: sku, mode: 'insensitive' } },
        take: 20
      });
    } else {
      // Product name search: use translate() for Turkish char normalization
      // "nova ses gecidi" must match "Nova Ses Geçidi Pro Bulut"
      candidates = await prisma.$queryRaw`
        SELECT * FROM "CrmStock"
        WHERE "businessId" = ${business.id}
        AND (
          LOWER("sku") LIKE '%' || LOWER(${product_name}) || '%'
          OR translate(LOWER("productName"), 'çğıöşü', 'cgiosu')
             LIKE '%' || translate(LOWER(${product_name}), 'çğıöşü', 'cgiosu') || '%'
        )
        LIMIT 20
      `;
    }

    if (candidates.length === 0) {
      return notFound(
        language === 'TR'
          ? `"${product_name || sku}" için stok bilgisi bulunamadı.`
          : `Stock information not found for "${product_name || sku}".`
      );
    }

    console.log(`✅ CRM Stock: ${candidates.length} candidate(s) found`);

    // Parse requested quantity if provided
    const reqQty = requested_qty ? parseInt(requested_qty, 10) : null;

    // ─── Phase B: Single match → apply disclosure and return ───────
    if (candidates.length === 1) {
      const stock = candidates[0];
      const disclosed = applyDisclosurePolicy(stock, {
        requestedQty: reqQty
      });

      const responseMessage = formatSingleStockMessage(stock, disclosed, language);

      return ok({
        match_type: 'EXACT_SKU',
        sku: stock.sku,
        product_name: stock.productName,
        availability: disclosed.availability,
        price: stock.price,
        estimated_restock: disclosed.estimated_restock,
        quantity_check: disclosed.quantity_check || null,
        last_update: stock.externalUpdatedAt
        // NOTE: raw quantity is NEVER included
      }, responseMessage);
    }

    // ─── Phase B: Multiple candidates → disambiguation needed ──────
    const disambiguationResult = applyDisclosureToCandidates(candidates, {
      requestedQty: reqQty
    });

    const responseMessage = formatDisambiguationMessage(
      product_name || sku,
      disambiguationResult,
      language
    );

    return ok({
      match_type: 'MULTIPLE_CANDIDATES',
      search_term: product_name || sku,
      candidates_summary: disambiguationResult.candidates_summary,
      // LLM should ask clarifying questions before giving stock status
      disambiguation_required: true
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

/**
 * Format stock message for a single matched product (no raw quantity)
 */
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

  // English
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

/**
 * Format disambiguation message when multiple candidates found
 */
function formatDisambiguationMessage(searchTerm, result, language) {
  const { candidates_summary } = result;
  const count = candidates_summary.count;
  const options = candidates_summary.top_options.map(o => o.label);
  const dims = candidates_summary.dimensions;

  if (language === 'TR') {
    let message = `"${searchTerm}" araması için ${count} farklı ürün bulundu.`;

    if (dims.length > 0) {
      const dimLabels = {
        model: 'model',
        storage: 'depolama',
        color: 'renk',
        size: 'beden',
        carrier: 'operatör'
      };
      const dimStr = dims.map(d => dimLabels[d] || d).join(', ');
      message += ` Varyasyon boyutları: ${dimStr}.`;
    }

    message += ` Seçenekler: ${options.join(', ')}.`;
    message += ` Stok durumu modele göre değişiyor. Hangi ürünü sorgulamak istediğini netleştirmek gerekiyor.`;

    return message;
  }

  // English
  let message = `Found ${count} products matching "${searchTerm}".`;

  if (dims.length > 0) {
    message += ` Variation dimensions: ${dims.join(', ')}.`;
  }

  message += ` Options: ${options.join(', ')}.`;
  message += ` Stock status varies by product. Please specify which product you'd like to check.`;

  return message;
}

export default { execute };
