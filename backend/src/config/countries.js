/**
 * ============================================================================
 * MULTI-REGION CONFIGURATION
 * ============================================================================
 *
 * Central configuration for supported countries, languages, and currencies.
 * This enables TELYX.AI to operate in multiple regions with different:
 * - Languages
 * - Currencies
 * - Timezones
 * - Communication channels
 * - Integration availability
 *
 * @author TELYX.AI Development Team
 * @version 1.0.0
 */

// ============================================================================
// SUPPORTED COUNTRIES
// ============================================================================

export const SUPPORTED_COUNTRIES = {
  TR: {
    code: 'TR',
    name: 'Turkey',
    nameLocal: 'Türkiye',
    currency: 'TRY',
    currencySymbol: '₺',
    currencyName: 'Turkish Lira',
    language: 'TR',
    timezone: 'Europe/Istanbul',
    phonePrefix: '+90',
    flag: '🇹🇷',
    // Primary voice channel for this region
    primaryVoiceChannel: 'phone',
    // Available channels in this region
    channels: ['phone', 'whatsapp_messaging', 'chat_widget', 'email'],
    // Payment methods available
    paymentMethods: ['card'],
    // Date format preferences
    dateFormat: 'DD.MM.YYYY',
    timeFormat: '24h'
  },
  BR: {
    code: 'BR',
    name: 'Brazil',
    nameLocal: 'Brasil',
    currency: 'BRL',
    currencySymbol: 'R$',
    currencyName: 'Brazilian Real',
    language: 'PR', // Brazilian Portuguese
    timezone: 'America/Sao_Paulo',
    phonePrefix: '+55',
    flag: '🇧🇷',
    // Phone is primary voice channel (same as other regions)
    primaryVoiceChannel: 'phone',
    // Available channels in Brazil
    channels: ['phone', 'whatsapp_messaging', 'chat_widget', 'email'],
    // Pix and Boleto are essential for Brazil
    paymentMethods: ['card', 'pix', 'boleto'],
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h'
  },
  US: {
    code: 'US',
    name: 'United States',
    nameLocal: 'United States',
    currency: 'USD',
    currencySymbol: '$',
    currencyName: 'US Dollar',
    language: 'EN',
    timezone: 'America/New_York',
    phonePrefix: '+1',
    flag: '🇺🇸',
    primaryVoiceChannel: 'phone',
    channels: ['phone', 'whatsapp_messaging', 'chat_widget', 'email'],
    paymentMethods: ['card'],
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h'
  },
  GB: {
    code: 'GB',
    name: 'United Kingdom',
    nameLocal: 'United Kingdom',
    currency: 'GBP',
    currencySymbol: '£',
    currencyName: 'British Pound',
    language: 'EN',
    timezone: 'Europe/London',
    phonePrefix: '+44',
    flag: '🇬🇧',
    primaryVoiceChannel: 'phone',
    channels: ['phone', 'whatsapp_messaging', 'chat_widget', 'email'],
    paymentMethods: ['card'],
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h'
  },
  DE: {
    code: 'DE',
    name: 'Germany',
    nameLocal: 'Deutschland',
    currency: 'EUR',
    currencySymbol: '€',
    currencyName: 'Euro',
    language: 'DE',
    timezone: 'Europe/Berlin',
    phonePrefix: '+49',
    flag: '🇩🇪',
    primaryVoiceChannel: 'phone',
    channels: ['phone', 'whatsapp_messaging', 'chat_widget', 'email'],
    paymentMethods: ['card'],
    dateFormat: 'DD.MM.YYYY',
    timeFormat: '24h'
  },
  FR: {
    code: 'FR',
    name: 'France',
    nameLocal: 'France',
    currency: 'EUR',
    currencySymbol: '€',
    currencyName: 'Euro',
    language: 'FR',
    timezone: 'Europe/Paris',
    phonePrefix: '+33',
    flag: '🇫🇷',
    primaryVoiceChannel: 'phone',
    channels: ['phone', 'whatsapp_messaging', 'chat_widget', 'email'],
    paymentMethods: ['card'],
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h'
  },
  ES: {
    code: 'ES',
    name: 'Spain',
    nameLocal: 'España',
    currency: 'EUR',
    currencySymbol: '€',
    currencyName: 'Euro',
    language: 'ES',
    timezone: 'Europe/Madrid',
    phonePrefix: '+34',
    flag: '🇪🇸',
    primaryVoiceChannel: 'phone',
    channels: ['phone', 'whatsapp_messaging', 'chat_widget', 'email'],
    paymentMethods: ['card'],
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h'
  },
  NL: {
    code: 'NL',
    name: 'Netherlands',
    nameLocal: 'Nederland',
    currency: 'EUR',
    currencySymbol: '€',
    currencyName: 'Euro',
    language: 'NL',
    timezone: 'Europe/Amsterdam',
    phonePrefix: '+31',
    flag: '🇳🇱',
    primaryVoiceChannel: 'phone',
    channels: ['phone', 'whatsapp_messaging', 'chat_widget', 'email'],
    paymentMethods: ['card'],
    dateFormat: 'DD-MM-YYYY',
    timeFormat: '24h'
  },
  AE: {
    code: 'AE',
    name: 'United Arab Emirates',
    nameLocal: 'الإمارات العربية المتحدة',
    currency: 'AED',
    currencySymbol: 'د.إ',
    currencyName: 'UAE Dirham',
    language: 'AR',
    timezone: 'Asia/Dubai',
    phonePrefix: '+971',
    flag: '🇦🇪',
    primaryVoiceChannel: 'phone',
    channels: ['phone', 'whatsapp_messaging', 'chat_widget', 'email'],
    paymentMethods: ['card'],
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '12h'
  }
};

