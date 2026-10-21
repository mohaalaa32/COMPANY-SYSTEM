import { describe, expect, it } from 'vitest';
import { matchBudget } from '../src/budget';
import type { Product } from '../src/types';

const sampleProducts: Product[] = [
  {
    id: 'p1',
    sku: 'SKU-IPHONE-15',
    nameAr: 'ايفون 15 عادي 128 كيكابايت',
    nameEn: 'iPhone 15 128GB',
    category: 'phone',
    brand: 'Apple',
    basePriceIQD: 1100000,
    costIQD: 950000,
    imageUrl: 'https://example.com/p1.jpg',
    specs: { storage: '128GB', ram: '6GB', warrantyMonths: 12 },
    isAvailable: true,
    totalStock: 8,
    branches: [],
    tags: ['apple', 'flagship'],
  },
  {
    id: 'p2',
    sku: 'SKU-A55',
    nameAr: 'سامسونج جالكسي A55 5G',
    nameEn: 'Samsung Galaxy A55 5G',
    category: 'phone',
    brand: 'Samsung',
    basePriceIQD: 450000,
    costIQD: 380000,
    imageUrl: 'https://example.com/p2.jpg',
    specs: { storage: '256GB', ram: '8GB', warrantyMonths: 12 },
    isAvailable: true,
    totalStock: 12,
    branches: [],
    tags: ['samsung', 'midrange', 'gaming'],
  },
  {
    id: 'p3',
    sku: 'SKU-REDMI-13',
    nameAr: 'شاومي ريدمي 13 سي',
    nameEn: 'Xiaomi Redmi 13C',
    category: 'phone',
    brand: 'Xiaomi',
    basePriceIQD: 150000,
    costIQD: 120000,
    imageUrl: 'https://example.com/p3.jpg',
    specs: { storage: '128GB', ram: '4GB', warrantyMonths: 12 },
    isAvailable: true,
    totalStock: 5,
    branches: [],
    tags: ['xiaomi', 'budget', 'student'],
  },
  {
    id: 'p4',
    sku: 'SKU-OUT-OF-STOCK',
    nameAr: 'هاتف نافد من المخزن',
    nameEn: 'Out of stock phone',
    category: 'phone',
    brand: 'Xiaomi',
    basePriceIQD: 100000,
    costIQD: 80000,
    imageUrl: 'https://example.com/p4.jpg',
    specs: { warrantyMonths: 12 },
    isAvailable: false,
    totalStock: 0,
    branches: [],
    tags: ['budget'],
  },
  {
    id: 'c1',
    sku: 'SKU-COVER-A55',
    nameAr: 'كفر حماية سيليكون أصلي سامسونج A55',
    nameEn: 'Original Silicone Case Samsung A55',
    category: 'accessory',
    brand: 'Samsung',
    basePriceIQD: 25000,
    costIQD: 15000,
    imageUrl: 'https://example.com/c1.jpg',
    specs: { warrantyMonths: 6 },
    isAvailable: true,
    totalStock: 20,
    branches: [],
    tags: ['cover', 'protection', 'samsung'],
  },
  {
    id: 'c2',
    sku: 'SKU-COVER-REDMI',
    nameAr: 'حافظة ضد الصدمات ريدمي',
    nameEn: 'Shockproof Case Redmi',
    category: 'accessory',
    brand: 'Xiaomi',
    basePriceIQD: 15000,
    costIQD: 8000,
    imageUrl: 'https://example.com/c2.jpg',
    specs: { warrantyMonths: 6 },
    isAvailable: true,
    totalStock: 15,
    branches: [],
    tags: ['cover', 'xiaomi'],
  },
  {
    id: 'ch1',
    sku: 'SKU-CHARGER-25W',
    nameAr: 'شاحن سريع أصلي 25 واط',
    nameEn: 'Original 25W Fast Charger',
    category: 'accessory',
    brand: 'Samsung',
    basePriceIQD: 25000,
    costIQD: 14000,
    imageUrl: 'https://example.com/ch1.jpg',
    specs: { warrantyMonths: 12 },
    isAvailable: true,
    totalStock: 25,
    branches: [],
    tags: ['charger', 'samsung', 'fast-charge'],
  },
];

