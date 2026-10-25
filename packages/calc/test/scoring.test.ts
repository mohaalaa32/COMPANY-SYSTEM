import { describe, it, expect } from 'vitest';
import { scoreProduct } from '../src/scoring';
import type { Product } from '../src/types';

describe('Deterministic Recommendation Scoring (scoreProduct)', () => {
  const baseProduct: Product = {
    id: 'tb-test-phone-1',
    sku: 'TB-IP15P-128',
    nameAr: 'آيفون 15 برو 128 كيكابايت',
    nameEn: 'iPhone 15 Pro 128GB',
    category: 'phone',
    brand: 'Apple',
    basePriceIQD: 1500000,
    salePriceIQD: 1500000,
    costIQD: 1200000, // (1500000 - 1200000)/1500000 = 20% margin
    imageUrl: 'https://cdn.telbaghdad.iq/products/iphone15pro.png',
    specs: {
      storage: '128GB',
      ram: '8GB',
      battery: '3274mAh',
      warrantyMonths: 12,
    },
    isAvailable: true,
    totalStock: 8,
    branches: [
      {
        branchId: 'branch-karbala',
        branchNameAr: 'فرع كربلاء',
        quantity: 8,
        available: true,
      },
    ],
    tags: ['flagship', 'gaming', 'best-camera'],
  };

  it('handles minMarginPct = 0 without division by zero or NaN (regression test)', () => {
    // When minMarginPct is 0 and price equals cost (0% margin)
    const zeroMarginProduct: Product = {
      ...baseProduct,
      basePriceIQD: 1000000,
      salePriceIQD: 1000000,
      costIQD: 1000000, // 0% margin
    };

    const scoreAtZeroMinMargin = scoreProduct(zeroMarginProduct, undefined, {
      minMarginPct: 0,
      targetBudgetIQD: 1000000,
    });

    expect(Number.isInteger(scoreAtZeroMinMargin)).toBe(true);
    expect(Number.isNaN(scoreAtZeroMinMargin)).toBe(false);
    expect(scoreAtZeroMinMargin).toBeGreaterThanOrEqual(0);
    expect(scoreAtZeroMinMargin).toBeLessThanOrEqual(100);

    // Isolate margin score with 100% margin weight
    const pureMarginScore = scoreProduct(
      zeroMarginProduct,
      { budgetFit: 0, usageFit: 0, stock: 0, margin: 1.0 },
      { minMarginPct: 0 }
    );
    // At minMargin (0%), normalizedRatio is 0, so marginScore = 0.4 -> score = 40
    expect(pureMarginScore).toBe(40);
  });

  it('guarantees marginScore never exceeds 1.0 even with extremely high margins', () => {
    // 95% margin product: cost is 50,000 IQD, price is 1,000,000 IQD
    const superProfitableProduct: Product = {
      ...baseProduct,
      basePriceIQD: 1000000,
      salePriceIQD: 1000000,
      costIQD: 50000,
    };

    // Isolate margin score with pure margin weight
    const pureMarginScore = scoreProduct(
      superProfitableProduct,
      { budgetFit: 0, usageFit: 0, stock: 0, margin: 1.0 },
      { minMarginPct: 0 }
    );

    // pureMarginScore should be exactly 100 (1.0 * 100), never > 100
    expect(pureMarginScore).toBe(100);
    expect(pureMarginScore).toBeLessThanOrEqual(100);

    // Also test with default minMarginPct
    const pureMarginDefault = scoreProduct(
      superProfitableProduct,
      { budgetFit: 0, usageFit: 0, stock: 0, margin: 1.0 }
    );
    expect(pureMarginDefault).toBe(100);
  });

  it('guarantees final score is strictly clamped to [0, 100]', () => {
    // 1. Worst possible scenario:
    // Out of stock, massive budget overshoot (price 5x budget), negative margin (cost > price)
    const worstProduct: Product = {
      ...baseProduct,
      basePriceIQD: 5000000,
      salePriceIQD: 5000000,
      costIQD: 6000000,
      totalStock: 0,
      tags: ['budget'],
    };

    const worstScore = scoreProduct(
      worstProduct,
      { budgetFit: 0.5, usageFit: 0.2, stock: 0.15, margin: 0.15 },
      { targetBudgetIQD: 500000, targetUsageTag: 'gaming', minMarginPct: 15 }
    );

    expect(Number.isInteger(worstScore)).toBe(true);
    expect(worstScore).toBeGreaterThanOrEqual(0);
    expect(worstScore).toBeLessThanOrEqual(100);

    // 2. Best possible scenario:
    // Fits budget perfectly, matches usage tag, high stock (>5), optimal margin (>=20%)
    const bestProduct: Product = {
      ...baseProduct,
      basePriceIQD: 1000000,
      salePriceIQD: 1000000,
      costIQD: 700000, // 30% margin
      totalStock: 15,
      tags: ['gaming', 'flagship'],
    };

    const bestScore = scoreProduct(
      bestProduct,
      { budgetFit: 0.4, usageFit: 0.3, stock: 0.15, margin: 0.15 },
      { targetBudgetIQD: 1000000, targetUsageTag: 'gaming', minMarginPct: 10 }
    );

    expect(Number.isInteger(bestScore)).toBe(true);
    expect(bestScore).toBeGreaterThanOrEqual(0);
    expect(bestScore).toBeLessThanOrEqual(100);
    expect(bestScore).toBe(100); // Perfect score
  });

  it('strictly satisfies docs/CONTRACTS.md §3 signature with required weights', () => {
    const score = scoreProduct(baseProduct, {
      budgetFit: 0.4,
      usageFit: 0.3,
      stock: 0.15,
      margin: 0.15,
    });

    expect(Number.isInteger(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
