import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  roundIraqiCurrency,
  convertCurrency,
  formatIQD,
  verifyMargin,
  calculateInstallments,
  scoreProduct,
  matchBudget,
} from '../src/index';
import type { Product, RoundingStep } from '../src/index';

describe('Property-Based Invariants (fast-check) — Agent 5 Math Engine', () => {
  describe('roundIraqiCurrency invariants', () => {
    it('always outputs an integer multiple of the configured cash step', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100_000_000 }),
          fc.constantFrom<RoundingStep>(250, 500, 1000),
          (amount, step) => {
            const rounded = roundIraqiCurrency(amount, step);
            expect(rounded % step).toBe(0);
            expect(Number.isInteger(rounded)).toBe(true);
            expect(rounded).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('satisfies proximity invariant: distance from raw amount is at most step / 2', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50_000_000 }),
          fc.constantFrom<RoundingStep>(250, 500, 1000),
          (amount, step) => {
            const rounded = roundIraqiCurrency(amount, step);
            expect(Math.abs(rounded - amount)).toBeLessThanOrEqual(step / 2);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('is strictly idempotent: round(round(x)) === round(x)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -10000, max: 50_000_000 }),
          fc.constantFrom<RoundingStep>(250, 500, 1000),
          (amount, step) => {
            const once = roundIraqiCurrency(amount, step);
            const twice = roundIraqiCurrency(once, step);
            expect(twice).toBe(once);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns exactly 0 for non-positive or invalid inputs', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -10_000_000, max: 0 }),
          (amount) => {
            expect(roundIraqiCurrency(amount)).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('convertCurrency invariants', () => {
    it('always rounds IQD target to multiples of 250', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100_000 }), // USD
          fc.integer({ min: 1000, max: 2000 }), // Exchange rate
          (usd, rate) => {
            const iqd = convertCurrency(usd, rate, 'IQD');
            expect(iqd % 250).toBe(0);
            expect(iqd).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('always rounds USD target to non-negative integers', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100_000_000 }), // IQD
          fc.integer({ min: 1000, max: 2000 }),     // Exchange rate
          (iqd, rate) => {
            const usd = convertCurrency(iqd, rate, 'USD');
            expect(Number.isInteger(usd)).toBe(true);
            expect(usd).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('formatIQD invariants', () => {
    it('always formats safely and ends with " د.ع"', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1000, max: 500_000_000 }),
          (amount) => {
            const formatted = formatIQD(amount);
            expect(formatted.endsWith(' د.ع')).toBe(true);
            expect(typeof formatted).toBe('string');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('verifyMargin invariants', () => {
    it('guarantees margin calculation consistency and safety threshold', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10_000, max: 5_000_000 }),  // costIQD
          fc.integer({ min: 10_000, max: 10_000_000 }), // proposedPriceIQD
          fc.integer({ min: 1, max: 50 }),              // minMarginPct
          (cost, price, minMargin) => {
            const result = verifyMargin(cost, price, minMargin);
            const expectedMarginPct = Math.round(((price - cost) / price) * 10000) / 100;

            expect(result.actualMarginPct).toBe(expectedMarginPct);
            expect(result.isSafe).toBe(expectedMarginPct >= minMargin);
            expect(result.recommendedMinPriceIQD % 250).toBe(0);
          }
        ),
        { numRuns: 150 }
      );
    });

    it('recommendedMinPriceIQD always restores safety', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10_000, max: 2_000_000 }), // costIQD
          fc.integer({ min: 1, max: 30 }),             // minMarginPct
          (cost, minMargin) => {
            const check = verifyMargin(cost, 1, minMargin);
            const recCheck = verifyMargin(cost, check.recommendedMinPriceIQD, minMargin);
            expect(recCheck.isSafe).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('calculateInstallments invariants', () => {
    it('guarantees monthly payment covers total remaining debt', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100_000, max: 5_000_000 }), // priceIQD
          fc.integer({ min: 1, max: 36 }),              // months
          fc.integer({ min: 0, max: 5_000_000 }),       // downPaymentIQD
          (price, months, downPayment) => {
            const plan = calculateInstallments(price, months, downPayment);

            expect(plan.totalPriceIQD % 250).toBe(0);
            expect(plan.downPaymentIQD % 250).toBe(0);
            expect(plan.downPaymentIQD).toBeLessThanOrEqual(plan.totalPriceIQD);
            expect(plan.monthlyAmountIQD % 250).toBe(0);

            const remaining = (plan.remainingAmountIQD ?? (plan.totalPriceIQD - plan.downPaymentIQD));
            if (remaining > 0) {
              expect(plan.monthlyAmountIQD * plan.months).toBeGreaterThanOrEqual(remaining);
            }
            expect(typeof plan.breakdownAr).toBe('string');
            expect(plan.breakdownAr.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 150 }
      );
    });
  });

  describe('scoreProduct invariants', () => {
    it('always outputs an integer bounded strictly in [0, 100]', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10_000_000 }),  // basePriceIQD
          fc.integer({ min: 0, max: 10_000_000 }),  // costIQD
          fc.integer({ min: 0, max: 100 }),         // totalStock
          fc.boolean(),                             // isAvailable
          fc.integer({ min: 0, max: 10_000_000 }),  // targetBudgetIQD
          (price, cost, stock, isAvailable, budget) => {
            const product: Product = {
              id: 'prop-p',
              sku: 'SKU-PROP',
              nameAr: 'هاتف فاحص',
              nameEn: 'Prop Phone',
              category: 'phone',
              brand: 'PropBrand',
              basePriceIQD: price,
              costIQD: cost,
              imageUrl: '',
              specs: { warrantyMonths: 12 },
              isAvailable,
              totalStock: stock,
              branches: [],
              tags: ['gaming', 'budget'],
            };

            const score = scoreProduct(
              product,
              { budgetFit: 0.4, usageFit: 0.35, stock: 0.15, margin: 0.1 },
              { targetBudgetIQD: budget }
            );

            expect(Number.isInteger(score)).toBe(true);
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: 150 }
      );
    });
  });

  describe('matchBudget invariants', () => {
    it('recommendedBundle strictly respects budget and 250 IQD cash rounding', () => {
      const phones: Product[] = [
        {
          id: 'ph-1',
          sku: 'P1',
          nameAr: 'هاتف اقتصادي',
          nameEn: 'Budget Phone',
          category: 'phone',
          brand: 'BrandA',
          basePriceIQD: 200000,
          costIQD: 170000,
          imageUrl: '',
          specs: { warrantyMonths: 12 },
          isAvailable: true,
          totalStock: 10,
          branches: [],
          tags: ['budget'],
        },
        {
          id: 'ph-2',
          sku: 'P2',
          nameAr: 'هاتف متوسط',
          nameEn: 'Mid Phone',
          category: 'phone',
          brand: 'BrandB',
          basePriceIQD: 400000,
          costIQD: 340000,
          imageUrl: '',
          specs: { warrantyMonths: 12 },
          isAvailable: true,
          totalStock: 5,
          branches: [],
          tags: ['midrange'],
        },
      ];

      const covers: Product[] = [
        {
          id: 'cv-1',
          sku: 'C1',
          nameAr: 'كفر حماية',
          nameEn: 'Case',
          category: 'accessory',
          brand: 'BrandA',
          basePriceIQD: 20000,
          costIQD: 10000,
          imageUrl: '',
          specs: { warrantyMonths: 6 },
          isAvailable: true,
          totalStock: 20,
          branches: [],
          tags: ['cover'],
        },
      ];

      const chargers: Product[] = [
        {
          id: 'ch-1',
          sku: 'CH1',
          nameAr: 'شاحن سريع',
          nameEn: 'Charger',
          category: 'accessory',
          brand: 'BrandA',
          basePriceIQD: 25000,
          costIQD: 12000,
          imageUrl: '',
          specs: { warrantyMonths: 12 },
          isAvailable: true,
          totalStock: 15,
          branches: [],
          tags: ['charger'],
        },
      ];

      const allCatalog = [...phones, ...covers, ...chargers];

      fc.assert(
        fc.property(
          fc.integer({ min: 100_000, max: 1_000_000 }),
          (budget) => {
            const result = matchBudget(allCatalog, budget);

            // Direct matches must be within budget
            for (const match of result.directMatches) {
              const price = match.salePriceIQD ?? match.basePriceIQD;
              expect(price).toBeLessThanOrEqual(budget);
            }

            // Recommended bundle must fit inside budget
            if (result.recommendedBundle) {
              expect(result.recommendedBundle.totalPriceIQD).toBeLessThanOrEqual(budget);
              expect(result.recommendedBundle.totalPriceIQD % 250).toBe(0);
              expect(result.recommendedBundle.savingsIQD).toBeGreaterThanOrEqual(0);
            }

            // Security: costIQD is NEVER leaked
            expect(result.explanationAr).not.toMatch(/cost/i);
            expect(result.explanationAr).not.toMatch(/سعر التكلفة|تكلفة/);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
