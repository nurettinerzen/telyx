const CAPI_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  '';
const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ||
  'G-08CRCMG37C';
const ATTRIBUTION_STORAGE_KEY = 'telyx_marketing_attribution_v1';
const ANONYMOUS_ID_STORAGE_KEY = 'telyx_marketing_anonymous_id_v1';
const SESSION_ID_STORAGE_KEY = 'telyx_marketing_session_id_v1';
const SESSION_STARTED_AT_STORAGE_KEY = 'telyx_marketing_session_started_at_v1';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const BLOCKED_ANALYTICS_KEYS = new Set([
  'email',
  'full_name',
  'fullname',
  'fullName',
  'phone',
  'phone_number',
  'password',
  'business_name',
  'businessName',
]);
const CANONICAL_EVENT_NAMES = {
  form_start: 'signup_start',
  form_submit: 'signup_submit',
  signup_success: 'signup_complete',
  complete_registration: 'signup_complete',
  start_trial: 'trial_start',
};

function getBrowserContext() {
  if (typeof window === 'undefined') return null;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  return window;
}

function getStorage(kind) {
  if (typeof window === 'undefined') return null;

  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch (_error) {
    return null;
  }
}

function sanitizeParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([key, value]) => !BLOCKED_ANALYTICS_KEYS.has(key) && value !== undefined && value !== null && value !== ''
    )
  );
}

function getDefaultParams() {
  if (typeof window === 'undefined') return {};

  return {
    page_location: window.location.href,
    page_path: window.location.pathname,
    page_title: typeof document !== 'undefined' ? document.title : undefined,
  };
}

function parseCurrentAttribution() {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(window.location.search);
  return sanitizeParams({
    source: params.get('utm_source'),
    medium: params.get('utm_medium'),
    campaign_name: params.get('utm_campaign') || params.get('campaign_name') || params.get('campaign'),
    campaign_id: params.get('utm_id') || params.get('campaign_id'),
    campaign_draft_id: params.get('co_campaign_draft_id') || params.get('campaign_draft_id'),
    content: params.get('utm_content'),
    term: params.get('utm_term'),
    fbclid: params.get('fbclid'),
    gclid: params.get('gclid'),
  });
}

function getPersistedAttribution() {
  const storage = getStorage('local');
  if (!storage) return {};

  try {
    return JSON.parse(storage.getItem(ATTRIBUTION_STORAGE_KEY) || '{}');
  } catch (_error) {
    return {};
  }
}

