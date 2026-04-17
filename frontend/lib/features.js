/**
 * Feature Visibility Configuration
 * Controls which features are visible/accessible based on:
 * 1. User's subscription plan
 * 2. User's country/region
 *
 * Multi-Region Support:
 * - TR (Turkey): Phone as primary voice channel
 * - BR (Brazil): WhatsApp Calling as primary (no phone pool due to Anatel)
 * - US/EU: Phone as primary voice channel
 */

// Plan enum values
export const PLANS = {
  FREE: 'FREE',
  TRIAL: 'TRIAL',
  PAYG: 'PAYG',             // Pay as you go - same level as STARTER
  STARTER: 'STARTER',
  BASIC: 'BASIC',
  PRO: 'PRO',
  ENTERPRISE: 'ENTERPRISE'
};

// Plan hierarchy for comparison
export const PLAN_HIERARCHY = {
  [PLANS.FREE]: 0,
  [PLANS.TRIAL]: 1,
  [PLANS.PAYG]: 1,          // PAYG = STARTER level
  [PLANS.STARTER]: 1,
  [PLANS.BASIC]: 2,
  [PLANS.PRO]: 3,
  [PLANS.ENTERPRISE]: 4
};

// Visibility types
export const VISIBILITY = {
  VISIBLE: 'visible',   // Feature is accessible
  LOCKED: 'locked',     // Feature is visible but locked (shows upgrade modal)
  HIDDEN: 'hidden',     // Feature is completely hidden
  BYOC: 'byoc'         // Bring Your Own Carrier (for Brazil phone numbers)
};

// Supported regions/countries
export const REGIONS = {
  TR: 'TR',
  BR: 'BR',
  US: 'US',
  EU: 'EU'  // Covers DE, FR, ES, NL, GB, etc.
};

// Map countries to regions for feature visibility
export const COUNTRY_TO_REGION = {
  TR: 'TR',
  BR: 'BR',
  US: 'US',
  DE: 'EU',
  FR: 'EU',
  ES: 'EU',
  NL: 'EU',
  GB: 'EU',
  IT: 'EU',
  AE: 'US'  // UAE uses US-style features
};

/**
 * Feature definitions with visibility per plan
 *
 * Sidebar Matrix:
 * | Feature        | Free    | Starter | Basic | Pro | Enterprise |
 * |----------------|---------|---------|-------|-----|------------|
 * | E-posta        | hidden  | hidden  | locked| ✓   | ✓          |
 * | Entegrasyonlar | hidden  | hidden  | ✓     | ✓   | ✓          |
 * | Toplu Arama    | locked  | ✓       | ✓     | ✓   | ✓          |
 */
