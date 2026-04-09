/**
 * General Utility Functions
 * Formatting, validation, and helper functions
 */

import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes (already exists in most projects)
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Format phone number to E.164 or display format
 * @param {string} phone - Phone number
 * @param {string} format - 'e164' or 'display'
 */
export function formatPhone(phone, format = 'display') {
  if (!phone) return '';
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  if (format === 'e164') {
    // E.164 format: +1234567890
    return `+${digits}`;
  }
  
  // Turkish display formats
  if (digits.length === 12 && digits.startsWith('90')) {
    const local = `0${digits.slice(2)}`;

    if (local.startsWith('0850') && local.length === 11) {
      return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
    }

    if (local.length === 11) {
      return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7, 9)} ${local.slice(9)}`;
    }
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    if (digits.startsWith('0850')) {
      return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
    }

    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
  }

  // Display format: +1 (234) 567-8900
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  } else if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  
  return phone;
}

/**
 * Format duration in seconds to human-readable format
 * @param {number} seconds - Duration in seconds
 */
export function formatDuration(seconds) {
  if (!seconds || seconds < 0 || !isFinite(seconds) || isNaN(seconds)) return '0s';

  const totalSecs = Math.floor(seconds);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  } else {
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }
}

/**
 * Map locale code to Intl locale
 */
export function getIntlLocale(locale) {
  const localeMap = {
    'tr': 'tr-TR',
    'en': 'en-US',
    'de': 'de-DE',
    'fr': 'fr-FR',
    'es': 'es-ES',
    'it': 'it-IT',
    'pt': 'pt-PT',
    'nl': 'nl-NL',
    'ru': 'ru-RU',
    'ar': 'ar-SA',
    'ja': 'ja-JP',
    'ko': 'ko-KR',
    'zh': 'zh-CN',
    'hi': 'hi-IN',
    'pl': 'pl-PL',
    'sv': 'sv-SE',
  };
  return localeMap[locale] || 'en-US';
}

/**
 * Format date to various formats
 * @param {string|Date} date - Date to format
 * @param {string} format - 'short', 'long', 'time', 'relative', 'chart'
 * @param {string} locale - Locale code (tr, en, etc.)
 * @param {Function} [t] - Optional translation function from useLanguage() (used for 'relative' format)
 */
export function formatDate(date, format = 'short', locale = 'tr', t) {
  if (!date) return '';

  const d = new Date(date);

  if (isNaN(d.getTime())) return 'Invalid Date';

  const intlLocale = getIntlLocale(locale);

  if (format === 'short') {
    // 15 Oca 2025 (TR) or Jan 15, 2025 (EN)
    return d.toLocaleDateString(intlLocale, { month: 'short', day: 'numeric', year: 'numeric' });
  } else if (format === 'long') {
    // 15 Ocak 2025 15:45 (TR) or January 15, 2025 at 3:45 PM (EN)
    return d.toLocaleDateString(intlLocale, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } else if (format === 'time') {
    // 15:45 (TR) or 3:45 PM (EN)
    return d.toLocaleTimeString(intlLocale, { hour: 'numeric', minute: '2-digit' });
  } else if (format === 'chart') {
    // Short format for chart axis: 15 Ara (TR) or Dec 15 (EN)
    return d.toLocaleDateString(intlLocale, { month: 'short', day: 'numeric' });
  } else if (format === 'relative') {
    // 2 hours ago, 3 days ago, etc.
    return getRelativeTime(d, locale, t);
  }

  return d.toLocaleDateString(intlLocale);
}

/**
 * Get relative time (e.g., "2 hours ago")
 * @param {Date} date - The date to compare against now
 * @param {string} locale - Locale code for fallback formatting
 * @param {Function} [t] - Optional translation function from useLanguage()
 */
function getRelativeTime(date, locale = 'en', t) {
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  // If a translation function is provided, use it
  if (typeof t === 'function') {
    if (diffSecs < 60) {
      return t('relativeTime.justNow');
    } else if (diffMins < 60) {
      const key = diffMins === 1 ? 'relativeTime.minuteAgo' : 'relativeTime.minutesAgo';
      return t(key).replace('{count}', diffMins);
    } else if (diffHours < 24) {
      const key = diffHours === 1 ? 'relativeTime.hourAgo' : 'relativeTime.hoursAgo';
      return t(key).replace('{count}', diffHours);
    } else if (diffDays < 7) {
      const key = diffDays === 1 ? 'relativeTime.dayAgo' : 'relativeTime.daysAgo';
      return t(key).replace('{count}', diffDays);
    } else {
      return formatDate(date, 'short', locale);
    }
  }

  // Fallback: locale-aware relative time labels (English default)
  const labels = {
    tr: {
      justNow: 'Az önce',
      minuteAgo: 'dakika önce',
      hourAgo: 'saat önce',
      dayAgo: 'gün önce',
    },
    en: {
      justNow: 'Just now',
      minuteAgo: 'minute ago',
      minutesAgo: 'minutes ago',
      hourAgo: 'hour ago',
      hoursAgo: 'hours ago',
      dayAgo: 'day ago',
      daysAgo: 'days ago',
    },
  };

  const l = labels[locale] || labels['en'];

  if (diffSecs < 60) {
    return l.justNow;
  } else if (diffMins < 60) {
    if (locale === 'tr') {
      return `${diffMins} ${l.minuteAgo}`;
    }
    return `${diffMins} ${diffMins === 1 ? l.minuteAgo : l.minutesAgo}`;
  } else if (diffHours < 24) {
    if (locale === 'tr') {
      return `${diffHours} ${l.hourAgo}`;
    }
    return `${diffHours} ${diffHours === 1 ? l.hourAgo : l.hoursAgo}`;
  } else if (diffDays < 7) {
    if (locale === 'tr') {
      return `${diffDays} ${l.dayAgo}`;
    }
    return `${diffDays} ${diffDays === 1 ? l.dayAgo : l.daysAgo}`;
  } else {
    return formatDate(date, 'short', locale);
  }
}

/**
 * Format currency
 * @param {number} amount - Amount in cents or dollars
 * @param {string} currency - Currency code
 */
export function formatCurrency(amount, currency = 'USD') {
  if (amount === null || amount === undefined) return '$0.00';
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

/**
 * Format technical conversation/session ids into a short UI-friendly token.
 * Examples:
 * - conv_0981e97f-5f78-4eb4-860f-ca084c768dbf -> #C768DBF
 * - chat_171234567_abcd1234 -> #ABCD1234
 */
export function formatSessionHandle(sessionId, fallback = '—') {
  if (!sessionId) return fallback;

  const raw = String(sessionId).trim();
  if (!raw) return fallback;

  const withoutPrefix = raw.replace(/^(conv_|chat_|whatsapp_|session_)/i, '');
  const chunks = withoutPrefix.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const preferredChunk = chunks.length > 0 ? chunks[chunks.length - 1] : withoutPrefix;
  const cleaned = preferredChunk.replace(/[^a-zA-Z0-9]/g, '');

  if (!cleaned) return fallback;

  const shortToken = cleaned.slice(-8).toUpperCase();
  return `#${shortToken}`;
}

/**
 * Format large numbers with K, M, B suffixes
 * @param {number} num - Number to format
 */
export function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(1) + 'B';
  } else if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  } else {
    return num.toString();
  }
}

/**
 * Format file size
 * @param {number} bytes - File size in bytes
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 */
export function truncate(text, maxLength = 50) {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Validate email
 * @param {string} email - Email to validate
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number (US format)
 * @param {string} phone - Phone to validate
 */
export function isValidPhone(phone) {
  const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
  return phoneRegex.test(phone);
}

/**
 * Validate URL
 * @param {string} url - URL to validate
 */
export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  }
}

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 */
export function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Generate random ID
 */
export function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Sleep/delay function
 * @param {number} ms - Milliseconds to sleep
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
