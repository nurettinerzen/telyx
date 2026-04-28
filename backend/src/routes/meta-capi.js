import express from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const META_GRAPH_VERSION =
  process.env.META_GRAPH_API_VERSION ||
  process.env.META_GRAPH_VERSION ||
  'v18.0';
const META_PIXEL_ID =
  process.env.META_PIXEL_ID ||
  process.env.NEXT_PUBLIC_META_PIXEL_ID ||
  '';
const META_CAPI_ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN || '';
const META_TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE || '';

const STANDARD_EVENT_NAMES = new Set([
  'PageView',
  'ViewContent',
  'Lead',
  'CompleteRegistration',
  'StartTrial',
  'Subscribe',
  'Purchase',
  'AddToCart',
  'InitiateCheckout',
  'AddPaymentInfo',
  'Contact',
]);

const INTERNAL_TO_META_EVENT = {
  pricing_view: 'ViewContent',
  signup_page_view: 'ViewContent',
  demo_request: 'Lead',
  signup_complete: 'CompleteRegistration',
  trial_start: 'StartTrial',
};

const capiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many CAPI events. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
});

function sanitizeString(value) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized ? normalized : undefined;
}

function hashSha256(value) {
  const sanitized = sanitizeString(value);
  if (!sanitized) return undefined;
  return crypto.createHash('sha256').update(sanitized.toLowerCase()).digest('hex');
}

function clientIpFromRequest(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) {
    return xff.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || undefined;
}

function buildUserData({ fbp, fbc, email, phone, externalId, req }) {
  const userData = {};
  const fbpVal = sanitizeString(fbp);
  if (fbpVal) userData.fbp = fbpVal;
  const fbcVal = sanitizeString(fbc);
  if (fbcVal) userData.fbc = fbcVal;
  const emailHash = hashSha256(email);
  if (emailHash) userData.em = [emailHash];
  const phoneHash = hashSha256(phone);
  if (phoneHash) userData.ph = [phoneHash];
  const extIdHash = hashSha256(externalId);
  if (extIdHash) userData.external_id = [extIdHash];
  const ip = clientIpFromRequest(req);
  if (ip) userData.client_ip_address = ip;
  const ua = sanitizeString(req.headers['user-agent']);
  if (ua) userData.client_user_agent = ua;
  return userData;
}

function resolveMetaEventName(input) {
  const trimmed = sanitizeString(input);
  if (!trimmed) return null;
  if (STANDARD_EVENT_NAMES.has(trimmed)) return trimmed;
  if (Object.prototype.hasOwnProperty.call(INTERNAL_TO_META_EVENT, trimmed)) {
    return INTERNAL_TO_META_EVENT[trimmed];
  }
  return null;
}

function sanitizeCustomData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (val === undefined || val === null || val === '') continue;
    out[key] = val;
  }
  return out;
}

router.post('/events', capiLimiter, async (req, res) => {
  if (!META_CAPI_ACCESS_TOKEN || !META_PIXEL_ID) {
    return res.status(503).json({
      error: 'Meta Conversions API is not configured.',
      code: 'CAPI_NOT_CONFIGURED',
    });
  }

  const body = req.body || {};
  const metaEventName = resolveMetaEventName(body.eventName);
  if (!metaEventName) {
    return res.status(400).json({
      error: 'Unsupported event name for Meta Conversions API.',
      code: 'UNSUPPORTED_EVENT',
    });
  }

  const eventId = sanitizeString(body.eventId) || crypto.randomUUID();
  const eventTimeNum = Number(body.eventTime);
  const eventTime = Number.isFinite(eventTimeNum) && eventTimeNum > 0
    ? Math.floor(eventTimeNum)
    : Math.floor(Date.now() / 1000);
  const eventSourceUrl = sanitizeString(body.eventSourceUrl) || sanitizeString(body.pageUrl);

  const customData = sanitizeCustomData(body.customData || body.params);

  const userData = buildUserData({
    fbp: body.fbp,
    fbc: body.fbc,
    email: body.email || req.user?.email,
    phone: body.phone || req.user?.phone,
    externalId: body.externalId || req.user?.id,
    req,
  });

  const eventPayload = {
    event_name: metaEventName,
    event_time: eventTime,
    event_id: eventId,
    action_source: 'website',
    user_data: userData,
    custom_data: customData,
  };
  if (eventSourceUrl) eventPayload.event_source_url = eventSourceUrl;

  const apiPayload = {
    data: [eventPayload],
    access_token: META_CAPI_ACCESS_TOKEN,
  };
  if (META_TEST_EVENT_CODE) {
    apiPayload.test_event_code = META_TEST_EVENT_CODE;
  }

  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(META_PIXEL_ID)}/events`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(apiPayload),
    });
    const text = await response.text();
    const parsed = (() => { try { return JSON.parse(text); } catch (_) { return null; } })();
    if (!response.ok) {
      console.error('[meta-capi] forward failed', {
        status: response.status,
        eventName: metaEventName,
        eventId,
        body: text.slice(0, 400),
      });
      return res.status(502).json({
        error: 'Meta Conversions API forward failed.',
        code: 'CAPI_FORWARD_FAILED',
        upstreamStatus: response.status,
        upstreamError: parsed?.error?.message || undefined,
      });
    }
    return res.status(202).json({
      success: true,
      eventId,
      metaEventName,
      eventsReceived: parsed?.events_received,
      fbtraceId: parsed?.fbtrace_id,
    });
  } catch (error) {
    console.error('[meta-capi] forward error', error);
    return res.status(502).json({
      error: 'Meta Conversions API forward error.',
      code: 'CAPI_FORWARD_ERROR',
    });
  }
});

export default router;