export const FEATURES = {
  // Sidebar features
  EMAIL: {
    id: 'email',
    name: 'E-posta',
    nameEN: 'Email',
    requiredPlan: PLANS.STARTER,
    visibility: {
      [PLANS.FREE]: VISIBILITY.HIDDEN,
      [PLANS.TRIAL]: VISIBILITY.VISIBLE,
      [PLANS.PAYG]: VISIBILITY.VISIBLE,
      [PLANS.STARTER]: VISIBILITY.VISIBLE,
      [PLANS.BASIC]: VISIBILITY.VISIBLE,
      [PLANS.PRO]: VISIBILITY.VISIBLE,
      [PLANS.ENTERPRISE]: VISIBILITY.VISIBLE
    },
    description: 'E-posta ile müşteri hizmetleri otomasyonu yapın.',
    descriptionEN: 'Automate customer service via email.'
  },

  INTEGRATIONS: {
    id: 'integrations',
    name: 'Entegrasyonlar',
    nameEN: 'Integrations',
    requiredPlan: PLANS.STARTER,
    visibility: {
      [PLANS.FREE]: VISIBILITY.HIDDEN,
      [PLANS.TRIAL]: VISIBILITY.VISIBLE,
      [PLANS.PAYG]: VISIBILITY.VISIBLE,
      [PLANS.STARTER]: VISIBILITY.VISIBLE,
      [PLANS.BASIC]: VISIBILITY.VISIBLE,
      [PLANS.PRO]: VISIBILITY.VISIBLE,
      [PLANS.ENTERPRISE]: VISIBILITY.VISIBLE
    },
    description: 'Üçüncü parti uygulamalarla entegrasyon yapın.',
    descriptionEN: 'Integrate with third-party applications.'
  },

  BATCH_CALLS: {
    id: 'batch_calls',
    name: 'Toplu Arama',
    nameEN: 'Batch Calls',
    requiredPlan: PLANS.TRIAL,
    visibility: {
      [PLANS.FREE]: VISIBILITY.LOCKED,
      [PLANS.TRIAL]: VISIBILITY.VISIBLE,
      [PLANS.PAYG]: VISIBILITY.VISIBLE,
      [PLANS.STARTER]: VISIBILITY.LOCKED,
      [PLANS.BASIC]: VISIBILITY.LOCKED,
      [PLANS.PRO]: VISIBILITY.VISIBLE,
      [PLANS.ENTERPRISE]: VISIBILITY.VISIBLE
    },
    description: 'Excel/CSV yükleyerek toplu tahsilat ve hatırlatma aramaları yapın.',
    descriptionEN: 'Make bulk collection and reminder calls by uploading Excel/CSV.'
  },

  // Integration page features (sub-features within integrations)
  CALENDAR_INTEGRATION: {
    id: 'calendar_integration',
    name: 'Takvim Entegrasyonu',
    nameEN: 'Calendar Integration',
    requiredPlan: PLANS.STARTER,
    visibility: {
      [PLANS.FREE]: VISIBILITY.HIDDEN,
      [PLANS.TRIAL]: VISIBILITY.VISIBLE,
      [PLANS.PAYG]: VISIBILITY.VISIBLE,
      [PLANS.STARTER]: VISIBILITY.VISIBLE,
      [PLANS.BASIC]: VISIBILITY.VISIBLE,
      [PLANS.PRO]: VISIBILITY.VISIBLE,
      [PLANS.ENTERPRISE]: VISIBILITY.VISIBLE
    },
    description: 'Google Calendar ile randevu yönetimi yapın.',
    descriptionEN: 'Manage appointments with Google Calendar.'
  },

  CRM_INTEGRATION: {
    id: 'crm_integration',
    name: 'Custom CRM',
    nameEN: 'Custom CRM',
    requiredPlan: PLANS.PRO,
    visibility: {
      [PLANS.FREE]: VISIBILITY.LOCKED,
      [PLANS.TRIAL]: VISIBILITY.LOCKED,
      [PLANS.PAYG]: VISIBILITY.LOCKED,
      [PLANS.STARTER]: VISIBILITY.LOCKED,
      [PLANS.BASIC]: VISIBILITY.LOCKED,
      [PLANS.PRO]: VISIBILITY.VISIBLE,
      [PLANS.ENTERPRISE]: VISIBILITY.VISIBLE
    },
    description: 'Kendi CRM sisteminizi entegre edin.',
    descriptionEN: 'Integrate your own CRM system.'
  },

  // E-commerce integrations are available for BASIC and above
  ECOMMERCE_INTEGRATION: {
    id: 'ecommerce_integration',
    name: 'E-ticaret Entegrasyonu',
    nameEN: 'E-commerce Integration',
    namePR: 'Integração E-commerce',
    requiredPlan: PLANS.STARTER,
    visibility: {
      [PLANS.FREE]: VISIBILITY.HIDDEN,
      [PLANS.TRIAL]: VISIBILITY.VISIBLE,
      [PLANS.PAYG]: VISIBILITY.VISIBLE,
      [PLANS.STARTER]: VISIBILITY.VISIBLE,
      [PLANS.BASIC]: VISIBILITY.VISIBLE,
      [PLANS.PRO]: VISIBILITY.VISIBLE,
      [PLANS.ENTERPRISE]: VISIBILITY.VISIBLE
    },
    description: 'Shopify, WooCommerce, ikas ve daha fazlası.',
    descriptionEN: 'Shopify, WooCommerce, ikas and more.',
    descriptionPR: 'Shopify, WooCommerce, Nuvemshop e mais.'
  },

  // ============================================================================
  // CHANNEL FEATURES - Region-based visibility
  // ============================================================================

  // Phone Channel - Primary in TR, US, EU; BYOC only in Brazil
  PHONE_CHANNEL: {
    id: 'phone_channel',
    name: 'Telefon Kanalı',
    nameEN: 'Phone Channel',
    namePR: 'Canal Telefônico',
    requiredPlan: PLANS.TRIAL,
    // Region-based visibility
    regionVisibility: {
      TR: {
        [PLANS.FREE]: VISIBILITY.HIDDEN,
        [PLANS.TRIAL]: VISIBILITY.VISIBLE,
        [PLANS.PAYG]: VISIBILITY.VISIBLE,
        [PLANS.STARTER]: VISIBILITY.HIDDEN,
        [PLANS.BASIC]: VISIBILITY.HIDDEN,
        [PLANS.PRO]: VISIBILITY.VISIBLE,
        [PLANS.ENTERPRISE]: VISIBILITY.VISIBLE
      },
      BR: {
        // In Brazil, phone is BYOC only (Anatel regulations)
        [PLANS.FREE]: VISIBILITY.HIDDEN,
        [PLANS.TRIAL]: VISIBILITY.HIDDEN,
        [PLANS.PAYG]: VISIBILITY.HIDDEN,
        [PLANS.STARTER]: VISIBILITY.HIDDEN,
        [PLANS.BASIC]: VISIBILITY.HIDDEN,
        [PLANS.PRO]: VISIBILITY.BYOC,
        [PLANS.ENTERPRISE]: VISIBILITY.BYOC
      },
      US: {
        [PLANS.FREE]: VISIBILITY.HIDDEN,
        [PLANS.TRIAL]: VISIBILITY.VISIBLE,
        [PLANS.PAYG]: VISIBILITY.VISIBLE,
        [PLANS.STARTER]: VISIBILITY.HIDDEN,
        [PLANS.BASIC]: VISIBILITY.HIDDEN,
        [PLANS.PRO]: VISIBILITY.VISIBLE,
        [PLANS.ENTERPRISE]: VISIBILITY.VISIBLE
      },
      EU: {
        [PLANS.FREE]: VISIBILITY.HIDDEN,
        [PLANS.TRIAL]: VISIBILITY.VISIBLE,
        [PLANS.PAYG]: VISIBILITY.VISIBLE,
        [PLANS.STARTER]: VISIBILITY.HIDDEN,
        [PLANS.BASIC]: VISIBILITY.HIDDEN,
        [PLANS.PRO]: VISIBILITY.VISIBLE,
        [PLANS.ENTERPRISE]: VISIBILITY.VISIBLE
      }
    },
    description: 'Geleneksel telefon aramaları ile müşteri hizmetleri.',
    descriptionEN: 'Customer service via traditional phone calls.',
    descriptionPR: 'Atendimento ao cliente via chamadas telefônicas.'
  },

  // WhatsApp Calling - Primary in Brazil, coming soon in other regions
  WHATSAPP_CALLING: {
    id: 'whatsapp_calling',
    name: 'WhatsApp Arama',
    nameEN: 'WhatsApp Calling',
    namePR: 'Chamadas WhatsApp',
    requiredPlan: PLANS.STARTER,
    regionVisibility: {
      TR: {
        // Not yet available in Turkey
        [PLANS.FREE]: VISIBILITY.HIDDEN,
        [PLANS.STARTER]: VISIBILITY.HIDDEN,
        [PLANS.BASIC]: VISIBILITY.HIDDEN,
        [PLANS.PRO]: VISIBILITY.HIDDEN,
        [PLANS.ENTERPRISE]: VISIBILITY.HIDDEN
      },
      BR: {
        // Primary voice channel in Brazil
        [PLANS.FREE]: VISIBILITY.HIDDEN,
        [PLANS.STARTER]: VISIBILITY.VISIBLE,
        [PLANS.BASIC]: VISIBILITY.VISIBLE,
        [PLANS.PRO]: VISIBILITY.VISIBLE,
        [PLANS.ENTERPRISE]: VISIBILITY.VISIBLE
      },
      US: {
        // Coming soon in US
        [PLANS.FREE]: VISIBILITY.HIDDEN,
        [PLANS.STARTER]: VISIBILITY.HIDDEN,
        [PLANS.BASIC]: VISIBILITY.HIDDEN,
        [PLANS.PRO]: VISIBILITY.LOCKED,
        [PLANS.ENTERPRISE]: VISIBILITY.VISIBLE
      },
      EU: {
        // Coming soon in EU
        [PLANS.FREE]: VISIBILITY.HIDDEN,
        [PLANS.STARTER]: VISIBILITY.HIDDEN,
        [PLANS.BASIC]: VISIBILITY.HIDDEN,
        [PLANS.PRO]: VISIBILITY.LOCKED,
        [PLANS.ENTERPRISE]: VISIBILITY.VISIBLE
      }
    },
    description: 'WhatsApp üzerinden sesli aramalar.',
    descriptionEN: 'Voice calls through WhatsApp.',
    descriptionPR: 'Chamadas de voz pelo WhatsApp.'
  },

  // WhatsApp Messaging
  WHATSAPP_MESSAGING: {
    id: 'whatsapp_messaging',
    name: 'WhatsApp Mesajlaşma',
    nameEN: 'WhatsApp Messaging',
    namePR: 'Mensagens WhatsApp',
    requiredPlan: PLANS.STARTER,
    regionVisibility: {
      TR: {
        [PLANS.FREE]: VISIBILITY.HIDDEN,
        [PLANS.TRIAL]: VISIBILITY.VISIBLE,
        [PLANS.PAYG]: VISIBILITY.VISIBLE,
        [PLANS.STARTER]: VISIBILITY.VISIBLE,
        [PLANS.BASIC]: VISIBILITY.VISIBLE,
        [PLANS.PRO]: VISIBILITY.VISIBLE,
        [PLANS.ENTERPRISE]: VISIBILITY.VISIBLE
      },
      BR: {
        // WhatsApp is essential in Brazil - available from Starter
        [PLANS.FREE]: VISIBILITY.HIDDEN,
        [PLANS.STARTER]: VISIBILITY.VISIBLE,
        [PLANS.BASIC]: VISIBILITY.VISIBLE,
        [PLANS.PRO]: VISIBILITY.VISIBLE,
        [PLANS.ENTERPRISE]: VISIBILITY.VISIBLE
      },
      US: {
        [PLANS.FREE]: VISIBILITY.HIDDEN,
        [PLANS.STARTER]: VISIBILITY.LOCKED,
        [PLANS.BASIC]: VISIBILITY.VISIBLE,
        [PLANS.PRO]: VISIBILITY.VISIBLE,
        [PLANS.ENTERPRISE]: VISIBILITY.VISIBLE
      },
      EU: {
        [PLANS.FREE]: VISIBILITY.HIDDEN,
        [PLANS.STARTER]: VISIBILITY.LOCKED,
        [PLANS.BASIC]: VISIBILITY.VISIBLE,
        [PLANS.PRO]: VISIBILITY.VISIBLE,
        [PLANS.ENTERPRISE]: VISIBILITY.VISIBLE
      }
    },
    description: 'WhatsApp Business ile mesajlaşma.',
    descriptionEN: 'Messaging via WhatsApp Business.',
    descriptionPR: 'Mensagens via WhatsApp Business.'
  },

  // Chat Widget - Same across all regions
  CHAT_WIDGET: {
    id: 'chat_widget',
    name: 'Chat Widget',
    nameEN: 'Chat Widget',
    namePR: 'Widget de Chat',
    requiredPlan: PLANS.STARTER,
    visibility: {
      [PLANS.FREE]: VISIBILITY.HIDDEN,
      [PLANS.TRIAL]: VISIBILITY.VISIBLE,
      [PLANS.PAYG]: VISIBILITY.VISIBLE,
      [PLANS.STARTER]: VISIBILITY.VISIBLE,
      [PLANS.BASIC]: VISIBILITY.VISIBLE,
      [PLANS.PRO]: VISIBILITY.VISIBLE,
      [PLANS.ENTERPRISE]: VISIBILITY.VISIBLE
    },
    description: 'Web sitenize eklenebilir sohbet widget\'ı.',
    descriptionEN: 'Embeddable chat widget for your website.',
    descriptionPR: 'Widget de chat incorporável para seu site.'
  }
};

