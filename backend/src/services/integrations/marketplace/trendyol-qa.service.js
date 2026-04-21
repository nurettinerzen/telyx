import prisma from '../../../prismaClient.js';
import {
  MARKETPLACE_PLATFORM,
  buildMarketplaceCredentials,
  decryptMarketplaceCredentials,
  truncateMarketplaceAnswer,
} from '../../marketplace/qaShared.js';

const TRENDYOL_API_BASE_URL = process.env.TRENDYOL_API_BASE_URL || 'https://apigw.trendyol.com';
const QUESTION_LIST_PATH = '/integration/qna/sellers/{sellerId}/questions/filter';
const ANSWER_PATH = '/integration/qna/sellers/{sellerId}/questions/{questionId}/answers';
const APPROVED_PRODUCTS_PATH = '/integration/product/sellers/{sellerId}/products/approved';

function createBasicAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function buildQuestionListUrl(sellerId, query = {}) {
  const url = new URL(
    QUESTION_LIST_PATH.replace('{sellerId}', encodeURIComponent(String(sellerId))),
    TRENDYOL_API_BASE_URL
  );

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.append(key, String(value));
  });

  return url.toString();
}

function buildAnswerUrl(sellerId, questionId) {
  return new URL(
    ANSWER_PATH
      .replace('{sellerId}', encodeURIComponent(String(sellerId)))
      .replace('{questionId}', encodeURIComponent(String(questionId))),
    TRENDYOL_API_BASE_URL
  ).toString();
}

function buildApprovedProductsUrl(sellerId, query = {}) {
  const url = new URL(
    APPROVED_PRODUCTS_PATH.replace('{sellerId}', encodeURIComponent(String(sellerId))),
    TRENDYOL_API_BASE_URL
  );

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.append(key, String(value));
  });

  return url.toString();
}

async function safeReadResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeQuestion(item = {}) {
  return {
    platform: MARKETPLACE_PLATFORM.TRENDYOL,
    externalId: String(item.id),
    productName: item.productName || null,
    productBarcode: item.barcode || item.productBarcode || null,
    productUrl: item.webUrl || null,
    productImageUrl: item.imageUrl || null,
    customerName: item.showUserName ? (item.userName || null) : null,
    questionText: String(item.text || '').trim(),
    platformStatus: item.status || null,
    answeredAt: item.answer?.creationDate ? new Date(item.answer.creationDate) : null,
    raw: item,
  };
}

function normalizeAttributeValues(attribute = {}) {
  if (Array.isArray(attribute.attributeValues) && attribute.attributeValues.length > 0) {
    return attribute.attributeValues
      .map((item) => item?.attributeValue)
      .filter(Boolean)
      .map((value) => `${attribute.attributeName}: ${value}`);
  }

  if (attribute.attributeName && attribute.attributeValue) {
    return [`${attribute.attributeName}: ${attribute.attributeValue}`];
  }

  return [];
}

function normalizeProductContext(item = {}) {
  const factLines = [
    ...(Array.isArray(item.attributes) ? item.attributes.flatMap(normalizeAttributeValues) : []),
    ...(Array.isArray(item.variantAttributes) ? item.variantAttributes.flatMap(normalizeAttributeValues) : []),
  ].filter(Boolean);

  return {
    title: item.title || null,
    barcode: item.barcode || null,
    stockCode: item.stockCode || null,
    brand: item.brand?.name || item.brand || null,
    categoryName: item.category?.name || item.categoryName || null,
    description: item.description || null,
    productUrl: item.productUrl || null,
    productImageUrl: Array.isArray(item.images) ? item.images[0]?.url || null : null,
    facts: factLines,
    source: 'trendyol-product-api',
  };
}

class TrendyolQaService {
  constructor(credentials = null) {
    this.credentials = credentials ? buildMarketplaceCredentials(credentials) : null;
  }

