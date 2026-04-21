import prisma from '../../../prismaClient.js';
import {
  MARKETPLACE_PLATFORM,
  buildMarketplaceCredentials,
  coerceDate,
  decryptMarketplaceCredentials,
  truncateMarketplaceAnswer,
} from '../../marketplace/qaShared.js';

const HEPSIBURADA_API_BASE_URL = process.env.HEPSIBURADA_API_BASE_URL || 'https://api-asktoseller-merchant.hepsiburada.com';
const ISSUES_PATH = '/api/v1.0/issues';
const ANSWER_PATH = '/api/v1.0/issues/{issueNumber}/answer';
const REJECT_PATH = '/api/v1.0/issues/{issueNumber}/reject';

function createBasicAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function buildIssuesUrl(query = {}) {
  const url = new URL(ISSUES_PATH, HEPSIBURADA_API_BASE_URL);

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, String(item)));
      return;
    }
    url.searchParams.append(key, String(value));
  });

  return url.toString();
}

function buildIssueDetailUrl(issueNumber) {
  return new URL(`${ISSUES_PATH}/${encodeURIComponent(String(issueNumber))}`, HEPSIBURADA_API_BASE_URL).toString();
}

function buildIssueAnswerUrl(issueNumber) {
  return new URL(
    ANSWER_PATH.replace('{issueNumber}', encodeURIComponent(String(issueNumber))),
    HEPSIBURADA_API_BASE_URL
  ).toString();
}

function buildIssueRejectUrl(issueNumber) {
  return new URL(
    REJECT_PATH.replace('{issueNumber}', encodeURIComponent(String(issueNumber))),
    HEPSIBURADA_API_BASE_URL
  ).toString();
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

function extractItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.issues)) return payload.issues;
  return [];
}

function resolveQuestionText(issue = {}) {
  if (Array.isArray(issue.conversations) && issue.conversations.length > 0) {
    const customerConversation = issue.conversations.find((item) => item?.from === 'Customer');
    if (customerConversation?.content) return customerConversation.content;
    if (issue.conversations[0]?.content) return issue.conversations[0].content;
  }

  return issue.lastContent
    || issue.question
    || issue.text
    || issue.content
    || issue.description
    || '';
}

function normalizeQuestion(issue = {}) {
  const product = issue.product || {};
  const merchant = issue.merchant || {};

  return {
    platform: MARKETPLACE_PLATFORM.HEPSIBURADA,
    externalId: String(issue.issueNumber || issue.number || issue.id),
    productName: product.name || issue.productName || null,
    productBarcode: product.sku || product.stockCode || issue.sku || null,
    productUrl: product.url || issue.productUrl || null,
    productImageUrl: product.imageUrl || issue.imageUrl || null,
    customerName: issue.customerName || issue.customer?.name || null,
    questionText: String(resolveQuestionText(issue)).trim(),
    platformStatus: issue.status || issue.statusText || null,
    expiresAt: coerceDate(issue.expireDate),
    answeredAt: Array.isArray(issue.conversations)
      ? coerceDate(
          issue.conversations
            .filter((item) => item?.from === 'Merchant')
            .slice(-1)[0]?.createdAt
        )
      : null,
    merchantName: merchant.name || null,
    raw: issue,
  };
}

class HepsiburadaQaService {
  constructor(credentials = null) {
    this.credentials = credentials ? buildMarketplaceCredentials(credentials) : null;
  }