// Integration types that are locked for BASIC plan
export const LOCKED_INTEGRATIONS_FOR_BASIC = [
  'CUSTOM'  // Custom CRM
];

// Map integration types to feature definitions
export const INTEGRATION_FEATURE_MAP = {
  'GOOGLE_CALENDAR': FEATURES.CALENDAR_INTEGRATION,
  'CUSTOM': FEATURES.CRM_INTEGRATION,
  'ZAPIER': FEATURES.CRM_INTEGRATION,  // Zapier is part of CRM/automation
  // E-commerce platforms - available for BASIC
  'SHOPIFY': FEATURES.ECOMMERCE_INTEGRATION,
  'WOOCOMMERCE': FEATURES.ECOMMERCE_INTEGRATION,
  'IKAS': FEATURES.ECOMMERCE_INTEGRATION,
  'IDEASOFT': FEATURES.ECOMMERCE_INTEGRATION,
  'TICIMAX': FEATURES.ECOMMERCE_INTEGRATION,
  // WhatsApp is handled separately from generic integration gating
  'WHATSAPP': null
};

/**
 * Get the region code for a country
 * @param {string} countryCode - Country code (TR, BR, US, DE, etc.)
 * @returns {string} Region code (TR, BR, US, EU)
 */
export function getRegion(countryCode) {
  return COUNTRY_TO_REGION[countryCode] || 'US';
}

