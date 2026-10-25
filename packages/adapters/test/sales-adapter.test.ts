import { describe, it, expect, beforeEach } from 'vitest';
import {
  MockSalesAdapter,
  normalizeArabicSearchText,
  MOCK_PRODUCTS,
} from '../src/index';

describe('Sales Adapter (MockSalesAdapter)', () => {
  let adapter: MockSalesAdapter;

  beforeEach(() => {
    adapter = new MockSalesAdapter();
  });

  describe('normalizeArabicSearchText', () => {
    it('normalizes various forms of Alef, Taa Marbuta, Yaa and removes diacritics', () => {
      expect(normalizeArabicSearchText('آيْفُون')).toBe('ايفون');
      expect(normalizeArabicSearchText('إِنْفِينِكْس')).toBe('انفينكس');
      expect(normalizeArabicSearchText('شَاشَةٌ')).toBe('شاشه');
      expect(normalizeArabicSearchText('ذَكِيّ')).toBe('ذكي');
    });
  });

  describe('searchProducts', () => {
    it('returns all products when no filter is provided', async () => {
      const all = await adapter.searchProducts();
      expect(all.length).toBe(MOCK_PRODUCTS.length);
      expect(all.length).toBeGreaterThan(15);
    });

    it('searches products by Arabic dialect text and normalizes spelling variations', async () => {
      // User searches with "ايفون" or "آيفون"
      const withHamza = await adapter.searchProducts({ query: 'آيفون 16' });
      const withoutHamza = await adapter.searchProducts({ query: 'ايفون 16' });

      expect(withHamza.length).toBeGreaterThan(0);
      expect(withoutHamza.length).toBeGreaterThan(0);
      expect(withHamza[0]?.id).toBe('prod-ip16pm-256');
      expect(withoutHamza[0]?.id).toBe('prod-ip16pm-256');
    });

    it('searches products by English name, brand, or SKU', async () => {
      const byEnglish = await adapter.searchProducts({ query: 'Galaxy S24' });
      expect(byEnglish.length).toBeGreaterThan(0);
      expect(byEnglish[0]?.id).toBe('prod-s24u-256');

      const bySku = await adapter.searchProducts({ query: 'APL-IP15' });
      expect(bySku.length).toBe(1);
      expect(bySku[0]?.id).toBe('prod-ip15-128');
    });

    it('filters products strictly by category', async () => {
      const phones = await adapter.searchProducts({ category: 'phone' });
      expect(phones.length).toBeGreaterThan(0);
      expect(phones.every((p) => p.category === 'phone')).toBe(true);

      const accessories = await adapter.searchProducts({ category: 'accessory' });
      expect(accessories.length).toBeGreaterThan(0);
      expect(accessories.every((p) => p.category === 'accessory')).toBe(true);

      const audio = await adapter.searchProducts({ category: 'audio' });
      expect(audio.length).toBeGreaterThan(0);
      expect(audio.every((p) => p.category === 'audio')).toBe(true);

      const tablets = await adapter.searchProducts({ category: 'tablet' });
      expect(tablets.length).toBeGreaterThan(0);
      expect(tablets.every((p) => p.category === 'tablet')).toBe(true);

      const wearables = await adapter.searchProducts({ category: 'wearable' });
      expect(wearables.length).toBeGreaterThan(0);
      expect(wearables.every((p) => p.category === 'wearable')).toBe(true);
    });

    it('filters products by brand (case-insensitive)', async () => {
      const appleProds = await adapter.searchProducts({ brand: 'apple' });
      expect(appleProds.length).toBeGreaterThan(0);
      expect(appleProds.every((p) => p.brand.toLowerCase() === 'apple')).toBe(true);

      const samsungProds = await adapter.searchProducts({ brand: 'Samsung' });
      expect(samsungProds.length).toBeGreaterThan(0);
      expect(samsungProds.every((p) => p.brand.toLowerCase() === 'samsung')).toBe(true);
    });

    it('filters products by price range in Iraqi Dinars (IQD)', async () => {
      // Budget phones: under 300,000 IQD
      const budgetPhones = await adapter.searchProducts({
        category: 'phone',
        maxPriceIQD: 300000,
      });

      expect(budgetPhones.length).toBeGreaterThan(0);
      expect(
        budgetPhones.every((p) => (p.salePriceIQD ?? p.basePriceIQD) <= 300000)
      ).toBe(true);

      // Mid-range: between 400,000 and 500,000 IQD
      const midRange = await adapter.searchProducts({
        category: 'phone',
        minPriceIQD: 400000,
        maxPriceIQD: 500000,
      });

      expect(midRange.length).toBeGreaterThan(0);
      expect(
        midRange.every((p) => {
          const price = p.salePriceIQD ?? p.basePriceIQD;
          return price >= 400000 && price <= 500000;
        })
      ).toBe(true);
    });

    it('filters products by tags', async () => {
      const studentPhones = await adapter.searchProducts({
        category: 'phone',
        tags: ['student'],
      });

      expect(studentPhones.length).toBeGreaterThan(0);
      expect(studentPhones.every((p) => p.tags.includes('student'))).toBe(true);

      const chargers = await adapter.searchProducts({
        tags: ['charger'],
      });
      expect(chargers.length).toBeGreaterThan(0);
      expect(chargers.every((p) => p.tags.includes('charger'))).toBe(true);
    });

    it('filters products by specific branch stock availability', async () => {
      const karbalaAvailable = await adapter.searchProducts({
        branchId: 'branch-karbala',
      });

      expect(karbalaAvailable.length).toBeGreaterThan(0);
      expect(
        karbalaAvailable.every((p) =>
          p.branches.some((b) => b.branchId === 'branch-karbala' && b.available && b.quantity > 0)
        )
      ).toBe(true);
    });

    it('limits search results to the requested count', async () => {
      const limited = await adapter.searchProducts({ limit: 3 });
      expect(limited.length).toBe(3);
    });
  });

  describe('getProductById', () => {
    it('finds product by exact ID', async () => {
      const product = await adapter.getProductById('prod-ip16pm-256');
      expect(product).not.toBeNull();
      expect(product?.nameAr).toContain('آبل آيفون 16 برو ماكس');
      expect(product?.basePriceIQD).toBe(1875000);
    });

    it('finds product by SKU (case-insensitive)', async () => {
      const product = await adapter.getProductById('sam-s24u-256-gr');
      expect(product).not.toBeNull();
      expect(product?.id).toBe('prod-s24u-256');
    });

    it('returns null when product does not exist', async () => {
      const product = await adapter.getProductById('non-existent-id');
      expect(product).toBeNull();
    });
  });

  describe('checkStock', () => {
    it('returns stock for the single Karbala branch only', async () => {
      const stock = await adapter.checkStock('prod-ip16pm-256');
      expect(stock.map((s) => s.branchId)).toEqual(['branch-karbala']);
    });

    it('returns stock for a single specified branch', async () => {
      const karbalaStock = await adapter.checkStock('prod-ip16pm-256', 'branch-karbala');
      expect(karbalaStock.length).toBe(1);
      expect(karbalaStock[0]?.branchId).toBe('branch-karbala');
      expect(karbalaStock[0]?.quantity).toBeGreaterThan(0);
      expect(karbalaStock[0]?.available).toBe(true);
    });

    it('returns empty array if product does not exist', async () => {
      const empty = await adapter.checkStock('unknown-prod');
      expect(empty).toEqual([]);
    });
  });

  describe('getOffers', () => {
    it('returns valid promotional offers with discount percentages', async () => {
      const offers = await adapter.getOffers();
      expect(offers.length).toBeGreaterThan(0);
      for (const offer of offers) {
        expect(offer.id).toBeDefined();
        expect(offer.titleAr).toBeDefined();
        expect(offer.applicableProductIds.length).toBeGreaterThan(0);
        expect(offer.discountPct).toBeGreaterThan(0);
      }
    });
  });

  describe('reserveStock and releaseStock', () => {
    it('successfully reserves stock, decrements quantity, and tracks expiration', async () => {
      const initialStock = await adapter.checkStock('prod-ip16pm-256', 'branch-karbala');
      const startQty = initialStock[0]!.quantity;

      const result = await adapter.reserveStock([
        {
          productId: 'prod-ip16pm-256',
          quantity: 2,
          branchId: 'branch-karbala',
        },
      ]);

      expect(result.success).toBe(true);
      expect(result.reservationId).toMatch(/^res_/);
      expect(result.items).toEqual([
        { productId: 'prod-ip16pm-256', reserved: 2, status: 'ok' },
      ]);

      // Verify branch stock was decremented
      const postStock = await adapter.checkStock('prod-ip16pm-256', 'branch-karbala');
      expect(postStock[0]!.quantity).toBe(startQty - 2);

      // Verify active reservation is tracked
      const active = adapter.getActiveReservations();
      expect(active.length).toBe(1);
      expect(active[0]!.reservationId).toBe(result.reservationId);

      // Release stock and verify restoration
      await adapter.releaseStock(result.reservationId);
      const restoredStock = await adapter.checkStock('prod-ip16pm-256', 'branch-karbala');
      expect(restoredStock[0]!.quantity).toBe(startQty);

      expect(adapter.getActiveReservations().length).toBe(0);
    });

    it('fails atomically if any item has insufficient stock and preserves original quantities', async () => {
      const karbalaInitial = (await adapter.checkStock('prod-ip16pm-256', 'branch-karbala'))[0]!.quantity;
      const karbalaOtherInitial = (await adapter.checkStock('prod-s24u-256', 'branch-karbala'))[0]!.quantity;

      // Request an impossible quantity (9999 units) for one item
      const result = await adapter.reserveStock([
        {
          productId: 'prod-ip16pm-256',
          quantity: 1,
          branchId: 'branch-karbala',
        },
        {
          productId: 'prod-s24u-256',
          quantity: 9999, // Impossible quantity
          branchId: 'branch-karbala',
        },
      ]);

      expect(result.success).toBe(false);
      expect(result.reservationId).toBe('');
      expect(result.items[0]?.status).toBe('ok');
      expect(result.items[1]?.status).toBe('out_of_stock');
      expect(result.items[0]?.reserved).toBe(0);
      expect(result.items[1]?.reserved).toBe(0);

      // Verify ZERO quantities were deducted (atomic rollback guarantee)
      const karbalaPost = (await adapter.checkStock('prod-ip16pm-256', 'branch-karbala'))[0]!.quantity;
      const karbalaOtherPost = (await adapter.checkStock('prod-s24u-256', 'branch-karbala'))[0]!.quantity;

      expect(karbalaPost).toBe(karbalaInitial);
      expect(karbalaOtherPost).toBe(karbalaOtherInitial);
    });

    it('handles empty items array gracefully', async () => {
      const result = await adapter.reserveStock([]);
      expect(result.success).toBe(false);
      expect(result.items).toEqual([]);
    });

    it('ignores releasing non-existent or already released reservations', async () => {
      await expect(adapter.releaseStock('non-existent-res')).resolves.not.toThrow();
    });
  });
});
