import TrendyolQaService from '../integrations/marketplace/trendyol-qa.service.js';
import HepsiburadaQaService from '../integrations/marketplace/hepsiburada-qa.service.js';
import { MARKETPLACE_PLATFORM } from './qaShared.js';

export function getMarketplaceServiceForPlatform(platform, credentials = null) {
  switch (String(platform || '').toUpperCase()) {
    case MARKETPLACE_PLATFORM.TRENDYOL:
      return new TrendyolQaService(credentials);
    case MARKETPLACE_PLATFORM.HEPSIBURADA:
      return new HepsiburadaQaService(credentials);
    default:
      throw new Error(`Desteklenmeyen pazaryeri platformu: ${platform}`);
  }
}

export const MARKETPLACE_SERVICE_MAP = {
  [MARKETPLACE_PLATFORM.TRENDYOL]: TrendyolQaService,
  [MARKETPLACE_PLATFORM.HEPSIBURADA]: HepsiburadaQaService,
};

