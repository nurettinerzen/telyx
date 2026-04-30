import crypto from 'crypto';

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

export const STANDARD_EVENT_NAMES = new Set([
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

export const INTERNAL_TO_META_EVENT = {
  page_view: 'PageView',
  pricing_view: 'ViewContent',
  signup_page_view: 'ViewContent',
  demo_request: 'Lead',
  signup_complete: 'CompleteRegistration',
  trial_start: 'StartTrial',
  subscribe: 'Subscribe',
};

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

function sanitizeCustomData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (val === undefined || val === null || val === '') continue;
    out[key] = val;
  }
  return out;
}

export function resolveMetaEventName(input) {
  const trimmed = sanitizeString(input);
  if (!trimmed) return null;
  if (STANDARD_EVENT_NAMES.has(trimmed)) return trimmed;
  if (Object.prototype.hasOwnProperty.call(INTERNAL_TO_META_EVENT, trimmed)) {
    return INTERNAL_TO_META_EVENT[trimmed];
  }
  return null;
}

export function isCapiConfigured() {
  return Boolean(META_CAPI_ACCESS_TOKEN && META_PIXEL_ID);
}

function buildUserData({ fbp, fbc, email, phone, externalId, clientIp, clientUserAgent }) {
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
  const ip = sanitizeString(clientIp);
  if (ip) userData.client_ip_address = ip;
  const ua = sanitizeString(clientUserAgent);
  if (ua) userData.client_user_agent = ua;
  return userData;
}

/**
 * Send a single event to Meta Conversions API.
 * Resolves with { success: true, eventId, fbtraceId, eventsReceived } on 2xx,
 * or { success: false, code, upstreamStatus, upstreamError } on failure.
 * Never throws — callers can fire-and-forget without error handling boilerplate.
 */
export async function sendMetaCapiEvent({
  eventName,
  eventId,
  eventTime,
  eventSourceUrl,
  customData,
  fbp,
  fbc,
  email,
  phone,
  externalId,
  clientIp,
  clientUserAgent,
}) {
  if (!isCapiConfigured()) {
    return { success: false, code: 'CAPI_NOT_CONFIGURED' };
  }

  const metaEventName = resolveMetaEventName(eventName);
  if (!metaEventName) {
    return { success: false, code: 'UNSUPPORTED_EVENT' };
  }

  const resolvedEventId = sanitizeString(eventId) || crypto.randomUUID();
  const eventTimeNum = Number(eventTime);
  const resolvedEventTime = Number.isFinite(eventTimeNum) && eventTimeNum > 0
    ? Math.floor(eventTimeNum)
    : Math.floor(Date.now() / 1000);
  const resolvedSourceUrl = sanitizeString(eventSourceUrl);

  const userData = buildUserData({
    fbp,
    fbc,
    email,
    phone,
    externalId,
    clientIp,
    clientUserAgent,
  });

  const eventPayload = {
    event_name: metaEventName,
    event_time: resolvedEventTime,
    event_id: resolvedEventId,
    action_source: 'website',
    user_data: userData,
    custom_data: sanitizeCustomData(customData),
  };
  if (resolvedSourceUrl) eventPayload.event_source_url = resolvedSourceUrl;

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiPayload),
    });
    const text = await response.text();
    const parsed = (() => { try { return JSON.parse(text); } catch (_) { return null; } })();

    if (!response.ok) {
      console.error('[meta-capi] forward failed', {
        status: response.status,
        eventName: metaEventName,
        eventId: resolvedEventId,
        body: text.slice(0, 400),
      });
      return {
        success: false,
        code: 'CAPI_FORWARD_FAILED',
        upstreamStatus: response.status,
        upstreamError: parsed?.error?.message,
        eventId: resolvedEventId,
        metaEventName,
      };
    }
    return {
      success: true,
      eventId: resolvedEventId,
      metaEventName,
      eventsReceived: parsed?.events_received,
      fbtraceId: parsed?.fbtrace_id,
    };
  } catch (error) {
    console.error('[meta-capi] forward error', error);
    return {
      success: false,
      code: 'CAPI_FORWARD_ERROR',
      eventId: resolvedEventId,
      metaEventName,
    };
  }
}
