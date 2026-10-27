import type {
  ISalesAdapter,
  Product,
  ProductSearchParams,
  BranchStock,
  Offer,
  StockReservationItem,
  StockReservationResult,
  ActiveStockReservation,
} from './types';
import { MOCK_PRODUCTS } from './data/products';
import { MOCK_OFFERS } from './data/offers';

const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

/**
 * Converts Eastern Arabic (٠-٩) and Extended Arabic-Indic (۰-۹) digits to Western (0-9).
 */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - ARABIC_INDIC_ZERO))
    .replace(/[\u06F0-\u06F9]/g, (ch) => String(ch.charCodeAt(0) - EXTENDED_ARABIC_INDIC_ZERO));
}

/**
 * Normalizes Arabic text for flexible, dialect-aware search matching (search-only; never mutates display names).
 * Handles common spelling variations:
 * - أ / إ / آ / ٱ -> ا
 * - ة -> ه
 * - ى -> ي
 * - Strips Arabic diacritics (Tashkeel) and Tatweel.
 * - Normalizes Arabic-Indic digits (٠-٩ / ۰-۹) to Western digits (0-9).
 */
export function normalizeArabicSearchText(input: string): string {
  return normalizeDigits(input)
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '') // Remove diacritics
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u0640]/g, '') // Remove Tatweel
    .toLowerCase()
    .trim();
}

/**
 * Explicit, testable mapping of canonical catalog brands to common Arabic, Iraqi, and Franco/misspelled variants.
 * Used strictly for token-level canonicalization so typos match the right brand without loose fuzzy matching.
 */
export const BRAND_SEARCH_ALIASES: Readonly<Record<string, readonly string[]>> = {
  Apple: ['apple', 'ابل', 'أبل', 'آبل', 'ابول', 'aple', 'appl'],
  Samsung: [
    'samsung',
    'سامسونج',
    'سامسونك',
    'سمسونج',
    'سمسونك',
    'سامسونغ',
    'samsong',
    'samsng',
    'smasung',
  ],
  Xiaomi: ['xiaomi', 'شاومي', 'شياومي', 'شيومي', 'xaomi', 'xiami', 'shiaomi', 'shawmi', 'xiomi'],
  Infinix: ['infinix', 'انفينيكس', 'انفينكس', 'انفنكس', 'انفنكيس', 'infnix', 'infinx'],
  Tecno: ['tecno', 'تكنو', 'تيكنو', 'tekno', 'techno'],
  Anker: ['anker', 'انكر', 'أنكر', 'انكار', 'ankr'],
  Generic: ['generic', 'عام'],
} as const;

/**
 * Explicit, testable mapping of product family / model terms to common Arabic & Franco variants.
 */
export const PRODUCT_TERM_ALIASES: Readonly<Record<string, readonly string[]>> = {
  iphone: ['iphone', 'ايفون', 'ايفن', 'ifone', 'iphon'],
  ipad: ['ipad', 'ايباد', 'aypad'],
  airpods: ['airpods', 'ايربودز', 'ايربودس', 'اربودز'],
  galaxy: ['galaxy', 'جالكسي', 'جالاكسي', 'كالكسي', 'كالاكسي', 'كلجسي', 'galaxi'],
  redmi: ['redmi', 'ريدمي', 'ردمي'],
  spark: ['spark', 'سبارك', 'سبرك'],
  ultra: ['ultra', 'الترا'],
  note: ['note', 'نوت'],
  watch: ['watch', 'واتش', 'ووتش', 'ساعه'],
  charger: ['charger', 'شاحن', 'شاحنه', 'شواحن'],
  cover: ['cover', 'case', 'كفر', 'كفرات', 'حافظه', 'جراب'],
} as const;

const BRAND_ALIAS_INDEX: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [canonicalBrand, aliases] of Object.entries(BRAND_SEARCH_ALIASES)) {
    map.set(normalizeArabicSearchText(canonicalBrand), canonicalBrand);
    for (const alias of aliases) {
      map.set(normalizeArabicSearchText(alias), canonicalBrand);
    }
  }
  return map;
})();