// ============================================================================
// SUPPORTED LANGUAGES
// ============================================================================

export const SUPPORTED_LANGUAGES = {
  TR: {
    code: 'TR',
    name: 'Turkish',
    nativeName: 'Türkçe',
    flag: '🇹🇷',
    direction: 'ltr'
  },
  EN: {
    code: 'EN',
    name: 'English',
    nativeName: 'English',
    flag: '🇺🇸',
    direction: 'ltr'
  },
  PR: {
    code: 'PR',
    name: 'Portuguese (Brazil)',
    nativeName: 'Português (Brasil)',
    flag: '🇧🇷',
    direction: 'ltr'
  },
  PT: {
    code: 'PT',
    name: 'Portuguese (Portugal)',
    nativeName: 'Português',
    flag: '🇵🇹',
    direction: 'ltr'
  },
  DE: {
    code: 'DE',
    name: 'German',
    nativeName: 'Deutsch',
    flag: '🇩🇪',
    direction: 'ltr'
  },
  ES: {
    code: 'ES',
    name: 'Spanish',
    nativeName: 'Español',
    flag: '🇪🇸',
    direction: 'ltr'
  },
  FR: {
    code: 'FR',
    name: 'French',
    nativeName: 'Français',
    flag: '🇫🇷',
    direction: 'ltr'
  },
  IT: {
    code: 'IT',
    name: 'Italian',
    nativeName: 'Italiano',
    flag: '🇮🇹',
    direction: 'ltr'
  },
  NL: {
    code: 'NL',
    name: 'Dutch',
    nativeName: 'Nederlands',
    flag: '🇳🇱',
    direction: 'ltr'
  },
  PL: {
    code: 'PL',
    name: 'Polish',
    nativeName: 'Polski',
    flag: '🇵🇱',
    direction: 'ltr'
  },
  RU: {
    code: 'RU',
    name: 'Russian',
    nativeName: 'Русский',
    flag: '🇷🇺',
    direction: 'ltr'
  },
  AR: {
    code: 'AR',
    name: 'Arabic',
    nativeName: 'العربية',
    flag: '🇸🇦',
    direction: 'rtl'
  },
  JA: {
    code: 'JA',
    name: 'Japanese',
    nativeName: '日本語',
    flag: '🇯🇵',
    direction: 'ltr'
  },
  KO: {
    code: 'KO',
    name: 'Korean',
    nativeName: '한국어',
    flag: '🇰🇷',
    direction: 'ltr'
  },
  ZH: {
    code: 'ZH',
    name: 'Chinese',
    nativeName: '中文',
    flag: '🇨🇳',
    direction: 'ltr'
  },
  HI: {
    code: 'HI',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    flag: '🇮🇳',
    direction: 'ltr'
  },
  SV: {
    code: 'SV',
    name: 'Swedish',
    nativeName: 'Svenska',
    flag: '🇸🇪',
    direction: 'ltr'
  }
};

// ============================================================================
// SUPPORTED CURRENCIES
// ============================================================================