/**
 * Get feature visibility for a specific plan and optionally region
 * @param {string} featureId - Feature ID from FEATURES
 * @param {string} userPlan - User's current plan
 * @param {string} countryCode - Optional country code for region-based features
 * @returns {string} Visibility type: 'visible', 'locked', 'hidden', or 'byoc'
 */
export function getFeatureVisibility(featureId, userPlan, countryCode = null) {
  const feature = Object.values(FEATURES).find(f => f.id === featureId);
  if (!feature) return VISIBILITY.VISIBLE;

  // If plan is not loaded yet (null/undefined), hide features to prevent flash
  if (!userPlan) return VISIBILITY.HIDDEN;

  // Normalize plan name
  let normalizedPlan = userPlan.toUpperCase();

  // Check if this feature has region-based visibility
  if (feature.regionVisibility && countryCode) {
    const region = getRegion(countryCode);
    const regionVisibility = feature.regionVisibility[region];

    if (regionVisibility) {
      const visibility = regionVisibility[normalizedPlan];
      if (visibility) return visibility;
    }
  }

  // Fall back to standard visibility
  let visibility = feature.visibility?.[normalizedPlan];

  // If visibility not found for this plan, use fallback logic
  if (!visibility) {
    if (normalizedPlan === 'PAYG' || normalizedPlan === 'TRIAL') {
      // PAYG/TRIAL should behave like STARTER for feature access
      visibility = feature.visibility?.[PLANS.STARTER] || feature.visibility?.[PLANS.FREE] || VISIBILITY.LOCKED;
    } else {
      // For unknown plans, default to LOCKED (safer than VISIBLE)
      console.warn(`[features] Unknown plan: ${normalizedPlan}, defaulting to LOCKED`);
      visibility = VISIBILITY.LOCKED;
    }
  }

  return visibility;
}

