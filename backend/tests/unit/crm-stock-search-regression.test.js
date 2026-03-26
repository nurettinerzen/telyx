import { describe, expect, it } from '@jest/globals';
import { resolveCatalogCandidates } from '../../src/tools/handlers/crm-stock.js';

describe('crm stock candidate retrieval', () => {
  const catalog = [
    {
      sku: 'VX00UGR04',
      productName: 'Uğur U Smart Plus 24 A++ 24000 Btu/h Inverter Klima',
      inStock: true,
      quantity: 4,
      price: 100
    },
    {
      sku: 'APL-IP17-128',
      productName: 'Apple iPhone 17 128GB Siyah',
      inStock: true,
      quantity: 8,
      price: 100
    },
    {
      sku: 'APL-IP17-256',
      productName: 'Apple iPhone 17 256GB Siyah',
      inStock: true,
      quantity: 5,
      price: 100
    },
    {
      sku: 'APL-IP17P-256',
      productName: 'Apple iPhone 17 Pro 256GB Titanyum',
      inStock: true,
      quantity: 3,
      price: 100
    },
    {
      sku: 'APL-AIR-13',
      productName: 'Apple MacBook Air 13 M4 16GB 256GB',
      inStock: true,
      quantity: 6,
      price: 100
    }
  ];

  it('returns a direct match for a sufficiently specific partial product name', () => {
    const result = resolveCatalogCandidates(catalog, 'Uğur U Smart Plus 24');

    expect(result.directMatch).toBeTruthy();
    expect(result.directMatch.sku).toBe('VX00UGR04');
    expect(result.candidatePool[0].sku).toBe('VX00UGR04');
  });

  it('keeps multiple candidates for broad product family searches', () => {
    const result = resolveCatalogCandidates(catalog, 'Apple iPhone 17');

    expect(result.directMatch).toBeNull();
    expect(result.candidatePool.length).toBeGreaterThan(1);
    expect(result.candidatePool.slice(0, 3).map(item => item.sku)).toEqual([
      'APL-IP17-128',
      'APL-IP17-256',
      'APL-IP17P-256'
    ]);
  });

  it('keeps broad brand searches in disambiguation mode instead of forcing one product', () => {
    const result = resolveCatalogCandidates(catalog, 'Apple');

    expect(result.directMatch).toBeNull();
    expect(result.candidatePool.length).toBeGreaterThan(3);
    expect(result.candidatePool.every(item => item.productName.includes('Apple'))).toBe(true);
  });

  it('does not match a different model number when numeric qualifiers conflict', () => {
    const result = resolveCatalogCandidates([
      {
        sku: 'APL-IP14-512',
        productName: 'Apple iPhone 14 Plus 512GB MQ5D3TU/A Yıldız Işığı Cep Telefonu',
        inStock: true,
        quantity: 2,
        price: 100
      }
    ], 'Apple iPhone 17');

    expect(result.directMatch).toBeNull();
    expect(result.candidatePool).toHaveLength(0);
  });
});