export const SUPPORTED_CURRENCIES = {
  TRY: {
    code: 'TRY',
    name: 'Turkish Lira',
    symbol: '₺',
    position: 'after', // 100₺
    decimalSeparator: ',',
    thousandSeparator: '.',
    decimalPlaces: 2
  },
  BRL: {
    code: 'BRL',
    name: 'Brazilian Real',
    symbol: 'R$',
    position: 'before', // R$100
    decimalSeparator: ',',
    thousandSeparator: '.',
    decimalPlaces: 2
  },
  USD: {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    position: 'before', // $100
    decimalSeparator: '.',
    thousandSeparator: ',',
    decimalPlaces: 2
  },
  EUR: {
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    position: 'before', // €100
    decimalSeparator: ',',
    thousandSeparator: '.',
    decimalPlaces: 2
  },
  GBP: {
    code: 'GBP',
    name: 'British Pound',
    symbol: '£',
    position: 'before', // £100
    decimalSeparator: '.',
    thousandSeparator: ',',
    decimalPlaces: 2
  },
  AED: {
    code: 'AED',
    name: 'UAE Dirham',
    symbol: 'د.إ',
    position: 'after', // 100 د.إ
    decimalSeparator: '.',
    thousandSeparator: ',',
    decimalPlaces: 2
  }
};

// ============================================================================
// CHANNEL DEFINITIONS
// ============================================================================

