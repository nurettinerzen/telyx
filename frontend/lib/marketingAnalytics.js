function getBrowserContext() {
  if (typeof window === 'undefined') return null;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  return window;
}

function sanitizeParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
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

export function trackMarketingEvent(eventName, params = {}) {
  const browser = getBrowserContext();
  if (!browser || !eventName) return;

  const payload = sanitizeParams({
    ...getDefaultParams(),
    ...params,
  });

  browser.gtag('event', eventName, payload);
}

export function trackCtaClick({
  ctaName,
  ctaLocation,
  destination,
  locale,
  ...rest
} = {}) {
  trackMarketingEvent('cta_click', {
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

  trackMarketingEvent('cta_click', {
    cta_name: `${planId || 'unknown'}_plan_click`,
    cta_location: 'pricing_plans',
    ...payload,
  });

  trackMarketingEvent('pricing_plan_click', payload);
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

  trackMarketingEvent('generate_lead', payload);
  trackMarketingEvent(`${formName}_submit_success`, payload);
}

export function trackContactClick({
  contactMethod,
  contactValue,
  locale,
  ...rest
} = {}) {
  trackMarketingEvent('contact_click', {
    contact_method: contactMethod,
    contact_value: contactValue,
    locale,
    ...rest,
  });
}
