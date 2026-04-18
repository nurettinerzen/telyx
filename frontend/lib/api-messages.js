export function getCurrentLocale() {
  if (typeof window === 'undefined') {
    return 'tr';
  }

  const storedLocale = window.localStorage?.getItem('locale');
  if (storedLocale) {
    return storedLocale;
  }

  const htmlLang = document.documentElement.lang;
  if (htmlLang) {
    return htmlLang.split('-')[0];
  }

  return 'tr';
}

function getLocalizedField(payload, field, locale) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const localizedField = `${field}TR`;

  if (locale === 'tr') {
    return payload[localizedField] || payload[field] || '';
  }

  return payload[field] || payload[localizedField] || '';
}

export function getLocalizedApiMessage(payload, locale = getCurrentLocale(), fallback = '') {
  return getLocalizedField(payload, 'message', locale) || fallback;
}

export function getLocalizedApiWarning(payload, locale = getCurrentLocale(), fallback = '') {
  return getLocalizedField(payload, 'warning', locale) || fallback;
}

export function getLocalizedApiErrorMessage(error, fallback = '', locale = getCurrentLocale()) {
  const payload = error?.response?.data;

  return getLocalizedField(payload, 'error', locale)
    || getLocalizedField(payload, 'message', locale)
    || error?.message
    || fallback;
}