const TERM_ALIAS_INDEX: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [canonicalTerm, aliases] of Object.entries(PRODUCT_TERM_ALIASES)) {
    map.set(normalizeArabicSearchText(canonicalTerm), canonicalTerm);
    for (const alias of aliases) {
      map.set(normalizeArabicSearchText(alias), canonicalTerm);
    }
  }
  return map;
})();

/**
 * Resolves a brand input (in English, Arabic, or common Iraqi/Franco spelling) to its canonical catalog brand name.
 * Returns null if the input is not a recognized catalog brand.
 */
export function resolveCanonicalBrand(brandInput: string): string | null {
  const normalized = normalizeArabicSearchText(brandInput);
  if (!normalized) return null;
  return BRAND_ALIAS_INDEX.get(normalized) ?? null;
}

/**
 * Normalizes a single search token and maps it to a canonical brand or product term when an exact alias exists.
 */
export function canonicalizeSearchToken(rawToken: string): string {
  const normalized = normalizeArabicSearchText(rawToken);
  if (!normalized) return '';
  const canonicalBrand = BRAND_ALIAS_INDEX.get(normalized);
  if (canonicalBrand) {
    return canonicalBrand.toLowerCase();
  }
  const canonicalTerm = TERM_ALIAS_INDEX.get(normalized);
  if (canonicalTerm) {
    return canonicalTerm;
  }
  return normalized;
}

/**
 * Mock / In-Memory Sales API Adapter (Agent 4 & System Tool Calling)
 * Adheres strictly to docs/CONTRACTS.md §1.
 */
export class MockSalesAdapter implements ISalesAdapter {
  private initialProducts: Product[];
  private initialOffers: Offer[];
  private products: Map<string, Product> = new Map();
  private offers: Offer[] = [];
  private reservations: Map<string, ActiveStockReservation> = new Map();

  constructor(initialProducts: Product[] = MOCK_PRODUCTS, initialOffers: Offer[] = MOCK_OFFERS) {
    this.initialProducts = initialProducts;
    this.initialOffers = initialOffers;
    this.reset();
  }

  /**
   * Resets products and reservations to their pristine initial states.
   */
  public reset(): void {
    this.products.clear();
    for (const p of this.initialProducts) {
      this.products.set(p.id, this.cloneProduct(p));
    }
    this.offers = this.initialOffers.map((o) => ({
      ...o,
      applicableProductIds: [...o.applicableProductIds],
    }));
    this.reservations.clear();
  }

