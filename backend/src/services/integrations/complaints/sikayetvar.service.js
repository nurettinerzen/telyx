import prisma from '../../../prismaClient.js';
import {
  buildSikayetvarCredentials,
  coerceComplaintDate,
  COMPLAINT_PLATFORM,
  decryptSikayetvarCredentials,
  truncateComplaintReply,
} from '../../complaints/sikayetvarShared.js';

const SIKAYETVAR_API_BASE_URL = process.env.SIKAYETVAR_API_BASE_URL || 'https://api.sikayetplus.com';
const COMPANY_DETAIL_PATH = '/v2/company-detail';
const COMPLAINTS_PATH = '/v2/complaints';
const COMPLAINT_ANSWERS_PATH = '/v2/complaints/answers';
const REST_TESTING_PATH = '/v2/rest-testing';

function buildAbsoluteComplaintUrl(complaintUrl) {
  if (!complaintUrl) return null;
  if (String(complaintUrl).startsWith('http')) return complaintUrl;
  return `https://www.sikayetvar.com/${String(complaintUrl).replace(/^\/+/, '')}`;
}

function createHeaders(credentials, extraHeaders = {}) {
  return {
    'Content-Type': 'application/json',
    'X-Auth-Key': String(credentials.apiKey),
    ...extraHeaders,
  };
}

