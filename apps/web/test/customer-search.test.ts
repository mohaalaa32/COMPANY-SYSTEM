import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { KARBALA_BRANCH_ID } from '@tel/adapters';
import { GET as searchProductsGET } from '../src/app/api/products/search/route';
import {
  buildCustomerSearchQueryString,
  LatestRequestGuard,
  parsePriceInputIQD,
  validatePriceRange,
  type CustomerSearchResponse,
} from '../src/lib/customer-search';
import { searchCustomerCatalog } from '../src/lib/demo-data';

describe('Customer Product Search (0-D1b)', () => {
  describe('Arabic normalization, dialect/Franco brand aliases, and display preservation', () => {
    it('matches Arabic spelling variations (Alef, Yaa, Taa Marbuta, Tashkeel, Arabic digits) while keeping original display names', async () => {
      const res1 = await searchCustomerCatalog({ query: 'آيْفُون ١٦' });
      const res2 = await searchCustomerCatalog({ query: 'ايفون 16' });

      expect(res1.items.length).toBeGreaterThan(0);
      expect(res1.items.map((i) => i.id)).toEqual(res2.items.map((i) => i.id));
      // Display names must remain untouched (with original hamza/madda)
      const ip16 = res1.items.find((i) => i.id === 'prod-ip16pm-256');
      expect(ip16).toBeDefined();
      expect(ip16?.nameAr).toBe('آبل آيفون 16 برو ماكس 256 كيكابايت');
      expect(ip16?.nameEn).toBe('Apple iPhone 16 Pro Max 256GB');

      // Taa Marbuta vs Haa ("ساعة" vs "ساعه")
      const watchWithTaa = await searchCustomerCatalog({ query: 'ساعة' });
      const watchWithHaa = await searchCustomerCatalog({ query: 'ساعه' });
      expect(watchWithTaa.items.length).toBeGreaterThan(0);
      expect(watchWithTaa.items.map((i) => i.id)).toEqual(watchWithHaa.items.map((i) => i.id));
    });

    it('matches common Iraqi and Franco brand/model spellings without loose false positives', async () => {
      const samsungAlias = await searchCustomerCatalog({ query: 'سامسونك كالكسي a55' });
      const samsungFranco = await searchCustomerCatalog({ query: 'samsong galaxi a55' });
      expect(samsungAlias.items.length).toBeGreaterThan(0);
      expect(samsungAlias.items.map((i) => i.id)).toEqual(samsungFranco.items.map((i) => i.id));
      expect(samsungAlias.items.every((i) => i.brand === 'Samsung')).toBe(true);

      const infinixShort = await searchCustomerCatalog({ query: 'انفنكس نوت ٤٠' });
      expect(infinixShort.items.length).toBe(1);
      expect(infinixShort.items[0]?.id).toBe('prod-inf-n40-256');

      const xiaomiVariant = await searchCustomerCatalog({ query: 'شياومي ردمي 13c' });
      expect(xiaomiVariant.items.length).toBe(1);
      expect(xiaomiVariant.items[0]?.id).toBe('prod-redmi-13c-128');

      // Unrelated queries must return empty results (no fuzzy false positives)
      const unrelated = await searchCustomerCatalog({ query: 'تلفزيون سوني بلايستيشن' });
      expect(unrelated.items).toEqual([]);
      expect(unrelated.total).toBe(0);
    });
  });

  describe('Combined filters, price boundaries, out-of-stock handling, and independent SKUs', () => {
    it('keeps similar product names as independent SKUs without merging stock', async () => {
      const a55All = await searchCustomerCatalog({
        query: 'جالكسي A55',
        brand: 'Samsung',
        inStockOnly: false,
      });

      const a55256 = a55All.items.find((i) => i.id === 'prod-a55-256');
      const a55128 = a55All.items.find((i) => i.id === 'prod-a55-128');

      expect(a55256).toBeDefined();
      expect(a55128).toBeDefined();
      expect(a55256?.sku).toBe('SAM-A55-256-NV');
      expect(a55128?.sku).toBe('SAM-A55-128-BL');
      expect(a55256?.karbalaQty).toBe(32);
      expect(a55256?.isAvailableInKarbala).toBe(true);
      expect(a55128?.karbalaQty).toBe(0);
      expect(a55128?.isAvailableInKarbala).toBe(false);
    });

    it('filters out-of-stock Karbala items when inStockOnly is enabled', async () => {
      const inStockA55 = await searchCustomerCatalog({
        query: 'جالكسي A55',
        brand: 'Samsung',
        inStockOnly: true,
      });

      expect(inStockA55.items.some((i) => i.id === 'prod-a55-256')).toBe(true);
      expect(inStockA55.items.some((i) => i.id === 'prod-a55-128')).toBe(false);
      expect(inStockA55.items.every((i) => i.isAvailableInKarbala && i.karbalaQty > 0)).toBe(true);
    });

    it('applies query, brand, minPriceIQD, maxPriceIQD, and inStockOnly filters together', async () => {
      const combined = await searchCustomerCatalog({
        query: 'كالكسي',
        brand: 'Samsung',
        minPriceIQD: 425000,
        maxPriceIQD: 475000,
        inStockOnly: true,
      });

      // prod-a55-256 is 475,000 IQD (in stock); prod-a55-128 is 425,000 IQD (out of stock)
      expect(combined.items.map((i) => i.id)).toEqual(['prod-a55-256']);

      // Exact boundary inclusion when inStockOnly is false
      const withOutOfStock = await searchCustomerCatalog({
        query: 'كالكسي',
        brand: 'Samsung',
        minPriceIQD: 425000,
        maxPriceIQD: 475000,
        inStockOnly: false,
      });
      expect(withOutOfStock.items.map((i) => i.id)).toEqual(['prod-a55-256', 'prod-a55-128']);
    });

    it('never leaks costIQD or margin data in customer search items', async () => {
      const all = await searchCustomerCatalog({});
      expect(all.branchId).toBe(KARBALA_BRANCH_ID);
      expect(all.isDemoData).toBe(true);
      expect(all.items.length).toBeGreaterThan(15);

      for (const item of all.items) {
        const raw = item as unknown as Record<string, unknown>;
        expect(raw.costIQD).toBeUndefined();
        expect(raw.minMarginPct).toBeUndefined();
        expect(item.warrantyMonths).toBeGreaterThan(0);
      }
    });
  });

  describe('Price input parsing (Arabic & Western digits) and validation', () => {
    it('parses Arabic-Indic and Western digits with thousand separators', () => {
      expect(parsePriceInputIQD('')).toEqual({ valid: true, value: undefined });
      expect(parsePriceInputIQD('150,000')).toEqual({ valid: true, value: 150000 });
      expect(parsePriceInputIQD('١٥٠،٠٠٠')).toEqual({ valid: true, value: 150000 });
      expect(parsePriceInputIQD(' ٤٧٥٠٠٠ ')).toEqual({ valid: true, value: 475000 });
    });

    it('rejects negative, non-numeric, and inverted min > max price inputs', () => {
      expect(parsePriceInputIQD('-5000').valid).toBe(false);
      expect(parsePriceInputIQD('100abc').valid).toBe(false);
      expect(parsePriceInputIQD('150.5').valid).toBe(false);

      const inverted = validatePriceRange('٥٠٠٠٠٠', '٢٠٠٠٠٠');
      expect(inverted.valid).toBe(false);
      expect(inverted.errorAr).toContain('الحد الأدنى');

      const validRange = validatePriceRange('١٥٠,٠٠٠', '500,000');
      expect(validRange).toEqual({
        valid: true,
        minPriceIQD: 150000,
        maxPriceIQD: 500000,
      });
    });

    it('builds clean query strings for the search endpoint', () => {
      const qs = buildCustomerSearchQueryString({
        query: 'آيفون',
        brand: 'Apple',
        minPriceIQD: 100000,
        maxPriceIQD: 2000000,
        inStockOnly: true,
      });
      expect(qs).toContain('brand=Apple');
      expect(qs).toContain('minPrice=100000');
      expect(qs).toContain('maxPrice=2000000');
      expect(qs).toContain('inStock=1');
    });
  });

  describe('LatestRequestGuard (stale search result prevention)', () => {
    it('invalidates and aborts older requests when a newer search begins', () => {
      const guard = new LatestRequestGuard();
      const first = guard.begin();
      expect(guard.isLatest(first.requestId)).toBe(true);
      expect(first.signal.aborted).toBe(false);

      const second = guard.begin();
      expect(first.signal.aborted).toBe(true);
      expect(guard.isLatest(first.requestId)).toBe(false);
      expect(guard.isLatest(second.requestId)).toBe(true);

      guard.cancelAll();
      expect(second.signal.aborted).toBe(true);
      expect(guard.isLatest(second.requestId)).toBe(false);
    });
  });

  describe('API Route GET /api/products/search', () => {
    it('returns filtered Karbala products with HTTP 200 and zero costIQD leak', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/products/search?q=%D8%B3%D8%A7%D9%85%D8%B3%D9%88%D9%86%D9%83&brand=Samsung&minPrice=%D9%A4%D9%A0%D9%A0%D9%A0%D9%A0%D9%A0&maxPrice=500000&inStock=1'
      );
      const res = await searchProductsGET(req);
      expect(res.status).toBe(200);

      const body = (await res.json()) as CustomerSearchResponse;
      expect(body.branchId).toBe(KARBALA_BRANCH_ID);
      expect(body.isDemoData).toBe(true);
      expect(body.items.map((i) => i.id)).toEqual(['prod-a55-256']);
      expect(JSON.stringify(body)).not.toContain('costIQD');
    });

    it('returns HTTP 400 with Arabic error message when price inputs are invalid', async () => {
      const badReq = new NextRequest(
        'http://localhost:3000/api/products/search?minPrice=abc'
      );
      const badRes = await searchProductsGET(badReq);
      expect(badRes.status).toBe(400);
      const errBody = (await badRes.json()) as { errorAr: string };
      expect(errBody.errorAr).toBeDefined();
    });
  });
});