  /**
   * Search catalog products by text, category, brand, price range, tags, branch stock, and limit.
   */
  public async searchProducts(params: ProductSearchParams = {}): Promise<Product[]> {
    let results: Product[] = Array.from(this.products.values());

    // 1. Text Query Search (Arabic normalized + brand/term aliases + English case-insensitive)
    if (params.query && params.query.trim().length > 0) {
      const rawTokens = params.query.trim().split(/\s+/);
      const queryTokens = rawTokens
        .map((t) => ({
          rawNormalized: normalizeArabicSearchText(t),
          canonical: canonicalizeSearchToken(t),
          brandResolved: resolveCanonicalBrand(t),
        }))
        .filter((t) => t.canonical.length > 0);

      results = results.filter((p) => {
        const rawSegments = [
          normalizeArabicSearchText(p.nameAr),
          normalizeArabicSearchText(p.nameEn),
          normalizeArabicSearchText(p.brand),
          normalizeArabicSearchText(p.sku),
          ...p.tags.map(normalizeArabicSearchText),
          p.specs.storage ? normalizeArabicSearchText(p.specs.storage) : '',
          p.specs.ram ? normalizeArabicSearchText(p.specs.ram) : '',
          p.specs.processor ? normalizeArabicSearchText(p.specs.processor) : '',
          p.specs.color ? normalizeArabicSearchText(p.specs.color) : '',
        ].filter((s) => s.length > 0);

        const productWords = rawSegments
          .join(' ')
          .split(/[\s,/()]+/)
          .filter((w) => w.length > 0);

        const canonicalWordSet = new Set<string>();
        for (const w of productWords) {
          canonicalWordSet.add(w);
          canonicalWordSet.add(canonicalizeSearchToken(w));
        }
        const skuNormalized = normalizeArabicSearchText(p.sku);

        return queryTokens.every((qt) => {
          // Exact canonical word match (covers brand aliases, term aliases, and exact words)
          if (canonicalWordSet.has(qt.canonical) || canonicalWordSet.has(qt.rawNormalized)) {
            return true;
          }
          // If the token was explicitly resolved as a brand alias, do not fall back to partial substring matching
          if (qt.brandResolved !== null) {
            return p.brand.toLowerCase() === qt.brandResolved.toLowerCase();
          }
          // Prefix match on SKU (e.g. "APL-IP15") or word prefix/model token match (length >= 2)
          if (skuNormalized.startsWith(qt.rawNormalized) || skuNormalized.includes(qt.rawNormalized)) {
            return true;
          }
          if (qt.canonical.length >= 2) {
            for (const w of canonicalWordSet) {
              if (w.startsWith(qt.canonical) || (qt.canonical.length >= 3 && w.includes(qt.canonical))) {
                return true;
              }
            }
          }
          return false;
        });
      });
    }

    // 2. Category Filter
    if (params.category) {
      results = results.filter((p) => p.category === params.category);
    }

    // 3. Brand Filter (supports canonical brand name or any known Arabic/Franco brand alias)
    if (params.brand && params.brand.trim().length > 0) {
      const resolved = resolveCanonicalBrand(params.brand);
      const targetBrand = (resolved ?? params.brand.trim()).toLowerCase();
      results = results.filter((p) => p.brand.toLowerCase() === targetBrand);
    }

    // 4. Min Price Filter (IQD)
    if (params.minPriceIQD !== undefined) {
      const minPrice = params.minPriceIQD;
      results = results.filter((p) => {
        const effectivePrice = p.salePriceIQD ?? p.basePriceIQD;
        return effectivePrice >= minPrice;
      });
    }

    // 5. Max Price Filter (IQD)
    if (params.maxPriceIQD !== undefined) {
      const maxPrice = params.maxPriceIQD;
      results = results.filter((p) => {
        const effectivePrice = p.salePriceIQD ?? p.basePriceIQD;
        return effectivePrice <= maxPrice;
      });
    }

    // 6. Tags Filter (all requested tags must be present)
    if (params.tags && params.tags.length > 0) {
      const requestedTags = params.tags.map((t) => t.toLowerCase());
      results = results.filter((p) => {
        const pTags = p.tags.map((t) => t.toLowerCase());
        return requestedTags.every((req) => pTags.includes(req));
      });
    }

    // 7. Branch Stock Filter (product must have available stock in the specified branch)
    if (params.branchId && params.branchId.trim().length > 0) {
      const bId = params.branchId.trim();
      results = results.filter((p) =>
        p.branches.some((b) => b.branchId === bId && b.available && b.quantity > 0)
      );
    }

    // 8. Limit
    if (params.limit !== undefined && params.limit > 0) {
      results = results.slice(0, params.limit);
    }

    return results.map((p) => this.cloneProduct(p));
  }

  /**
   * Get a single product by its unique ID or SKU.
   */
  public async getProductById(id: string): Promise<Product | null> {
    const trimmed = id.trim();
    const product =
      this.products.get(trimmed) ??
      Array.from(this.products.values()).find(
        (p) => p.sku.toLowerCase() === trimmed.toLowerCase()
      );

    return product ? this.cloneProduct(product) : null;
  }

  /**
   * Check real-time stock across all branches or a specific branch.
   */
  public async checkStock(productId: string, branchId?: string): Promise<BranchStock[]> {
    const product = await this.getProductById(productId);
    if (!product) {
      return [];
    }

    if (branchId && branchId.trim().length > 0) {
      const targetBranchId = branchId.trim();
      const match = product.branches.find((b) => b.branchId === targetBranchId);
      return match ? [{ ...match }] : [];
    }

    return product.branches.map((b) => ({ ...b }));
  }