  static async hasIntegration(businessId) {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId,
        type: MARKETPLACE_PLATFORM.TRENDYOL,
        connected: true,
        isActive: true,
      },
      select: { id: true },
    });

    return Boolean(integration);
  }

  async getCredentials(businessId) {
    if (this.credentials) {
      return this.credentials;
    }

    const integration = await prisma.integration.findFirst({
      where: {
        businessId,
        type: MARKETPLACE_PLATFORM.TRENDYOL,
        isActive: true,
      },
    });

    if (!integration) {
      throw new Error('Trendyol entegrasyonu yapılandırılmamış');
    }

    this.credentials = decryptMarketplaceCredentials(integration.credentials);
    return this.credentials;
  }

  async request(credentials, url, options = {}) {
    const authHeader = createBasicAuthHeader(credentials.apiKey, credentials.apiSecret);
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        'User-Agent': `${credentials.sellerId} - TelyxMarketplaceQA`,
        ...options.headers,
      },
    });

    const payload = await safeReadResponse(response);

    if (!response.ok) {
      const message = typeof payload === 'string'
        ? payload
        : payload?.message || payload?.error || `Trendyol API error: ${response.status}`;

      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  validateCredentials(credentials) {
    const { sellerId, apiKey, apiSecret } = credentials || {};

    if (!sellerId || !apiKey || !apiSecret) {
      throw new Error('sellerId, apiKey ve apiSecret alanları zorunludur');
    }
  }

  async testConnection(credentialsInput) {
    try {
      const credentials = buildMarketplaceCredentials(credentialsInput);
      this.validateCredentials(credentials);

      const payload = await this.request(
        credentials,
        buildQuestionListUrl(credentials.sellerId, {
          page: 0,
          size: 1,
          status: 'WAITING_FOR_ANSWER',
          supplierId: credentials.sellerId,
        }),
        { method: 'GET' }
      );

      return {
        success: true,
        message: 'Trendyol bağlantısı başarılı',
        sellerId: credentials.sellerId,
        totalElements: payload?.totalElements ?? 0,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Trendyol bağlantı testi başarısız',
      };
    }
  }

  async fetchUnansweredQuestions(businessId, options = {}) {
    const credentials = await this.getCredentials(businessId);
    this.validateCredentials(credentials);

    const size = Math.min(Number(options.size) || 50, 50);
    const maxPages = Math.max(1, Number(options.maxPages) || 50);
    const questions = [];
    let page = 0;
    let totalPages = 1;

    while (page < totalPages && page < maxPages) {
      const payload = await this.request(
        credentials,
        buildQuestionListUrl(credentials.sellerId, {
          page,
          size,
          status: options.status || 'WAITING_FOR_ANSWER',
          supplierId: credentials.sellerId,
          orderByField: options.orderByField || 'CreatedDate',
          orderByDirection: options.orderByDirection || 'DESC',
          startDate: options.startDate,
          endDate: options.endDate,
        }),
        { method: 'GET' }
      );

      const pageItems = Array.isArray(payload?.content) ? payload.content : [];
      questions.push(...pageItems.map(normalizeQuestion));

      totalPages = Math.max(1, Number(payload?.totalPages) || 1);
      page += 1;
    }

    return questions.filter((question) => question.externalId && question.questionText);
  }

  async getProductContext(businessId, { barcode } = {}) {
    if (!barcode) {
      return null;
    }

    try {
      const credentials = await this.getCredentials(businessId);
      this.validateCredentials(credentials);

      const payload = await this.request(
        credentials,
        buildApprovedProductsUrl(credentials.sellerId, {
          page: 0,
          size: 1,
          barcode,
          supplierId: credentials.sellerId,
        }),
        { method: 'GET' }
      );

      const product = Array.isArray(payload?.content) ? payload.content[0] : null;
      if (!product) {
        return null;
      }

      return normalizeProductContext(product);
    } catch (error) {
      console.warn(`Trendyol product context lookup failed for barcode ${barcode}:`, error.message);
      return null;
    }
  }

  async postAnswer(businessId, questionId, answerText) {
    const credentials = await this.getCredentials(businessId);
    this.validateCredentials(credentials);

    const normalizedAnswer = truncateMarketplaceAnswer(answerText, 2000);

    if (normalizedAnswer.length < 10 || normalizedAnswer.length > 2000) {
      throw new Error('Trendyol cevabı 10 ile 2000 karakter arasında olmalıdır');
    }

    const payload = await this.request(
      credentials,
      buildAnswerUrl(credentials.sellerId, questionId),
      {
        method: 'POST',
        body: JSON.stringify({ text: normalizedAnswer }),
      }
    );

    return {
      success: true,
      answer: normalizedAnswer,
      payload,
    };
  }
}

export default TrendyolQaService;
