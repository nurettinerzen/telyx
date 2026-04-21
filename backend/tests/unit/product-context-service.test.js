import { buildMarketplaceProductContextBlock } from '../../src/services/marketplace/productContextService.js';

describe('productContextService', () => {
  it('builds a compact product context block with core facts', () => {
    const block = buildMarketplaceProductContextBlock({
      title: 'TAB70WIFI 10.1 64GB/12GB Tablet MAVİ',
      barcode: '8691234567890',
      brand: 'Telyx Tech',
      categoryName: 'Tablet',
      description: '10.1 inç ekranlı tablet modeli.',
      productUrl: 'https://example.com/product',
      facts: ['Sim Kart Desteği: Var', 'RAM: 12 GB'],
      source: 'trendyol-product-api',
    });

    expect(block).toContain('ÜRÜN BAĞLAMI:');
    expect(block).toContain('Ürün adı: TAB70WIFI 10.1 64GB/12GB Tablet MAVİ');
    expect(block).toContain('Marka: Telyx Tech');
    expect(block).toContain('Özellikler: Sim Kart Desteği: Var | RAM: 12 GB');
  });
});