/**
 * Get feature definition by ID
 * @param {string} featureId - Feature ID
 * @returns {object|null} Feature definition
 */
export function getFeature(featureId) {
  return Object.values(FEATURES).find(f => f.id === featureId) || null;
}

/**
 * Check if user's plan has access to a feature
 * @param {string} featureId - Feature ID
 * @param {string} userPlan - User's current plan
 * @returns {boolean} True if feature is accessible
 */
export function hasFeatureAccess(featureId, userPlan) {
  const visibility = getFeatureVisibility(featureId, userPlan);
  return visibility === VISIBILITY.VISIBLE;
}

/**
 * Check if feature should be shown (visible or locked)
 * @param {string} featureId - Feature ID
 * @param {string} userPlan - User's current plan
 * @returns {boolean} True if feature should be displayed
 */
export function shouldShowFeature(featureId, userPlan) {
  const visibility = getFeatureVisibility(featureId, userPlan);
  return visibility !== VISIBILITY.HIDDEN;
}

/**
 * Check if feature is locked for the user's plan
 * @param {string} featureId - Feature ID
 * @param {string} userPlan - User's current plan
 * @returns {boolean} True if feature is locked
 */
export function isFeatureLocked(featureId, userPlan) {
  const visibility = getFeatureVisibility(featureId, userPlan);
  return visibility === VISIBILITY.LOCKED;
}

/**
 * Get the required plan name for a feature
 * @param {string} featureId - Feature ID
 * @param {Function} t - Translation function from useLanguage(). Falls back to English plan names.
 * @returns {string} Required plan name
 */
export function getRequiredPlanName(featureId, t) {
  const feature = getFeature(featureId);
  if (!feature) return '';

  if (typeof t === 'function') {
    const planKey = feature.requiredPlan?.toLowerCase();
    return planKey ? t(`planNames.${planKey}`) : '';
  }

  // Fallback to English plan names when no t function is provided
  const planNames = {
    [PLANS.BASIC]: 'Basic',
    [PLANS.PRO]: 'Pro',
    [PLANS.ENTERPRISE]: 'Enterprise'
  };

  return planNames[feature.requiredPlan] || '';
}

/**
 * Get feature description
 * @param {string} featureId - Feature ID
 * @param {Function} t - Translation function from useLanguage(). Falls back to English description.
 * @returns {string} Feature description
 */
export function getFeatureDescription(featureId, t) {
  const feature = getFeature(featureId);
  if (!feature) return '';

  if (typeof t === 'function') {
    return t(`featureConfig.${featureId}.description`);
  }

  // Fallback to English description when no t function is provided
  return feature.descriptionEN || feature.description;
}