describe('matchBudget algorithm (0-B3)', () => {
  it('handles empty product list and zero/negative budget gracefully', () => {
    const emptyResult = matchBudget([], 500000);
    expect(emptyResult.directMatches).toHaveLength(0);
    expect(emptyResult.recommendedBundle).toBeUndefined();
    expect(emptyResult.explanationAr).toContain('لا تتوفر منتجات');

    const zeroResult = matchBudget(sampleProducts, 0);
    expect(zeroResult.directMatches).toHaveLength(0);
    expect(zeroResult.recommendedBundle).toBeUndefined();
    expect(zeroResult.cheapestAvailableIQD).toBe(15000); // cheapest accessory
  });

  it('filters direct matches within budget and excludes out of stock items', () => {
    const result = matchBudget(sampleProducts, 500000);
    // Budget is 500k: should include A55 (450k), Redmi 13C (150k), covers, charger
    // Excludes iPhone 15 (1.1M) and out of stock phone
    expect(result.directMatches.some((p) => p.id === 'p1')).toBe(false);
    expect(result.directMatches.some((p) => p.id === 'p4')).toBe(false);
    expect(result.directMatches.some((p) => p.id === 'p2')).toBe(true);
    expect(result.directMatches.some((p) => p.id === 'p3')).toBe(true);
  });

  it('prioritizes direct matches according to customer preference', () => {
    const gamingResult = matchBudget(sampleProducts, 500000, 'gaming');
    // A55 has 'gaming' tag and fits budget, so it should rank first among phones
    expect(gamingResult.directMatches[0]?.id).toBe('p2');
  });

  it('recommends an optimal bundle (phone + cover + charger) fitting the budget', () => {
    // Budget 500,000 IQD: A55 (450k) + Cover (25k) + Charger (25k) = 500,000 raw
    // With 5% discount (25k), total is 475,000 IQD <= 500k
    const result = matchBudget(sampleProducts, 500000);
    expect(result.recommendedBundle).toBeDefined();

    const bundle = result.recommendedBundle!;
    expect(bundle.phone.id).toBe('p2');
    expect(bundle.cover).toBeDefined();
    expect(bundle.cover.category).toBe('accessory');
    expect(bundle.charger).toBeDefined();
    expect(bundle.totalPriceIQD).toBeLessThanOrEqual(500000);
    expect(bundle.savingsIQD).toBeGreaterThan(0);
    expect(bundle.totalPriceIQD % 250).toBe(0);
  });

  it('recommends bundle with phone + cover only when adding charger exceeds budget', () => {
    // Budget 480,000 IQD: A55 (450k) + Cover (25k) = 475k raw
    // With 5% discount (23,750 -> 23,750), total 451,250 IQD
    // If charger (25k) added: raw 500k, 5% discount = 475k (fits)
    // Let's test budget 460,000 IQD: A55 (450k) + Cover (25k) raw 475k, 5% discount = 451,250 <= 460k
    // But with charger: 475k > 460k! So charger should NOT be included.
    const result = matchBudget(sampleProducts, 460000);
    expect(result.recommendedBundle).toBeDefined();
    const bundle = result.recommendedBundle!;
    expect(bundle.phone.id).toBe('p2');
    expect(bundle.cover).toBeDefined();
    expect(bundle.charger).toBeUndefined();
    expect(bundle.totalPriceIQD).toBeLessThanOrEqual(460000);
  });

  it('calculates deficit and suggests installment plan when budget is below cheapest phone', () => {
    // Cheapest phone is Redmi 13C (150,000 IQD)
    // Customer has only 100,000 IQD
    const result = matchBudget(sampleProducts, 100000);
    expect(result.cheapestAvailableIQD).toBe(150000);
    expect(result.budgetDeficitIQD).toBe(50000);
    expect(result.explanationAr).toContain('أقل من سعر أرخص هاتف');
    expect(result.explanationAr).toContain('الفارق هو 50,000 د.ع');
    expect(result.explanationAr).toContain('أقساط');
  });

  it('never exposes costIQD in explanationAr or customer-facing text', () => {
    const result1 = matchBudget(sampleProducts, 500000);
    const result2 = matchBudget(sampleProducts, 100000);
    const result3 = matchBudget(sampleProducts, 1200000);

    for (const res of [result1, result2, result3]) {
      // Must not mention cost, costIQD, or wholesale price
      expect(res.explanationAr).not.toMatch(/cost/i);
      expect(res.explanationAr).not.toMatch(/سعر التكلفة|تكلفة|جملة/);
      for (const p of sampleProducts) {
        expect(res.explanationAr).not.toContain(p.costIQD.toString());
      }
    }
  });

  it('preserves minimum margin on bundles when discount is applied', () => {
    // Product with very tight margin: price 100k, cost 96k (4% margin)
    const tightProduct: Product = {
      id: 'tight-phone',
      sku: 'SKU-TIGHT',
      nameAr: 'هاتف بهامش ضيق',
      nameEn: 'Tight Margin Phone',
      category: 'phone',
      brand: 'Test',
      basePriceIQD: 100000,
      costIQD: 96000,
      imageUrl: '',
      specs: { warrantyMonths: 12 },
      isAvailable: true,
      totalStock: 5,
      branches: [],
      tags: [],
    };
    const tightCover: Product = {
      id: 'tight-cover',
      sku: 'SKU-TIGHT-COVER',
      nameAr: 'كفر حماية تجريبي',
      nameEn: 'Tight Cover',
      category: 'accessory',
      brand: 'Test',
      basePriceIQD: 10000,
      costIQD: 9500,
      imageUrl: '',
      specs: { warrantyMonths: 6 },
      isAvailable: true,
      totalStock: 5,
      branches: [],
      tags: ['cover'],
    };

    // If minMarginPct = 5, the bundle must not discount below minMarginPct
    const result = matchBudget([tightProduct, tightCover], 150000, undefined, { minMarginPct: 5 });
    if (result.recommendedBundle) {
      const bundle = result.recommendedBundle;
      const totalCost = tightProduct.costIQD + tightCover.costIQD;
      const actualMarginPct = ((bundle.totalPriceIQD - totalCost) / bundle.totalPriceIQD) * 100;
      expect(actualMarginPct).toBeGreaterThanOrEqual(4.8); // within rounding step
    }
  });
});