function persistAttribution() {
  const storage = getStorage('local');
  if (!storage) return getPersistedAttribution();

  const persisted = getPersistedAttribution();
  const current = parseCurrentAttribution();
  const merged = sanitizeParams({
    ...persisted,
    ...current,
    landing_path: persisted.landing_path || (typeof window !== 'undefined' ? window.location.pathname : undefined),
    landing_url: persisted.landing_url || (typeof window !== 'undefined' ? window.location.href : undefined),
  });

  storage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

function getAttribution() {
  return sanitizeParams({
    ...persistAttribution(),
    ...parseCurrentAttribution(),
  });
}

function normalizeEventName(eventName) {
  return CANONICAL_EVENT_NAMES[eventName] || eventName;
}

function readCookie(name) {
  if (typeof document === 'undefined' || !document.cookie) return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function generateEventId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function getOrCreateAnonymousId() {
  const storage = getStorage('local');
  if (!storage) return undefined;

  try {
    const existing = storage.getItem(ANONYMOUS_ID_STORAGE_KEY);
    if (existing) return existing;
    const next = generateEventId();
    storage.setItem(ANONYMOUS_ID_STORAGE_KEY, next);
    return next;
  } catch (_error) {
    return undefined;
  }
}

function getOrCreateSessionId() {
  const storage = getStorage('session');
  if (!storage) return undefined;

  try {
    const now = Date.now();
    const existing = storage.getItem(SESSION_ID_STORAGE_KEY);
    const startedAt = Number(storage.getItem(SESSION_STARTED_AT_STORAGE_KEY) || 0);

    if (existing && Number.isFinite(startedAt) && now - startedAt < SESSION_TIMEOUT_MS) {
      return existing;
    }

    const next = generateEventId();
    storage.setItem(SESSION_ID_STORAGE_KEY, next);
    storage.setItem(SESSION_STARTED_AT_STORAGE_KEY, String(now));
    return next;
  } catch (_error) {
    return undefined;
  }
}

function getGaPayload(payload = {}) {
  return GA_MEASUREMENT_ID
    ? { ...payload, send_to: GA_MEASUREMENT_ID }
    : payload;
}

function getPixelEventConfig(eventName, payload) {
  switch (eventName) {
    case 'page_view':
      return { type: 'standard', name: 'PageView', params: {
        page_type: payload.page_type,
        campaign_name: payload.campaign_name,
      } };
    case 'demo_request':
      return { type: 'standard', name: 'Lead', params: {
        content_name: payload.form_name || 'demo_request',
        status: 'submitted',
        campaign_name: payload.campaign_name,
      } };
    case 'signup_complete':
      return { type: 'standard', name: 'CompleteRegistration', params: {
        content_name: 'signup',
        status: 'success',
        campaign_name: payload.campaign_name,
      } };
    case 'signup_page_view':
      return { type: 'standard', name: 'ViewContent', params: {
        content_name: 'signup',
        content_category: 'signup_page',
        campaign_name: payload.campaign_name,
      } };
    case 'pricing_view':
      return { type: 'standard', name: 'ViewContent', params: {
        content_name: 'pricing',
        content_category: 'pricing_page',
        content_type: 'product_group',
        campaign_name: payload.campaign_name,
      } };
    case 'trial_start':
      return { type: 'standard', name: 'StartTrial', params: {
        content_name: payload.content_name || 'free_trial',
        predicted_ltv: payload.predicted_ltv,
        value: payload.value,
        currency: payload.currency || 'TRY',
        campaign_name: payload.campaign_name,
      } };
    case 'signup_submit':
      return { type: 'custom', name: 'SignupSubmit', params: payload };
    case 'signup_start':
      return { type: 'custom', name: 'SignupStart', params: payload };
    case 'cta_click':
      return { type: 'custom', name: 'CtaClick', params: payload };
    default:
      return null;
  }
}

function getGaAliasEvents(eventName, payload) {
  switch (eventName) {
    case 'demo_request':
      return [{
        name: 'generate_lead',
        params: {
          ...payload,
          lead_source: payload.lead_type || payload.form_name || 'demo_request',
        },
      }];
    case 'signup_complete':
      return [{
        name: 'sign_up',
        params: {
          ...payload,
          method: payload.method || 'email',
        },
      }];
    default:
      return [];
  }
}

function fireMetaPixel(pixelConfig, eventId) {
  const browser = getBrowserContext();
  if (!browser || typeof browser.fbq !== 'function') return;
  if (!pixelConfig) return;

  const sanitized = sanitizeParams(pixelConfig.params);
  const opts = eventId ? { eventID: eventId } : undefined;

  if (pixelConfig.type === 'standard') {
    browser.fbq('track', pixelConfig.name, sanitized, opts);
  } else {
    browser.fbq('trackCustom', pixelConfig.name, sanitized, opts);
  }
}

function postToMarketingAnalytics(eventName, payload, eventId) {
  if (!CAPI_BASE_URL || typeof fetch === 'undefined') return;

  const endpoint = `${CAPI_BASE_URL.replace(/\/$/, '')}/api/analytics/marketing-event`;
  const properties = sanitizeParams({
    ...payload,
    event_id: eventId,
  });

  const body = {
    eventName,
    eventId,
    sessionId: getOrCreateSessionId(),
    anonymousId: getOrCreateAnonymousId(),
    pageUrl: payload.page_location,
    pagePath: payload.page_path,
    referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
    source: payload.source,
    medium: payload.medium,
    campaignName: payload.campaign_name,
    campaignDraftId: payload.campaign_draft_id,
    properties,
    occurredAt: new Date().toISOString(),
  };

  const serialized = JSON.stringify(sanitizeParams(body));

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const sent = navigator.sendBeacon(
        endpoint,
        new Blob([serialized], { type: 'application/json' })
      );
      if (sent) return;
    }
  } catch (_error) {
    // Fall back to fetch below.
  }

  void fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: serialized,
    keepalive: true,
    credentials: 'include',
  }).catch(() => {
    // Best-effort first-party analytics relay.
  });
}

function postToCapi(eventName, payload, eventId, pixelConfig, userData) {
  if (!CAPI_BASE_URL || typeof fetch === 'undefined') return;
  if (!pixelConfig || pixelConfig.type !== 'standard') return;

  const endpoint = `${CAPI_BASE_URL.replace(/\/$/, '')}/api/meta/events`;
  const customData = sanitizeParams(pixelConfig.params);

  const body = {
    eventName,
    eventId,
    eventTime: Math.floor(Date.now() / 1000),
    eventSourceUrl: payload.page_location,
    pageUrl: payload.page_location,
    customData,
    fbp: readCookie('_fbp'),
    fbc: readCookie('_fbc'),
    email: userData?.email,
    phone: userData?.phone,
    externalId: userData?.externalId,
  };

  void fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    keepalive: true,
    credentials: 'include',
  }).catch(() => {
    // Best-effort CAPI relay. Server-side dedup handled by Meta via eventId.
  });
}

function emitEvent(eventName, params = {}, options = {}) {
  const browser = getBrowserContext();
  if (!browser || !eventName) return;
  const normalizedEventName = normalizeEventName(eventName);
  const eventId = options.eventId || generateEventId();

  const attribution = getAttribution();
  const payload = sanitizeParams({
    ...getDefaultParams(),
    ...attribution,
    ...params,
  });

  const pixelConfig = getPixelEventConfig(normalizedEventName, payload);

  if (options.gtag !== false) {
    browser.gtag('event', normalizedEventName, getGaPayload(payload));

    for (const alias of getGaAliasEvents(normalizedEventName, payload)) {
      browser.gtag('event', alias.name, getGaPayload(alias.params));
    }
  }

  if (options.fbq !== false) {
    fireMetaPixel(pixelConfig, eventId);
  }

  if (options.capi !== false) {
    postToCapi(normalizedEventName, payload, eventId, pixelConfig, options.userData);
  }

  if (options.firstParty !== false) {
    postToMarketingAnalytics(normalizedEventName, payload, eventId);
  }
}