/**
 * Get feature name
 * @param {string} featureId - Feature ID
 * @param {Function} t - Translation function from useLanguage(). Falls back to English name.
 * @returns {string} Feature name
 */
export function getFeatureName(featureId, t) {
  const feature = getFeature(featureId);
  if (!feature) return '';

  if (typeof t === 'function') {
    return t(`featureConfig.${featureId}.name`);
  }

  // Fallback to English name when no t function is provided
  return feature.nameEN || feature.name;
}

/**
 * Get integration feature info
 * @param {string} integrationType - Integration type (e.g., 'GOOGLE_CALENDAR')
 * @param {string} userPlan - User's current plan
 * @returns {object} { isLocked, feature }
 */
export function getIntegrationFeatureInfo(integrationType, userPlan) {
  const featureMapping = INTEGRATION_FEATURE_MAP[integrationType];

  // If no mapping exists, integration is always available
  if (!featureMapping) {
    return { isLocked: false, feature: null };
  }

  // Normalize plan name
  let normalizedPlan = userPlan?.toUpperCase() || PLANS.FREE;

  // PAYG plan should behave like STARTER for feature access
  let visibility = featureMapping.visibility[normalizedPlan];
  if (visibility === undefined && normalizedPlan === 'PAYG') {
    visibility = featureMapping.visibility[PLANS.STARTER] || featureMapping.visibility[PLANS.FREE];
  }

  // If visibility is not defined for this plan, check plan hierarchy
  // Higher plans should have access if lower plans don't have explicit visibility
  if (visibility === undefined) {
    const currentPlanLevel = PLAN_HIERARCHY[normalizedPlan] || 0;
    const requiredPlanLevel = PLAN_HIERARCHY[featureMapping.requiredPlan] || 0;

    // If user's plan level is >= required plan level, it's visible
    if (currentPlanLevel >= requiredPlanLevel) {
      return { isLocked: false, isHidden: false, feature: featureMapping };
    }
  }

  return {
    isLocked: visibility === VISIBILITY.LOCKED,
    isHidden: visibility === VISIBILITY.HIDDEN,
    feature: featureMapping
  };
}

/**
 * Get available channels for a country/region
 * @param {string} countryCode - Country code
 * @param {string} userPlan - User's plan
 * @returns {array} Array of available channels with visibility info
 */
export function getAvailableChannels(countryCode, userPlan) {
  const channels = [
    {
      id: 'phone_channel',
      featureId: 'phone_channel',
      icon: 'phone',
      ...FEATURES.PHONE_CHANNEL
    },
    {
      id: 'whatsapp_calling',
      featureId: 'whatsapp_calling',
      icon: 'whatsapp',
      ...FEATURES.WHATSAPP_CALLING
    },
    {
      id: 'whatsapp_messaging',
      featureId: 'whatsapp_messaging',
      icon: 'message-circle',
      ...FEATURES.WHATSAPP_MESSAGING
    },
    {
      id: 'chat_widget',
      featureId: 'chat_widget',
      icon: 'message-square',
      ...FEATURES.CHAT_WIDGET
    },
    {
      id: 'email',
      featureId: 'email',
      icon: 'mail',
      ...FEATURES.EMAIL
    }
  ];

  return channels.map(channel => ({
    ...channel,
    visibility: getFeatureVisibility(channel.featureId, userPlan, countryCode)
  })).filter(channel => channel.visibility !== VISIBILITY.HIDDEN);
}

/**
 * Get primary voice channel for a country
 * @param {string} countryCode - Country code
 * @returns {string} Primary voice channel ID
 */
export function getPrimaryVoiceChannel(countryCode) {
  const region = getRegion(countryCode);

  if (region === 'BR') {
    return 'whatsapp_calling';
  }

  return 'phone_channel';
}

const featureConfig = {
  PLANS,
  PLAN_HIERARCHY,
  VISIBILITY,
  REGIONS,
  COUNTRY_TO_REGION,
  FEATURES,
  LOCKED_INTEGRATIONS_FOR_BASIC,
  INTEGRATION_FEATURE_MAP,
  getRegion,
  getFeatureVisibility,
  getFeature,
  hasFeatureAccess,
  shouldShowFeature,
  isFeatureLocked,
  getRequiredPlanName,
  getFeatureDescription,
  getFeatureName,
  getIntegrationFeatureInfo,
  getAvailableChannels,
  getPrimaryVoiceChannel
};

export default featureConfig;
