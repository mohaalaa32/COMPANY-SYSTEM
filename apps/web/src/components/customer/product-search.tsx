'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { DemoBadge } from '@/components/brand';
import { IconDevice, IconInfo, IconSearch, IconX } from '@/components/icons';
import {
  buildCustomerSearchQueryString,
  CATALOG_BRAND_OPTIONS,
  LatestRequestGuard,
  validatePriceRange,
  type CustomerProductItem,
  type CustomerSearchFilters,
  type CustomerSearchResponse,
} from '@/lib/customer-search';
import { formatIQD } from '@/lib/format';

interface CustomerProductSearchProps {
  initialItems: CustomerProductItem[];
  branchNameAr: string;
}

type SearchStatus = 'idle' | 'loading' | 'error';

export function CustomerProductSearch({
  initialItems,
  branchNameAr,
}: CustomerProductSearchProps) {
  const [query, setQuery] = useState<string>('');
  const [brandFilter, setBrandFilter] = useState<string>('');
  const [minPriceRaw, setMinPriceRaw] = useState<string>('');
  const [maxPriceRaw, setMaxPriceRaw] = useState<string>('');
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);

  const [items, setItems] = useState<CustomerProductItem[]>(initialItems);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [errorMessageAr, setErrorMessageAr] = useState<string | null>(null);
  const [validationErrorAr, setValidationErrorAr] = useState<string | null>(null);

  const requestGuardRef = useRef<LatestRequestGuard | null>(null);
  if (!requestGuardRef.current) {
    requestGuardRef.current = new LatestRequestGuard();
  }
  const isFirstRenderRef = useRef<boolean>(true);

  const runSearch = useCallback(
    async (filters: CustomerSearchFilters) => {
      const guard = requestGuardRef.current!;
      const { requestId, signal } = guard.begin();

      setStatus('loading');
      setErrorMessageAr(null);

      try {
        const qs = buildCustomerSearchQueryString(filters);
        const response = await fetch(`/api/products/search${qs}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal,
        });

        if (!guard.isLatest(requestId)) {
          return;
        }

        if (!response.ok) {
          const errBody = (await response.json().catch(() => ({}))) as { errorAr?: string };
          throw new Error(errBody.errorAr || 'تعذر تحميل نتائج البحث من الكتالوج التجريبي.');
        }

        const data = (await response.json()) as CustomerSearchResponse;
        if (!guard.isLatest(requestId)) {
          return;
        }

        setItems(data.items);
        setStatus('idle');
      } catch (err: unknown) {
        if (!guard.isLatest(requestId)) {
          return;
        }
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setStatus('error');
        setErrorMessageAr(
          err instanceof Error && err.message
            ? err.message
            : 'تعذر تحديث نتائج البحث حالياً. يرجى المحاولة مرة أخرى.'
        );
      }
    },
    []
  );

  // Validate price inputs and trigger search automatically when filters change
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }

    const priceValidation = validatePriceRange(minPriceRaw, maxPriceRaw);
    if (!priceValidation.valid) {
      requestGuardRef.current?.cancelAll();
      setValidationErrorAr(priceValidation.errorAr ?? 'نطاق السعر غير صالح.');
      setStatus('idle');
      return;
    }

    setValidationErrorAr(null);

    const timer = setTimeout(() => {
      void runSearch({
        query,
        brand: brandFilter || undefined,
        minPriceIQD: priceValidation.minPriceIQD,
        maxPriceIQD: priceValidation.maxPriceIQD,
        inStockOnly,
      });
    }, 180);

    return () => clearTimeout(timer);
  }, [query, brandFilter, minPriceRaw, maxPriceRaw, inStockOnly, runSearch]);

  const handleFormSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const priceValidation = validatePriceRange(minPriceRaw, maxPriceRaw);
    if (!priceValidation.valid) {
      requestGuardRef.current?.cancelAll();
      setValidationErrorAr(priceValidation.errorAr ?? 'نطاق السعر غير صالح.');
      return;
    }
    setValidationErrorAr(null);
    void runSearch({
      query,
      brand: brandFilter || undefined,
      minPriceIQD: priceValidation.minPriceIQD,
      maxPriceIQD: priceValidation.maxPriceIQD,
      inStockOnly,
    });
  };

  const handleRetry = () => {
    const priceValidation = validatePriceRange(minPriceRaw, maxPriceRaw);
    if (!priceValidation.valid) {
      setValidationErrorAr(priceValidation.errorAr ?? 'نطاق السعر غير صالح.');
      return;
    }
    setValidationErrorAr(null);
    void runSearch({
      query,
      brand: brandFilter || undefined,
      minPriceIQD: priceValidation.minPriceIQD,
      maxPriceIQD: priceValidation.maxPriceIQD,
      inStockOnly,
    });
  };

  const handleResetFilters = () => {
    requestGuardRef.current?.cancelAll();
    isFirstRenderRef.current = true;
    setQuery('');
    setBrandFilter('');
    setMinPriceRaw('');
    setMaxPriceRaw('');
    setInStockOnly(false);
    setValidationErrorAr(null);
    setErrorMessageAr(null);
    setStatus('idle');
    setItems(initialItems);
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && query.length > 0) {
      e.preventDefault();
      setQuery('');
    }
  };

  const hasActiveFilters = Boolean(
    query.trim() || brandFilter || minPriceRaw.trim() || maxPriceRaw.trim() || inStockOnly
  );

  return (
    <section
      className="catalog-search-section card animate-in"
      id="customer-catalog-search"
      aria-labelledby="catalog-search-title"
    >
      <header className="catalog-search-head">
        <div className="catalog-search-title-wrap">
          <h2 id="catalog-search-title">بحث المنتجات في {branchNameAr}</h2>
          <p className="catalog-search-subtitle">
            ابحث بالعربية أو الإنجليزية أو بالتهجئة الدارجة (مثل: آيفون ١٦، سامسونك، انفنكس، كالكسي A55)
          </p>
        </div>
        <div className="catalog-search-badges">
          <span className="badge badge-primary badge-dot">{branchNameAr} فقط</span>
          <DemoBadge label="كتالوج تجريبي" />
        </div>
      </header>

      <form className="catalog-search-form" onSubmit={handleFormSubmit} noValidate>
        <div className="catalog-search-bar-row">
          <div className="catalog-search-input-wrap">
            <IconSearch />
            <label htmlFor="customer-product-search" className="sr-only">
              ابحث عن منتج بالاسم أو الماركة أو الرمز
            </label>
            <input
              id="customer-product-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="ابحث بالاسم أو الماركة أو الرمز (مثال: آيفون ١٦، سامسونك، انفنكس)..."
              autoComplete="off"
            />
            {query.length > 0 && (
              <button
                type="button"
                className="catalog-search-clear"
                onClick={() => setQuery('')}
                aria-label="مسح نص البحث"
                title="مسح نص البحث (Esc)"
              >
                <IconX />
              </button>
            )}
          </div>
          <button type="submit" id="customer-search-submit" className="btn btn-primary">
            بحث
          </button>
        </div>

        <div className="catalog-filters-grid" role="group" aria-label="فلاتر البحث">
          <div className="catalog-filter-field">
            <label htmlFor="customer-brand-filter">العلامة التجارية</label>
            <select
              id="customer-brand-filter"
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
            >
              {CATALOG_BRAND_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.labelAr}
                </option>
              ))}
            </select>
          </div>

          <div className="catalog-filter-field">
            <label htmlFor="customer-min-price">السعر من (د.ع)</label>
            <input
              id="customer-min-price"
              type="text"
              inputMode="numeric"
              value={minPriceRaw}
              onChange={(e) => setMinPriceRaw(e.target.value)}
              placeholder="مثال: ١٥٠,٠٠٠ أو 150000"
              aria-invalid={Boolean(validationErrorAr)}
              aria-describedby={validationErrorAr ? 'customer-price-error' : undefined}
            />
          </div>

          <div className="catalog-filter-field">
            <label htmlFor="customer-max-price">السعر إلى (د.ع)</label>
            <input
              id="customer-max-price"
              type="text"
              inputMode="numeric"
              value={maxPriceRaw}
              onChange={(e) => setMaxPriceRaw(e.target.value)}
              placeholder="مثال: ٥٠٠,٠٠٠ أو 500000"
              aria-invalid={Boolean(validationErrorAr)}
              aria-describedby={validationErrorAr ? 'customer-price-error' : undefined}
            />
          </div>

          <div className="catalog-filter-actions">
            <label className="catalog-instock-toggle" htmlFor="customer-instock-filter">
              <input
                id="customer-instock-filter"
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
              />
              <span>المتوفر بالمخزون فقط ({branchNameAr})</span>
            </label>

            {hasActiveFilters && (
              <button
                type="button"
                id="customer-search-reset"
                className="btn btn-secondary"
                onClick={handleResetFilters}
              >
                إعادة ضبط الفلاتر
              </button>
            )}
          </div>
        </div>
      </form>

      {validationErrorAr && (
        <div className="catalog-feedback catalog-feedback-error" id="customer-price-error" role="alert">
          <IconInfo />
          <span>{validationErrorAr}</span>
        </div>
      )}

      {status === 'loading' && (
        <div className="catalog-feedback catalog-feedback-loading" role="status" aria-live="polite" aria-busy="true">
          <span className="catalog-spinner" aria-hidden="true" />
          <span>جاري البحث في كتالوج {branchNameAr} التجريبي...</span>
        </div>
      )}

      {status === 'error' && errorMessageAr && (
        <div className="catalog-feedback catalog-feedback-error" role="alert">
          <IconInfo />
          <span>{errorMessageAr}</span>
          <button
            type="button"
            id="customer-search-retry"
            className="btn btn-secondary"
            onClick={handleRetry}
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      <div className="catalog-results-meta" aria-live="polite">
        <span>
          عرض <strong>{items.length}</strong> منتج من الكتالوج التجريبي ({branchNameAr} فقط · كل صنف مستقل برمز SKU)
        </span>
      </div>

      {!validationErrorAr && status !== 'error' && items.length === 0 ? (
        <div className="catalog-empty-state" id="customer-search-empty" role="status">
          <p className="catalog-empty-title">لا توجد منتجات مطابقة لبحثك في {branchNameAr}.</p>
          <p className="catalog-empty-sub">
            جرّب تعديل الكلمات المفتاحية أو توسيع نطاق السعر أو إلغاء فلتر التوفر بالمخزون.
          </p>
          {hasActiveFilters && (
            <button type="button" className="btn btn-primary" onClick={handleResetFilters}>
              عرض كل المنتجات التجريبية
            </button>
          )}
        </div>
      ) : (
        <div className="catalog-results-grid" role="list" aria-label="نتائج البحث في المنتجات">
          {items.map((item) => (
            <article
              key={item.id}
              role="listitem"
              className="catalog-item-card"
              aria-label={item.nameAr}
            >
              <div className="catalog-item-top">
                <div className="product-thumb catalog-item-thumb" role="img" aria-label="معاينة رمز المنتج">
                  <IconDevice />
                </div>
                <div className="catalog-item-badges">
                  {item.isAvailableInKarbala ? (
                    <span className="badge badge-success badge-dot">
                      متوفر بكربلاء ({item.karbalaQty})
                    </span>
                  ) : (
                    <span className="badge badge-danger badge-dot">غير متوفر بكربلاء</span>
                  )}
                  <span className="badge ltr" title="رمز الصنف المستقل">
                    {item.sku}
                  </span>
                </div>
              </div>

              <div className="catalog-item-body">
                <h3 className="catalog-item-title-ar">{item.nameAr}</h3>
                <p className="catalog-item-title-en ltr">{item.nameEn}</p>

                <div className="catalog-item-specs">
                  {item.specs.storage && <span className="badge">{item.specs.storage}</span>}
                  {item.specs.ram && <span className="badge">رام {item.specs.ram}</span>}
                  {item.specs.color && <span className="badge">{item.specs.color}</span>}
                  <span className="badge">الضمان: {item.warrantyMonths} شهر</span>
                </div>
              </div>

              <div className="catalog-item-foot">
                <div className="catalog-item-price-group">
                  <span className="product-price">{formatIQD(item.priceIQD)}</span>
                  {item.hasDiscount && (
                    <span className="catalog-item-old-price">{formatIQD(item.basePriceIQD)}</span>
                  )}
                </div>
                <span className="badge badge-demo">سعر تجريبي</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

