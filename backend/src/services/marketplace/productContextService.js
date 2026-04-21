import prisma from '../../prismaClient.js';
import { getMarketplaceServiceForPlatform } from './platformClients.js';

function compactText(value, maxLength = 1200) {
  const normalized = String(value || '')
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function dedupeFacts(items = [], maxItems = 16) {
  const seen = new Set();
  const facts = [];

  for (const item of items) {
    const normalized = compactText(item, 180);
    if (!normalized) continue;

    const key = normalized.toLocaleLowerCase('tr-TR');
    if (seen.has(key)) continue;

    seen.add(key);
    facts.push(normalized);

    if (facts.length >= maxItems) {
      break;
    }
  }

  return facts;
}

async function findLocalProductContext(businessId, { productBarcode, productName } = {}) {
  const orConditions = [];

  if (productBarcode) {
    orConditions.push({ sku: { equals: String(productBarcode), mode: 'insensitive' } });
  }

  if (productName) {
    orConditions.push({ name: { contains: String(productName), mode: 'insensitive' } });
  }

  if (orConditions.length === 0) {
    return null;
  }

  const product = await prisma.product.findFirst({
    where: {
      businessId,
      isActive: true,
      OR: orConditions,
    },
    orderBy: [
      { updatedAt: 'desc' },
      { createdAt: 'desc' },
    ],
    select: {
      name: true,
      sku: true,
      description: true,
      category: true,
      price: true,
      imageUrl: true,
    },
  });

  if (!product) {
    return null;
  }

  const facts = dedupeFacts([
    product.category ? `Kategori: ${product.category}` : null,
    Number.isFinite(product.price) ? `Fiyat: ${product.price}` : null,
  ]);

  return {
    title: product.name || productName || null,
    barcode: product.sku || productBarcode || null,
    description: compactText(product.description, 1200),
    categoryName: product.category || null,
    productImageUrl: product.imageUrl || null,
    facts,
    source: 'local-product',
  };
}

function mergeProductContexts(primary, fallback) {
  if (!primary && !fallback) {
    return null;
  }

  const facts = dedupeFacts([
    ...(primary?.facts || []),
    ...(fallback?.facts || []),
  ]);

  return {
    title: primary?.title || fallback?.title || null,
    barcode: primary?.barcode || fallback?.barcode || null,
    stockCode: primary?.stockCode || fallback?.stockCode || null,
    brand: primary?.brand || fallback?.brand || null,
    categoryName: primary?.categoryName || fallback?.categoryName || null,
    description: compactText(primary?.description || fallback?.description, 1400),
    productUrl: primary?.productUrl || fallback?.productUrl || null,
    productImageUrl: primary?.productImageUrl || fallback?.productImageUrl || null,
    facts,
    source: primary?.source || fallback?.source || null,
  };
}

export async function resolveMarketplaceProductContext({
  businessId,
  platform,
  productBarcode,
  productName,
}) {
  const localContext = await findLocalProductContext(businessId, { productBarcode, productName });

  let platformContext = null;
  try {
    const service = getMarketplaceServiceForPlatform(platform);
    if (typeof service.getProductContext === 'function') {
      platformContext = await service.getProductContext(businessId, {
        barcode: productBarcode,
        productName,
      });
    }
  } catch (error) {
    console.warn(`Marketplace product context lookup failed for ${platform}:`, error.message);
  }

  return mergeProductContexts(platformContext, localContext);
}

export function buildMarketplaceProductContextBlock(productContext) {
  if (!productContext) {
    return 'ÜRÜN BAĞLAMI: Ürün için ek teknik bilgi bulunamadı.';
  }

  const factLines = (productContext.facts || []).slice(0, 16);

  const lines = [
    'ÜRÜN BAĞLAMI:',
    `- Ürün adı: ${productContext.title || 'Belirtilmedi'}`,
    productContext.brand ? `- Marka: ${productContext.brand}` : null,
    productContext.categoryName ? `- Kategori: ${productContext.categoryName}` : null,
    productContext.barcode ? `- Barkod/SKU: ${productContext.barcode}` : null,
    productContext.stockCode ? `- Stok kodu: ${productContext.stockCode}` : null,
    productContext.productUrl ? `- Ürün linki: ${productContext.productUrl}` : null,
    productContext.description ? `- Açıklama: ${productContext.description}` : null,
    factLines.length > 0 ? `- Özellikler: ${factLines.join(' | ')}` : null,
  ].filter(Boolean);

  return lines.join('\n');
}

export default resolveMarketplaceProductContext;
