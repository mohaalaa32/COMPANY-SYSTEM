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

/**
 * Normalizes Arabic text for flexible, dialect-aware search matching.
 * Handles common spelling variations:
 * - أ / إ / آ / ٱ -> ا
 * - ة -> ه
 * - ى -> ي
 * - Strips Arabic diacritics (Tashkeel).
 */
export function normalizeArabicSearchText(input: string): string {
  return input
    .replace(/[\u064B-\u065F\u0670]/g, '') // Remove diacritics
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u0640]/g, '') // Remove Tatweel
    .toLowerCase()
    .trim();
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

    // 1. Text Query Search (Arabic normalized + English case-insensitive)
    if (params.query && params.query.trim().length > 0) {
      const rawTokens = params.query.trim().split(/\s+/);
      const normalizedTokens = rawTokens.map(normalizeArabicSearchText).filter((t) => t.length > 0);

      results = results.filter((p) => {
        const searchableFields = [
          normalizeArabicSearchText(p.nameAr),
          p.nameEn.toLowerCase(),
          p.brand.toLowerCase(),
          p.sku.toLowerCase(),
          ...p.tags.map((t) => t.toLowerCase()),
          p.specs.storage ? normalizeArabicSearchText(p.specs.storage) : '',
          p.specs.ram ? normalizeArabicSearchText(p.specs.ram) : '',
          p.specs.processor ? normalizeArabicSearchText(p.specs.processor) : '',
          p.specs.color ? normalizeArabicSearchText(p.specs.color) : '',
        ].join(' ');

        return normalizedTokens.every((token) => searchableFields.includes(token));
      });
    }

    // 2. Category Filter
    if (params.category) {
      results = results.filter((p) => p.category === params.category);
    }

    // 3. Brand Filter
    if (params.brand && params.brand.trim().length > 0) {
      const targetBrand = params.brand.trim().toLowerCase();
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
