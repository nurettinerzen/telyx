/**
 * Integration Metadata Configuration - MINIMAL (Pilot Version)
 * Only active/working integrations
 */

export const INTEGRATION_METADATA = {
  // ============================================================================
  // CALENDAR
  // ============================================================================

  GOOGLE_CALENDAR: {
    relevantFor: ['RESTAURANT', 'CLINIC', 'SALON', 'SERVICE', 'ECOMMERCE', 'OTHER'],
    priority: {
      RESTAURANT: 'ESSENTIAL',
      CLINIC: 'ESSENTIAL',
      SALON: 'ESSENTIAL',
      SERVICE: 'RECOMMENDED',
      ECOMMERCE: 'RECOMMENDED',
      OTHER: 'RECOMMENDED'
    },
    name: 'Google Calendar',
    description: 'Randevu ve takvim yönetimi',
    category: 'scheduling',
    authType: 'oauth'
  },

  // ============================================================================
  // COMMUNICATION
  // ============================================================================

  WHATSAPP: {
    relevantFor: ['RESTAURANT', 'ECOMMERCE', 'CLINIC', 'SALON', 'SERVICE', 'OTHER'],
    priority: {
      RESTAURANT: 'ESSENTIAL',
      ECOMMERCE: 'ESSENTIAL',
      CLINIC: 'ESSENTIAL',
      SALON: 'ESSENTIAL',
      SERVICE: 'RECOMMENDED',
      OTHER: 'RECOMMENDED'
    },
    name: 'WhatsApp Business',
    description: 'WhatsApp üzerinden müşteri iletişimi',
    category: 'communication',
    authType: 'api_key'
  },

  // ============================================================================
  // E-COMMERCE
  // ============================================================================

  SHOPIFY: {
    relevantFor: ['ECOMMERCE', 'OTHER'],
    priority: {
      ECOMMERCE: 'ESSENTIAL',
      OTHER: 'OPTIONAL'
    },
    name: 'Shopify',
    description: 'Shopify mağaza entegrasyonu',
    category: 'ecommerce',
    authType: 'oauth'
  },

  IKAS: {
    relevantFor: ['ECOMMERCE', 'OTHER'],
    priority: {
      ECOMMERCE: 'ESSENTIAL',
      OTHER: 'OPTIONAL'
    },
    name: 'ikas',
    description: 'ikas e-ticaret platformu entegrasyonu',
    category: 'ecommerce',
    authType: 'api_key',
    region: 'TR'
  },

  TRENDYOL: {
    relevantFor: ['ECOMMERCE', 'OTHER'],
    priority: {
      ECOMMERCE: 'RECOMMENDED',
      OTHER: 'OPTIONAL'
    },
    name: 'Trendyol',
    description: 'Trendyol pazaryeri soru cevap entegrasyonu',
    category: 'marketplace',
    authType: 'api_key',
    region: 'TR'
  },

  HEPSIBURADA: {
    relevantFor: ['ECOMMERCE', 'OTHER'],
    priority: {
      ECOMMERCE: 'RECOMMENDED',
      OTHER: 'OPTIONAL'
    },
    name: 'Hepsiburada',
    description: 'Hepsiburada pazaryeri soru cevap entegrasyonu',
    category: 'marketplace',
    authType: 'api_key',
    region: 'TR'
  },

  AMAZON: {
    relevantFor: ['ECOMMERCE', 'OTHER'],
    priority: {
      ECOMMERCE: 'RECOMMENDED',
      OTHER: 'OPTIONAL'
    },
    name: 'Amazon',
    description: 'Amazon SP-API buyer messaging ve sipariş bazlı müşteri iletişimi',
    category: 'marketplace',
    authType: 'oauth',
    region: 'TR'
  },

  SIKAYETVAR: {
    relevantFor: ['ECOMMERCE', 'SERVICE', 'OTHER'],
    priority: {
      ECOMMERCE: 'OPTIONAL',
      SERVICE: 'RECOMMENDED',
      OTHER: 'OPTIONAL'
    },
    name: 'Şikayetvar',
    description: 'Şikayetvar şikayet yönetimi entegrasyonu',
    category: 'complaints',
    authType: 'api_key',
    region: 'TR'
  },

  // Note: Gmail and Outlook are handled separately in frontend (not in this metadata)
  // Note: Custom CRM/ERP is also handled separately in frontend integration cards
};

/**
 * Get filtered integrations for business type and region
 */
export function getFilteredIntegrations(businessType = 'OTHER', region = null) {
  const integrations = [];

  for (const [integrationType, metadata] of Object.entries(INTEGRATION_METADATA)) {
    // Check if relevant for this business type
    const isRelevant = metadata.relevantFor.includes(businessType);

    // Region filter (if specified)
    const matchesRegion = !region || !metadata.region || metadata.region === region;

    if (isRelevant && matchesRegion) {
      integrations.push({
        type: integrationType,
        ...metadata,
        priority: metadata.priority[businessType] || 'OPTIONAL'
      });
    }
  }

  // Sort by priority: ESSENTIAL > RECOMMENDED > OPTIONAL
  const priorityOrder = { ESSENTIAL: 0, RECOMMENDED: 1, OPTIONAL: 2 };
  integrations.sort((a, b) => {
    const aPriority = priorityOrder[a.priority] || 2;
    const bPriority = priorityOrder[b.priority] || 2;
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    // Secondary sort by name
    return a.name.localeCompare(b.name);
  });

  return integrations;
}

/**
 * Get integrations by category
 */
export function getIntegrationsByCategory(businessType, category) {
  return getFilteredIntegrations(businessType).filter(i => i.category === category);
}

/**
 * Get priority for a specific integration and business type
 */
export function getIntegrationPriority(integrationType, businessType) {
  const metadata = INTEGRATION_METADATA[integrationType];
  if (!metadata) return 'OPTIONAL';
  return metadata.priority[businessType] || 'OPTIONAL';
}

/**
 * Check if integration is relevant for business type
 */
export function isIntegrationRelevant(integrationType, businessType) {
  if (businessType === 'OTHER') return true;
  const metadata = INTEGRATION_METADATA[integrationType];
  if (!metadata) return false;
  return metadata.relevantFor.includes(businessType);
}

/**
 * Get essential integrations for a business type
 */
export function getEssentialIntegrations(businessType) {
  return getFilteredIntegrations(businessType).filter(i => i.priority === 'ESSENTIAL');
}

/**
 * Get integration categories with counts
 */
export function getIntegrationCategories(businessType) {
  const integrations = getFilteredIntegrations(businessType);
  const categories = {};

  for (const integration of integrations) {
    if (!categories[integration.category]) {
      categories[integration.category] = {
        name: integration.category,
        count: 0,
        essential: 0,
        recommended: 0
      };
    }
    categories[integration.category].count++;
    if (integration.priority === 'ESSENTIAL') categories[integration.category].essential++;
    if (integration.priority === 'RECOMMENDED') categories[integration.category].recommended++;
  }

  return categories;
}