export function trackMarketingEvent(eventName, params = {}, options = {}) {
  emitEvent(eventName, params, options);
}

export function trackPageView({ pageType, locale, ...rest } = {}) {
  // PageView is already handled globally by GTM and Meta Pixel.
  // Keep GA/Pixel quiet here, but relay the page view to first-party campaign analysis.
  getAttribution();
  emitEvent(
    'page_view',
    {
      page_type: pageType,
      locale,
      ...rest,
    },
    { gtag: false, fbq: false, capi: false }
  );
}

export function trackScrollMilestone({ pageType, milestone = '50', locale, ...rest } = {}) {
  const normalizedMilestone = String(milestone);
  const eventName = ['25', '50', '75', '100'].includes(normalizedMilestone)
    ? `scroll_${normalizedMilestone}`
    : 'scroll';

  emitEvent(
    eventName,
    {
      page_type: pageType,
      milestone: normalizedMilestone,
      locale,
      ...rest,
    },
    { fbq: false }
  );
}

export function createScrollDepthTracker({
  pageType,
  locale,
  thresholds = [25, 50, 75, 100],
  ...rest
} = {}) {
  const fired = new Set();
  const normalizedThresholds = thresholds
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 100)
    .sort((left, right) => left - right);

  return function trackCurrentScrollDepth() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    const viewportHeight = window.innerHeight || 0;
    const documentHeight = Math.max(
      document.body?.scrollHeight || 0,
      document.documentElement.scrollHeight || 0,
      1
    );
    const progress = ((scrollTop + viewportHeight) / documentHeight) * 100;

    for (const threshold of normalizedThresholds) {
      if (progress >= threshold && !fired.has(threshold)) {
        fired.add(threshold);
        trackScrollMilestone({
          pageType,
          milestone: String(threshold),
          locale,
          ...rest,
        });
      }
    }
  };
}

export function trackSignupPageView({ locale, ...rest } = {}) {
  emitEvent('signup_page_view', {
    page_type: 'signup',
    locale,
    ...rest,
  });
}

export function trackPricingView({ locale, ...rest } = {}) {
  emitEvent('pricing_view', {
    page_type: 'pricing',
    locale,
    ...rest,
  });
}

export function trackFormStart({ formName, locale, ...rest } = {}) {
  emitEvent('signup_start', {
    form_name: formName,
    locale,
    ...rest,
  });
}

export function trackFormSubmit({ formName, locale, ...rest } = {}) {
  emitEvent('signup_submit', {
    form_name: formName,
    locale,
    ...rest,
  });
}

export function trackSignupSuccess({ formName, locale, email, phone, externalId, ...rest } = {}) {
  emitEvent('signup_complete', {
    form_name: formName,
    locale,
    ...rest,
  }, { userData: { email, phone, externalId } });
}

export function trackTrialStart({ source, locale, email, phone, externalId, ...rest } = {}) {
  emitEvent('trial_start', {
    source,
    locale,
    ...rest,
  }, { userData: { email, phone, externalId } });
}

export function trackCtaClick({
  ctaName,
  ctaLocation,
  destination,
  locale,
  ...rest
} = {}) {
  emitEvent('cta_click', {
    cta_name: ctaName,
    cta_location: ctaLocation,
    destination,
    locale,
    ...rest,
  });
}

export function trackPricingPlanClick({
  planId,
  planName,
  destination,
  locale,
  ...rest
} = {}) {
  const payload = {
    plan_id: planId,
    plan_name: planName,
    destination,
    locale,
    ...rest,
  };

  emitEvent('cta_click', {
    cta_name: `${planId || 'unknown'}_plan_click`,
    cta_location: 'pricing_plans',
    ...payload,
  });

  emitEvent('pricing_plan_click', payload);
}

export function trackLeadGenerated({
  leadType,
  formName,
  locale,
  ...rest
} = {}) {
  const payload = {
    lead_type: leadType,
    form_name: formName,
    locale,
    ...rest,
  };

  emitEvent('generate_lead', payload);
}

export function trackDemoRequest({
  formName,
  leadType = 'demo_request',
  locale,
  email,
  phone,
  externalId,
  ...rest
} = {}) {
  emitEvent('demo_request', {
    form_name: formName,
    lead_type: leadType,
    locale,
    ...rest,
  }, { userData: { email, phone, externalId } });
}

export function trackContactClick({
  contactMethod,
  contactValue,
  locale,
  ...rest
} = {}) {
  emitEvent('contact_click', {
    contact_method: contactMethod,
    contact_value: contactValue,
    locale,
    ...rest,
  });
}

export function trackFormError({
  formName,
  errorType,
  locale,
  ...rest
} = {}) {
  emitEvent('form_error', {
    form_name: formName,
    error_type: errorType,
    locale,
    ...rest,
  });
}