  /**
   * Get all active promotional offers.
   */
  public async getOffers(): Promise<Offer[]> {
    return this.offers.map((o) => ({
      ...o,
      applicableProductIds: [...o.applicableProductIds],
    }));
  }

  /**
   * Atomically reserve stock for one or more items in specific branches.
   * If any item is unavailable or insufficient, none are deducted.
   */
  public async reserveStock(items: StockReservationItem[]): Promise<StockReservationResult> {
    const nowIso = new Date().toISOString();

    if (!items || items.length === 0) {
      return {
        reservationId: '',
        success: false,
        expiresAt: nowIso,
        items: [],
      };
    }

    // Step 1: Pre-validation of stock availability across all requested items
    let allAvailable = true;
    const validationStatusList: Array<{ productId: string; canReserve: boolean }> = [];

    for (const item of items) {
      const product = this.products.get(item.productId);
      if (!product) {
        allAvailable = false;
        validationStatusList.push({ productId: item.productId, canReserve: false });
        continue;
      }

      const branch = product.branches.find((b) => b.branchId === item.branchId);
      const isSufficient = Boolean(
        branch && branch.available && branch.quantity >= item.quantity && item.quantity > 0
      );

      if (!isSufficient) {
        allAvailable = false;
      }
      validationStatusList.push({ productId: item.productId, canReserve: isSufficient });
    }

    // Step 2: If any item failed, return out_of_stock result without altering state
    if (!allAvailable) {
      return {
        reservationId: '',
        success: false,
        expiresAt: nowIso,
        items: items.map((it, idx) => ({
          productId: it.productId,
          reserved: 0,
          status: validationStatusList[idx]?.canReserve ? 'ok' : 'out_of_stock',
        })),
      };
    }

    // Step 3: Atomic stock deduction
    const reservationId = `res_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 mins TTL

    for (const item of items) {
      const product = this.products.get(item.productId)!;
      const branch = product.branches.find((b) => b.branchId === item.branchId)!;

      branch.quantity -= item.quantity;
      branch.available = branch.quantity > 0;
      product.totalStock = product.branches.reduce((sum, b) => sum + b.quantity, 0);
      product.isAvailable = product.totalStock > 0;
    }

    // Step 4: Record active reservation
    this.reservations.set(reservationId, {
      reservationId,
      createdAt: nowIso,
      expiresAt,
      released: false,
      items: items.map((i) => ({ ...i })),
    });

    return {
      reservationId,
      success: true,
      expiresAt,
      items: items.map((it) => ({
        productId: it.productId,
        reserved: it.quantity,
        status: 'ok',
      })),
    };
  }

  /**
   * Release a previously held stock reservation and restore branch quantities.
   */
  public async releaseStock(reservationId: string): Promise<void> {
    const reservation = this.reservations.get(reservationId);
    if (!reservation || reservation.released) {
      return;
    }

    for (const item of reservation.items) {
      const product = this.products.get(item.productId);
      if (!product) continue;

      const branch = product.branches.find((b) => b.branchId === item.branchId);
      if (!branch) continue;

      branch.quantity += item.quantity;
      branch.available = branch.quantity > 0;
      product.totalStock = product.branches.reduce((sum, b) => sum + b.quantity, 0);
      product.isAvailable = product.totalStock > 0;
    }

    reservation.released = true;
  }

  /**
   * Inspection helper for tests and verification: list active reservations.
   */
  public getActiveReservations(): ActiveStockReservation[] {
    return Array.from(this.reservations.values()).filter((r) => !r.released);
  }

  /**
   * Deep clone helper for products.
   */
  private cloneProduct(p: Product): Product {
    return {
      ...p,
      specs: { ...p.specs },
      branches: p.branches.map((b) => ({ ...b })),
      tags: [...p.tags],
    };
  }
}

/** Backward compatibility alias */
export const InMemorySalesAdapter = MockSalesAdapter;