function buildUrl(pathname, query = {}) {
  const url = new URL(pathname, SIKAYETVAR_API_BASE_URL);

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

function extractIdentity(member = {}, identityType) {
  const identities = Array.isArray(member.identities) ? member.identities : [];
  const match = identities.find((item) => String(item?.identityType || '').toLowerCase() === identityType);
  return match?.identityValue || null;
}

function normalizeComplaint(item = {}) {
  return {
    platform: COMPLAINT_PLATFORM.SIKAYETVAR,
    externalId: String(item.id),
    title: String(item.content?.title || item.title || 'Sikayet').trim(),
    complaintText: String(item.content?.body || item.body || '').trim(),
    customerName: item.member?.name || null,
    customerEmail: extractIdentity(item.member, 'email'),
    customerPhone: extractIdentity(item.member, 'phone'),
    customerCity: item.member?.city?.name || null,
    complaintUrl: buildAbsoluteComplaintUrl(item.complaintUrl),
    platformStatus: item.resolveStatus || item.stage || null,
    sourceCreatedAt: coerceComplaintDate(item.complainTime),
    answeredAt: coerceComplaintDate(item.answerTime),
    closedAt: coerceComplaintDate(item.closeTime),
    published: typeof item.hidden === 'boolean' ? !item.hidden : null,
    answered: Boolean(item.answered),
    closed: Boolean(item.closed),
    companyName: item.company?.name || null,
    companyId: item.company?.id ? String(item.company.id) : null,
    raw: item,
  };
}

class SikayetvarService {
  constructor(credentials = null) {
    this.credentials = credentials ? buildSikayetvarCredentials(credentials) : null;
  }

  static async hasIntegration(businessId) {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId,
        type: COMPLAINT_PLATFORM.SIKAYETVAR,
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
        type: COMPLAINT_PLATFORM.SIKAYETVAR,
        isActive: true,
      },
    });

    if (!integration) {
      throw new Error('Sikayetvar entegrasyonu yapılandırılmamış');
    }

    this.credentials = decryptSikayetvarCredentials(integration.credentials);
    return this.credentials;
  }

  validateCredentials(credentials) {
    if (!credentials?.apiKey) {
      throw new Error('Sikayetvar API token gerekli');
    }
  }

  async request(credentials, url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: createHeaders(credentials, options.headers),
    });

    const payload = await safeReadResponse(response);

    if (response.ok) {
      return { payload, response };
    }

    const message = typeof payload === 'string'
      ? payload
      : payload?.message || payload?.error || `Sikayetvar API error: ${response.status}`;

    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  async testConnection(credentialsInput) {
    try {
      const credentials = buildSikayetvarCredentials(credentialsInput);
      this.validateCredentials(credentials);

      const { payload } = await this.request(
        credentials,
        buildUrl(COMPANY_DETAIL_PATH),
        { method: 'GET' }
      );

      return {
        success: true,
        message: 'Sikayetvar bağlantısı başarılı',
        companyId: payload?.id ? String(payload.id) : null,
        companyName: payload?.name || null,
        companyUrl: payload?.url || null,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Sikayetvar bağlantı testi başarısız',
      };
    }
  }

  async fetchCompanyDetail(businessId) {
    const credentials = await this.getCredentials(businessId);
    this.validateCredentials(credentials);

    const { payload } = await this.request(
      credentials,
      buildUrl(COMPANY_DETAIL_PATH),
      { method: 'GET' }
    );

    return payload && typeof payload === 'object' ? payload : null;
  }

  async fetchComplaintAnswers(businessId, complaintIds = []) {
    if (!Array.isArray(complaintIds) || complaintIds.length === 0) {
      return [];
    }

    const credentials = await this.getCredentials(businessId);
    this.validateCredentials(credentials);

    const { payload } = await this.request(
      credentials,
      buildUrl(COMPLAINT_ANSWERS_PATH),
      {
        method: 'POST',
        body: JSON.stringify({
          ids: [],
          complaintIds,
          fromDate: null,
          toDate: null,
          from: 'all',
          publishStatuses: [2, 3],
          thanked: false,
        }),
      }
    );

    return Array.isArray(payload) ? payload : [];
  }

  async fetchOpenComplaints(businessId, options = {}) {
    const credentials = await this.getCredentials(businessId);
    this.validateCredentials(credentials);

    const size = Math.min(Number(options.size) || 50, 100);
    const maxPages = Math.max(1, Number(options.maxPages) || 20);
    const complaints = [];
    let page = Number.isFinite(Number(options.page)) ? Number(options.page) : 0;

    for (let attempt = 0; attempt < maxPages; attempt += 1) {
      const { payload } = await this.request(
        credentials,
        buildUrl(COMPLAINTS_PATH, { page, size }),
        {
          method: 'POST',
          body: JSON.stringify({
            filters: {
              ids: [],
              memberIds: [],
              assignees: [],
              companyTags: [],
              keywords: [],
              resolveStatuses: [],
              publishStatuses: [2, 3, 5],
              answered: false,
              closed: false,
              surveyAnswered: null,
              thanked: null,
              thankBeforeDate: null,
              thankAfterDate: null,
              closingBeforeDate: null,
              closingAfterDate: null,
              complainingBeforeDate: null,
              complainingAfterDate: null,
              deliveryBeforeDate: null,
              deliveryAfterDate: null,
              minViewCount: null,
            },
            projections: ['ALL'],
            showTotalCount: true,
          }),
        }
      );

      const batch = Array.isArray(payload) ? payload.map(normalizeComplaint) : [];

      if (batch.length === 0) {
        if (attempt === 0 && page === 0) {
          page = 1;
          continue;
        }
        break;
      }

      complaints.push(...batch);

      if (batch.length < size) {
        break;
      }

      page += 1;
    }

    const answers = await this.fetchComplaintAnswers(
      businessId,
      complaints.map((item) => Number(item.externalId)).filter(Number.isFinite)
    );

    const answersByComplaintId = new Map();
    for (const answer of answers) {
      const complaintId = answer?.complaint?.id;
      if (!complaintId) continue;

      const bucket = answersByComplaintId.get(String(complaintId)) || [];
      bucket.push(answer);
      answersByComplaintId.set(String(complaintId), bucket);
    }

    return complaints.map((complaint) => ({
      ...complaint,
      messages: answersByComplaintId.get(String(complaint.externalId)) || [],
    }));
  }

  async postAnswer(businessId, complaintId, message, attachments = []) {
    const credentials = await this.getCredentials(businessId);
    this.validateCredentials(credentials);

    const normalizedMessage = truncateComplaintReply(message, 5000);
    if (!normalizedMessage) {
      throw new Error('Sikayetvar cevabı boş olamaz');
    }

    const body = {
      message: normalizedMessage,
    };

    if (Array.isArray(attachments) && attachments.length > 0) {
      body.attachments = attachments;
    }

    const { response } = await this.request(
      credentials,
      buildUrl(`${COMPLAINTS_PATH}/${encodeURIComponent(String(complaintId))}/answers`),
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );

    return {
      success: true,
      complaintAnswerId: response.headers.get('ComplaintAnswerID') || response.headers.get('complaintanswerid'),
      complaintId: String(complaintId),
    };
  }

  async simulateRestEvent(businessId, payload = {}) {
    const credentials = await this.getCredentials(businessId);
    this.validateCredentials(credentials);

    const result = await this.request(
      credentials,
      buildUrl(REST_TESTING_PATH),
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );

    return result.payload;
  }
}

export default SikayetvarService;
