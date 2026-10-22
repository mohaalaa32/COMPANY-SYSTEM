import { describe, it, expect } from 'vitest';
import { MOCK_PRODUCTS, MOCK_BRANCHES, MOCK_OFFERS } from '../src/index';

describe('Iraqi Catalog & Adapters Data Integrity', () => {
  describe('MOCK_BRANCHES', () => {
    it('contains all 5 planned Iraqi store branches with valid data', () => {
      expect(MOCK_BRANCHES.length).toBe(5);

      const branchIds = MOCK_BRANCHES.map((b) => b.id);
      expect(branchIds).toEqual([
        'branch-karrada',
        'branch-mansour',
        'branch-basra',
        'branch-erbil',
        'branch-najaf',
      ]);

      const mainStore = MOCK_BRANCHES.find((b) => b.isMainStore);
      expect(mainStore).toBeDefined();
      expect(mainStore?.id).toBe('branch-karrada');

      for (const branch of MOCK_BRANCHES) {
        expect(branch.nameAr).toBeDefined();
        expect(branch.city).toMatch(/^(بغداد|البصرة|أربيل|النجف)$/);
        expect(branch.phone).toMatch(/^\+964/);
        expect(branch.addressAr.length).toBeGreaterThan(10);
      }
    });
  });

  describe('MOCK_PRODUCTS', () => {
    it('contains at least 15 realistic products across all 5 allowed categories', () => {
      expect(MOCK_PRODUCTS.length).toBeGreaterThanOrEqual(18);

      const categories = new Set(MOCK_PRODUCTS.map((p) => p.category));
      expect(categories).toContain('phone');
      expect(categories).toContain('accessory');
      expect(categories).toContain('audio');
      expect(categories).toContain('tablet');
      expect(categories).toContain('wearable');
    });

    it('enforces that every product has costIQD strictly lower than salePrice (Margin Protection)', () => {
      for (const prod of MOCK_PRODUCTS) {
        const effectivePrice = prod.salePriceIQD ?? prod.basePriceIQD;
        expect(prod.costIQD).toBeGreaterThan(0);
        expect(prod.costIQD).toBeLessThan(effectivePrice);

        const marginPct = ((effectivePrice - prod.costIQD) / effectivePrice) * 100;
        // All products must have at least 5% margin to prevent price undercutting
        expect(marginPct).toBeGreaterThanOrEqual(5);
      }
    });

    it('enforces that all prices and costs are valid Iraqi multiples of 250 IQD', () => {
      for (const prod of MOCK_PRODUCTS) {
        expect(prod.basePriceIQD % 250).toBe(0);
        expect(prod.costIQD % 250).toBe(0);
        if (prod.salePriceIQD !== undefined) {
          expect(prod.salePriceIQD % 250).toBe(0);
        }
      }
    });

    it('verifies that totalStock strictly equals the sum of branch quantities', () => {
      for (const prod of MOCK_PRODUCTS) {
        const sumBranches = prod.branches.reduce((sum, b) => sum + b.quantity, 0);
        expect(prod.totalStock).toBe(sumBranches);
        expect(prod.isAvailable).toBe(prod.totalStock > 0);
        expect(prod.branches.length).toBe(MOCK_BRANCHES.length);
      }
    });

    it('guarantees unique IDs and SKUs across the entire catalog', () => {
      const ids = MOCK_PRODUCTS.map((p) => p.id);
      const skus = MOCK_PRODUCTS.map((p) => p.sku);

      expect(new Set(ids).size).toBe(ids.length);
      expect(new Set(skus).size).toBe(skus.length);
    });

    it('includes essential device tags and specs', () => {
      for (const prod of MOCK_PRODUCTS) {
        expect(prod.tags.length).toBeGreaterThan(0);
        expect(prod.specs.warrantyMonths).toBeGreaterThanOrEqual(3);
        expect(prod.imageUrl).toMatch(/^\/images\/products\//);
      }
    });
  });

  describe('MOCK_OFFERS', () => {
    it('verifies all offers reference real existing products', () => {
      const allProductIds = new Set(MOCK_PRODUCTS.map((p) => p.id));

      for (const offer of MOCK_OFFERS) {
        expect(offer.id).toBeDefined();
        expect(offer.titleAr.length).toBeGreaterThan(10);
        expect(offer.discountPct).toBeGreaterThan(0);
        expect(offer.discountPct).toBeLessThanOrEqual(50);
        expect(new Date(offer.validUntil).getTime()).toBeGreaterThan(Date.now());

        for (const prodId of offer.applicableProductIds) {
          expect(allProductIds.has(prodId)).toBe(true);
        }
      }
    });
  });

  describe('Brand Integrity Guard', () => {
    it('guarantees zero occurrences of forbidden legacy company names in all data strings', () => {
      const forbiddenCodes1 = [0x062a, 0x0642, 0x0646, 0x064a, 0x0629, 0x20, 0x0628, 0x063a, 0x062f, 0x0627, 0x062f];
      const forbiddenCodes2 = [0x062a, 0x0642, 0x0646, 0x064a, 0x0629, 0x20, 0x0627, 0x0644, 0x0639, 0x0631, 0x0627, 0x0642];
      const bad1 = String.fromCharCode(...forbiddenCodes1);
      const bad2 = String.fromCharCode(...forbiddenCodes2);

      const allDataJson = JSON.stringify({
        products: MOCK_PRODUCTS,
        branches: MOCK_BRANCHES,
        offers: MOCK_OFFERS,
      });

      expect(allDataJson.includes(bad1)).toBe(false);
      expect(allDataJson.includes(bad2)).toBe(false);
    });
  });
});