export const CHANNEL_DEFINITIONS = {
  phone: {
    id: 'phone',
    name: 'Phone',
    nameTR: 'Telefon',
    namePR: 'Telefone',
    icon: 'phone',
    description: 'Traditional phone calls via SIP/PSTN',
    // Regions where this channel is available
    availableIn: ['TR', 'US', 'GB', 'DE', 'FR', 'ES', 'NL', 'AE'],
    // In Brazil, phone is BYOC only
    byocOnly: ['BR']
  },
  whatsapp_calling: {
    id: 'whatsapp_calling',
    name: 'WhatsApp Calling',
    nameTR: 'WhatsApp Arama',
    namePR: 'Chamadas WhatsApp',
    icon: 'whatsapp',
    description: 'Voice calls through WhatsApp Business API',
    availableIn: ['BR'], // Primary channel for Brazil
    comingSoon: ['TR', 'US', 'GB', 'DE', 'FR', 'ES', 'NL', 'AE']
  },
  whatsapp_messaging: {
    id: 'whatsapp_messaging',
    name: 'WhatsApp Messaging',
    nameTR: 'WhatsApp Mesajlaşma',
    namePR: 'Mensagens WhatsApp',
    icon: 'whatsapp',
    description: 'Text messaging through WhatsApp Business API',
    availableIn: ['TR', 'BR', 'US', 'GB', 'DE', 'FR', 'ES', 'NL', 'AE']
  },
  chat_widget: {
    id: 'chat_widget',
    name: 'Chat Widget',
    nameTR: 'Sohbet Aracı',
    namePR: 'Widget de Chat',
    icon: 'message-square',
    description: 'Embeddable chat widget for websites',
    availableIn: ['TR', 'BR', 'US', 'GB', 'DE', 'FR', 'ES', 'NL', 'AE']
  },
  email: {
    id: 'email',
    name: 'Email',
    nameTR: 'E-posta',
    namePR: 'E-mail',
    icon: 'mail',
    description: 'Email automation through Gmail/Outlook',
    availableIn: ['TR', 'BR', 'US', 'GB', 'DE', 'FR', 'ES', 'NL', 'AE']
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get country configuration by code
 * @param {string} countryCode - Country code (TR, BR, US, etc.)
 * @returns {object} Country configuration
 */
export function getCountry(countryCode) {
  return SUPPORTED_COUNTRIES[countryCode] || SUPPORTED_COUNTRIES.TR;
}

/**
 * Get language configuration by code
 * @param {string} languageCode - Language code (TR, EN, PR, etc.)
 * @returns {object} Language configuration
 */
export function getLanguage(languageCode) {
  return SUPPORTED_LANGUAGES[languageCode] || SUPPORTED_LANGUAGES.EN;
}

/**
 * Get currency configuration by code
 * @param {string} currencyCode - Currency code (TRY, BRL, USD, etc.)
 * @returns {object} Currency configuration
 */
export function getCurrency(currencyCode) {
  return SUPPORTED_CURRENCIES[currencyCode] || SUPPORTED_CURRENCIES.USD;
}

/**
 * Get default configuration for a country
 * @param {string} countryCode - Country code
 * @returns {object} Default settings for the country
 */
export function getDefaultsForCountry(countryCode) {
  const country = getCountry(countryCode);
  return {
    country: country.code,
    language: country.language,
    currency: country.currency,
    timezone: country.timezone,
    primaryVoiceChannel: country.primaryVoiceChannel,
    paymentMethods: country.paymentMethods,
    dateFormat: country.dateFormat,
    timeFormat: country.timeFormat
  };
}

/**
 * Get available channels for a country
 * @param {string} countryCode - Country code
 * @returns {array} Available channel IDs
 */
export function getAvailableChannels(countryCode) {
  const country = getCountry(countryCode);
  return country.channels || ['phone', 'whatsapp_messaging', 'chat_widget', 'email'];
}

/**
 * Check if a channel is available in a country
 * @param {string} channelId - Channel ID
 * @param {string} countryCode - Country code
 * @returns {boolean} True if available
 */
export function isChannelAvailable(channelId, countryCode) {
  const channel = CHANNEL_DEFINITIONS[channelId];
  if (!channel) return false;

  // Check if it's in available regions
  if (channel.availableIn?.includes(countryCode)) return true;

  // Check if it's BYOC only
  if (channel.byocOnly?.includes(countryCode)) return 'byoc';

  // Check if coming soon
  if (channel.comingSoon?.includes(countryCode)) return 'coming_soon';

  return false;
}

/**
 * Format currency amount for display
 * @param {number} amount - Amount to format
 * @param {string} currencyCode - Currency code
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount, currencyCode) {
  const currency = getCurrency(currencyCode);

  // Format the number
  const formattedNumber = amount
    .toFixed(currency.decimalPlaces)
    .replace('.', currency.decimalSeparator)
    .replace(/\B(?=(\d{3})+(?!\d))/g, currency.thousandSeparator);

  // Position the symbol
  if (currency.position === 'before') {
    return `${currency.symbol}${formattedNumber}`;
  } else {
    return `${formattedNumber}${currency.symbol}`;
  }
}

/**
 * Get list of countries for dropdown
 * @returns {array} Array of country options for select
 */
export function getCountryOptions() {
  return Object.values(SUPPORTED_COUNTRIES).map(country => ({
    value: country.code,
    label: country.nameLocal,
    flag: country.flag
  }));
}

/**
 * Get list of languages for dropdown
 * @returns {array} Array of language options for select
 */
export function getLanguageOptions() {
  return Object.values(SUPPORTED_LANGUAGES).map(lang => ({
    value: lang.code,
    label: lang.nativeName,
    flag: lang.flag
  }));
}

/**
 * Get list of timezones commonly used
 * @returns {array} Array of timezone options
 */
export function getTimezoneOptions() {
  return [
    { value: 'Europe/Istanbul', label: '(UTC+3) Istanbul, Turkey' },
    { value: 'Europe/London', label: '(UTC+0) London, UK' },
    { value: 'Europe/Paris', label: '(UTC+1) Paris, France' },
    { value: 'Europe/Berlin', label: '(UTC+1) Berlin, Germany' },
    { value: 'Europe/Madrid', label: '(UTC+1) Madrid, Spain' },
    { value: 'Europe/Amsterdam', label: '(UTC+1) Amsterdam, Netherlands' },
    { value: 'America/New_York', label: '(UTC-5) New York, Eastern Time' },
    { value: 'America/Chicago', label: '(UTC-6) Chicago, Central Time' },
    { value: 'America/Denver', label: '(UTC-7) Denver, Mountain Time' },
    { value: 'America/Los_Angeles', label: '(UTC-8) Los Angeles, Pacific Time' },
    { value: 'America/Sao_Paulo', label: '(UTC-3) São Paulo, Brazil' },
    { value: 'America/Brasilia', label: '(UTC-3) Brasilia, Brazil' },
    { value: 'America/Manaus', label: '(UTC-4) Manaus, Brazil' },
    { value: 'Europe/Moscow', label: '(UTC+3) Moscow, Russia' },
    { value: 'Asia/Dubai', label: '(UTC+4) Dubai, UAE' },
    { value: 'Asia/Kolkata', label: '(UTC+5:30) Mumbai, India' },
    { value: 'Asia/Singapore', label: '(UTC+8) Singapore' },
    { value: 'Asia/Tokyo', label: '(UTC+9) Tokyo, Japan' },
    { value: 'Asia/Seoul', label: '(UTC+9) Seoul, Korea' },
    { value: 'Australia/Sydney', label: '(UTC+11) Sydney, Australia' }
  ];
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  SUPPORTED_COUNTRIES,
  SUPPORTED_LANGUAGES,
  SUPPORTED_CURRENCIES,
  CHANNEL_DEFINITIONS,
  getCountry,
  getLanguage,
  getCurrency,
  getDefaultsForCountry,
  getAvailableChannels,
  isChannelAvailable,
  formatCurrency,
  getCountryOptions,
  getLanguageOptions,
  getTimezoneOptions
};