  static async hasIntegration(businessId) {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId,
        type: MARKETPLACE_PLATFORM.HEPSIBURADA,
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
        type: MARKETPLACE_PLATFORM.HEPSIBURADA,
        isActive: true,
      },
    });

    if (!integration) {
      throw new Error('Hepsiburada entegrasyonu yapılandırılmamış');
    }

    this.credentials = decryptMarketplaceCredentials(integration.credentials);
    return this.credentials;
  }

  validateCredentials(credentials) {
    const { merchantId, apiSecret } = credentials || {};

    if (!merchantId || !apiSecret) {
      throw new Error('merchantId ve apiSecret alanları zorunludur');
    }
  }

  buildHeaders(credentials, mode = 'modern') {
    const username = mode === 'legacy'
      ? (credentials.apiKey || credentials.merchantId)
      : credentials.merchantId;

    return {
      Authorization: createBasicAuthHeader(username, credentials.apiSecret),
      'Content-Type': 'application/json',
      merchantId: String(credentials.merchantId),
      'User-Agent': credentials.apiKey || String(credentials.merchantId),
    };
  }

  async request(credentials, url, options = {}) {
    const modes = credentials.apiKey ? ['modern', 'legacy'] : ['modern'];
    let lastError = null;

    for (const mode of modes) {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.buildHeaders(credentials, mode),
          ...options.headers,
        },
      });

      const payload = await safeReadResponse(response);

      if (response.ok) {
        return payload;
      }

      const message = typeof payload === 'string'
        ? payload
        : payload?.message || payload?.error || `Hepsiburada API error: ${response.status}`;

      lastError = new Error(message);
      lastError.status = response.status;
      lastError.payload = payload;

      if (response.status !== 401) {
        throw lastError;
      }
    }

    throw lastError || new Error('Hepsiburada isteği başarısız');
  }

  async testConnection(credentialsInput) {
    try {
      const credentials = buildMarketplaceCredentials(credentialsInput);
      this.validateCredentials(credentials);

      const payload = await this.request(
        credentials,
        buildIssuesUrl({ status: 1, size: 1, page: 1 }),
        { method: 'GET' }
      );

      return {
        success: true,
        message: 'Hepsiburada bağlantısı başarılı',
        merchantId: credentials.merchantId,
        totalElements: payload?.totalElements ?? extractItems(payload).length,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Hepsiburada bağlantı testi başarısız',
      };
    }
  }

  async fetchIssueDetail(credentials, issueNumber) {
    const payload = await this.request(
      credentials,
      buildIssueDetailUrl(issueNumber),
      { method: 'GET' }
    );

    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return payload;
    }

    return null;
  }

  async fetchUnansweredQuestions(businessId, options = {}) {
    const credentials = await this.getCredentials(businessId);
    this.validateCredentials(credentials);

    const size = Math.min(Number(options.size) || 50, 200);
    const maxPages = Math.max(1, Number(options.maxPages) || 20);
    const includeDetails = options.includeDetails !== false;
    const questions = [];
    let page = Math.max(1, Number(options.page) || 1);
    let totalPages = page;

    while (page <= totalPages && page <= maxPages) {
      const payload = await this.request(
        credentials,
        buildIssuesUrl({
          status: options.status || 1,
          size,
          page,
          sortBy: options.sortBy ?? 1,
          desc: options.desc ?? true,
        }),
        { method: 'GET' }
      );

      const items = extractItems(payload);
      const totalFromPayload = Number(payload?.totalPages || payload?.pageCount || 0);
      totalPages = totalFromPayload > 0 ? totalFromPayload : page;

      for (const item of items) {
        const issueNumber = item.issueNumber || item.number || item.id;
        if (!issueNumber) continue;

        let normalized = normalizeQuestion(item);
        if (includeDetails) {
          try {
            const detail = await this.fetchIssueDetail(credentials, issueNumber);
            if (detail) {
              normalized = normalizeQuestion({ ...item, ...detail });
            }
          } catch (error) {
            // Listing payload is still enough to keep the question visible.
            console.warn(`Hepsiburada issue detail fetch failed for ${issueNumber}:`, error.message);
          }
        }

        questions.push(normalized);
      }

      page += 1;
    }

    return questions.filter((question) => question.externalId && question.questionText);
  }

  async getProductContext() {
    return null;
  }

  async postAnswer(businessId, issueNumber, answerText) {
    const credentials = await this.getCredentials(businessId);
    this.validateCredentials(credentials);

    const normalizedAnswer = truncateMarketplaceAnswer(answerText, 2000);
    if (normalizedAnswer.length < 10 || normalizedAnswer.length > 2000) {
      throw new Error('Hepsiburada cevabı 10 ile 2000 karakter arasında olmalıdır');
    }

    try {
      const payload = await this.request(
        credentials,
        buildIssueAnswerUrl(issueNumber),
        {
          method: 'POST',
          body: JSON.stringify({ content: normalizedAnswer }),
        }
      );

      return {
        success: true,
        answer: normalizedAnswer,
        payload,
      };
    } catch (error) {
      if (error.status !== 400) {
        throw error;
      }

      const payload = await this.request(
        credentials,
        buildIssueAnswerUrl(issueNumber),
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

  async reportIssue(businessId, issueNumber, reason) {
    const credentials = await this.getCredentials(businessId);
    this.validateCredentials(credentials);

    const normalizedReason = String(reason || '').trim();
    if (!normalizedReason) {
      throw new Error('Hepsiburada sorun bildirme metni zorunludur');
    }

    try {
      const payload = await this.request(
        credentials,
        buildIssueRejectUrl(issueNumber),
        {
          method: 'POST',
          body: JSON.stringify({ content: normalizedReason }),
        }
      );

      return { success: true, payload };
    } catch (error) {
      if (error.status !== 400) {
        throw error;
      }

      const payload = await this.request(
        credentials,
        buildIssueRejectUrl(issueNumber),
        {
          method: 'POST',
          body: JSON.stringify({ reason: normalizedReason }),
        }
      );

      return { success: true, payload };
    }
  }
}

export default HepsiburadaQaService;
