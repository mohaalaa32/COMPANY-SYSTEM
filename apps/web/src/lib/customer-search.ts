/**
 * Client-safe types, price-range validators, and race-condition guards for Customer Product Search (0-D1b).
 *
 * SECURITY RULE: This module must NOT import raw catalog objects from @tel/adapters so that `costIQD`
 * and margin data are never bundled into browser code.
 */

export type ProductCategory = 'phone' | 'tablet' | 'accessory' | 'audio' | 'wearable';

/**
 * Display-safe product item returned to the customer search UI.
 * Never includes `costIQD` or margin fields; preserves each SKU independently;
 * keeps original `nameAr` / `nameEn` untouched by search normalization.
 */
export interface CustomerProductItem {
  id: string;
  sku: string;
  nameAr: string;
  nameEn: string;
  brand: string;
  category: ProductCategory;
  priceIQD: number;
  basePriceIQD: number;
  hasDiscount: boolean;
  karbalaQty: number;
  isAvailableInKarbala: boolean;
  warrantyMonths: number;
  specs: {
    storage?: string;
    ram?: string;
    battery?: string;
    color?: string;
  };
}

export interface CustomerSearchFilters {
  query?: string;
  brand?: string;
  minPriceIQD?: number;
  maxPriceIQD?: number;
  inStockOnly?: boolean;
}

export interface CustomerSearchResponse {
  items: CustomerProductItem[];
  total: number;
  branchId: string;
  branchNameAr: string;
  isDemoData: true;
}

export const CATALOG_BRAND_OPTIONS = [
  { value: '', labelAr: 'كل العلامات التجارية' },
  { value: 'Apple', labelAr: 'Apple · آبل' },
  { value: 'Samsung', labelAr: 'Samsung · سامسونج' },
  { value: 'Xiaomi', labelAr: 'Xiaomi · شاومي' },
  { value: 'Infinix', labelAr: 'Infinix · إنفينيكس' },
  { value: 'Tecno', labelAr: 'Tecno · تكنو' },
  { value: 'Anker', labelAr: 'Anker · أنكر' },
  { value: 'Generic', labelAr: 'Generic · عام' },
] as const;

const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;
const MAX_ALLOWED_PRICE_IQD = 50_000_000;

/**
 * Converts Eastern Arabic (٠-٩) and Extended Arabic-Indic (۰-۹) digits to Western (0-9).
 */
export function normalizeNumericDigits(input: string): string {
  return input
    .replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - ARABIC_INDIC_ZERO))
    .replace(/[\u06F0-\u06F9]/g, (ch) => String(ch.charCodeAt(0) - EXTENDED_ARABIC_INDIC_ZERO));
}

export interface ParsedPriceResult {
  valid: boolean;
  value?: number;
  errorAr?: string;
}

/**
 * Parses an IQD price input that may use Arabic-Indic (٠-٩) or Western (0-9) digits
 * and optional thousand separators (`,` or `،` or spaces).
 * Rejects negative numbers, decimals, letters, or currency symbols.
 */
export function parsePriceInputIQD(raw: string): ParsedPriceResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { valid: true, value: undefined };
  }

  const normalized = normalizeNumericDigits(trimmed).replace(/[,،\s_]/g, '');

  if (!/^\d+$/.test(normalized)) {
    return {
      valid: false,
      errorAr: 'يرجى إدخال السعر بأرقام صحيحة فقط بالدينار العراقي (تُقبل الأرقام العربية ٠-٩ والإنجليزية 0-9).',
    };
  }

  const numeric = Number(normalized);
  if (!Number.isSafeInteger(numeric) || numeric < 0 || numeric > MAX_ALLOWED_PRICE_IQD) {
    return {
      valid: false,
      errorAr: 'قيمة السعر المدخلة خارج النطاق المسموح به.',
    };
  }

  return { valid: true, value: numeric };
}

export interface PriceRangeValidationResult {
  valid: boolean;
  minPriceIQD?: number;
  maxPriceIQD?: number;
  errorAr?: string;
}

/**
 * Validates both minimum and maximum IQD price inputs and ensures min <= max.
 */
export function validatePriceRange(minRaw: string, maxRaw: string): PriceRangeValidationResult {
  const minParsed = parsePriceInputIQD(minRaw);
  if (!minParsed.valid) {
    return { valid: false, errorAr: minParsed.errorAr };
  }

  const maxParsed = parsePriceInputIQD(maxRaw);
  if (!maxParsed.valid) {
    return { valid: false, errorAr: maxParsed.errorAr };
  }

  if (
    minParsed.value !== undefined &&
    maxParsed.value !== undefined &&
    minParsed.value > maxParsed.value
  ) {
    return {
      valid: false,
      errorAr: 'الحد الأدنى للسعر يجب أن يكون أقل من أو يساوي الحد الأقصى.',
    };
  }

  return {
    valid: true,
    minPriceIQD: minParsed.value,
    maxPriceIQD: maxParsed.value,
  };
}

/**
 * Builds the query string for `/api/products/search`.
 */
export function buildCustomerSearchQueryString(filters: CustomerSearchFilters): string {
  const params = new URLSearchParams();
  if (filters.query && filters.query.trim()) {
    params.set('q', filters.query.trim());
  }
  if (filters.brand && filters.brand.trim()) {
    params.set('brand', filters.brand.trim());
  }
  if (filters.minPriceIQD !== undefined) {
    params.set('minPrice', String(filters.minPriceIQD));
  }
  if (filters.maxPriceIQD !== undefined) {
    params.set('maxPrice', String(filters.maxPriceIQD));
  }
  if (filters.inStockOnly) {
    params.set('inStock', '1');
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Race-condition guard that ensures an older/slower search request can never overwrite
 * the results or state of a newer search request.
 */
export class LatestRequestGuard {
  private currentId = 0;
  private activeAbortController: AbortController | null = null;

  /**
   * Starts a new request, aborting any previous in-flight request, and returns its ticket.
   */
  public begin(): { requestId: number; signal: AbortSignal } {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }
    this.currentId += 1;
    this.activeAbortController = new AbortController();
    return {
      requestId: this.currentId,
      signal: this.activeAbortController.signal,
    };
  }

  /**
   * Returns true only if `requestId` is still the latest request started.
   */
  public isLatest(requestId: number): boolean {
    return requestId === this.currentId;
  }

  /**
   * Cancels any active request without starting a new one.
   */
  public cancelAll(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    this.currentId += 1;
  }
}

