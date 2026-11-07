'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  getAvailableProductSpecRows,
  type CustomerProductItem,
  type ProductSpecRow,
} from '@/lib/customer-search';
import { formatIQD } from '@/lib/format';
import { IconDevice } from '../icons';

export { getAvailableProductSpecRows, type ProductSpecRow };

export function StockBadge({ product }: { product: CustomerProductItem }) {
  return product.isAvailableInKarbala && product.karbalaQty > 0 ? (
    <span className="badge badge-success badge-dot" title="بيانات مخزون تجريبية لفرع كربلاء">
      متوفر بكربلاء (تجريبي)
    </span>
  ) : (
    <span className="badge badge-danger badge-dot" title="بيانات مخزون تجريبية لفرع كربلاء">
      غير متوفر (تجريبي)
    </span>
  );
}

export interface ProductCardInteractiveProps {
  product: CustomerProductItem;
  onAskProduct?: (product: CustomerProductItem) => void;
  onCompareProduct?: (product: CustomerProductItem) => void;
  compareCandidate?: CustomerProductItem | null;
  disabled?: boolean;
}

export function ProductDetailsDialog({
  product,
  onAskProduct,
  onCompareProduct,
  compareCandidate,
  disabled = false,
  fullWidthTrigger = false,
}: ProductCardInteractiveProps & { fullWidthTrigger?: boolean }) {
  const [open, setOpen] = useState(false);
  const specRows = getAvailableProductSpecRows(product);
  const isSelectedForCompare = compareCandidate?.id === product.id;
  const compareButtonLabel =
    compareCandidate && compareCandidate.id !== product.id
      ? `قارن مع ${compareCandidate.nameAr}`
      : 'قارن مع جهاز آخر';

  function handleAskClick() {
    if (disabled) return;
    setOpen(false);
    onAskProduct?.(product);
  }

  function handleCompareClick() {
    if (disabled) return;
    setOpen(false);
    onCompareProduct?.(product);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="default"
          fullWidth={fullWidthTrigger}
          disabled={disabled}
          data-testid={`view-details-${product.id}`}
          aria-label={`عرض تفاصيل ${product.nameAr}`}
        >
          عرض التفاصيل
        </Button>
      </DialogTrigger>
      <DialogContent data-testid={`product-details-dialog-${product.id}`}>
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2 pb-1">
            <StockBadge product={product} />
            <span className="badge badge-demo">بيانات تجريبية · فرع كربلاء</span>
          </div>
          <DialogTitle>{product.nameAr}</DialogTitle>
          <DialogDescription>
            <span className="ltr font-semibold">{product.nameEn}</span> · رمز الصنف:{' '}
            <span className="ltr font-mono">{product.sku}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="product-dialog-price-box">
          <div className="product-dialog-price-row">
            <span className="product-dialog-price-label">السعر التجريبي (فرع كربلاء):</span>
            <div className="product-dialog-price-values">
              <strong className="product-price">{formatIQD(product.priceIQD)}</strong>
              {product.hasDiscount && (
                <span className="product-dialog-old-price">{formatIQD(product.basePriceIQD)}</span>
              )}
            </div>
          </div>
          <p className="product-dialog-trial-note">
            هذه البيانات والأسعار من الكتالوج التجريبي المحلي لفرع كربلاء، ولا يُعدّ التفاعل هنا حجزاً أو طلباً نهائياً.
          </p>
        </div>

        <dl className="product-dialog-specs" aria-label="المواصفات المتوفرة في الكتالوج">
          {specRows.map((row) => (
            <div key={row.key} className="product-dialog-spec-row">
              <dt>{row.labelAr}</dt>
              <dd className={row.ltr ? 'ltr' : undefined}>{row.value}</dd>
            </div>
          ))}
        </dl>

        <DialogFooter>
          {onAskProduct && (
            <Button
              type="button"
              variant="default"
              disabled={disabled}
              onClick={handleAskClick}
              data-testid={`dialog-ask-${product.id}`}
            >
              اسأل عن الجهاز
            </Button>
          )}
          {onCompareProduct && product.category === 'phone' && (
            <Button
              type="button"
              variant="secondary"
              disabled={disabled || isSelectedForCompare}
              onClick={handleCompareClick}
              data-testid={`dialog-compare-${product.id}`}
            >
              {isSelectedForCompare ? 'محدد للمقارنة حالياً' : compareButtonLabel}
            </Button>
          )}
          <DialogClose asChild>
            <Button type="button" variant="outline" data-testid={`dialog-close-${product.id}`}>
              إغلاق
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProductMiniCard({
  product,
  onAskProduct,
  onCompareProduct,
  compareCandidate,
  disabled = false,
}: ProductCardInteractiveProps) {
  const isSelectedForCompare = compareCandidate?.id === product.id;
  const compareButtonLabel =
    compareCandidate && compareCandidate.id !== product.id
      ? 'قارن مع المحدد'
      : 'قارن مع جهاز آخر';

  return (
    <article
      className={`product-card${isSelectedForCompare ? ' product-card-selected-compare' : ''}`}
      aria-label={product.nameAr}
      data-product-id={product.id}
    >
      <div className="product-thumb" role="img" aria-label="لا توجد صورة منتج بعد">
        <IconDevice />
      </div>
      <h4 className="product-name ltr" title={product.nameAr}>
        {product.nameEn}
      </h4>
      <p className="product-name-sub-ar">{product.nameAr}</p>
      <div className="product-meta">
        <span className="product-price">{formatIQD(product.priceIQD)}</span>
        <StockBadge product={product} />
      </div>
      <div className="product-card-actions">
        <ProductDetailsDialog
          product={product}
          onAskProduct={onAskProduct}
          onCompareProduct={onCompareProduct}
          compareCandidate={compareCandidate}
          disabled={disabled}
          fullWidthTrigger
        />
        {(onAskProduct || (onCompareProduct && product.category === 'phone')) && (
          <div className="product-card-quick-actions">
            {onAskProduct && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={disabled}
                onClick={() => onAskProduct(product)}
                data-testid={`card-ask-${product.id}`}
                aria-label={`اسأل عن ${product.nameAr}`}
              >
                اسأل عن الجهاز
              </Button>
            )}
            {onCompareProduct && product.category === 'phone' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || isSelectedForCompare}
                onClick={() => onCompareProduct(product)}
                data-testid={`card-compare-${product.id}`}
                aria-label={`${compareButtonLabel}: ${product.nameAr}`}
              >
                {isSelectedForCompare ? 'محدد للمقارنة' : compareButtonLabel}
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export function ProductRowCard({
  product,
  onAskProduct,
  onCompareProduct,
  compareCandidate,
  disabled = false,
}: ProductCardInteractiveProps) {
  return (
    <article className="product-row" aria-label={product.nameAr} data-product-id={product.id}>
      <div className="product-row-body">
        <h4 className="product-name">{product.nameAr}</h4>
        <span className="product-price">{formatIQD(product.priceIQD)}</span>
        <div className="product-row-actions">
          <StockBadge product={product} />
          <ProductDetailsDialog
            product={product}
            onAskProduct={onAskProduct}
            onCompareProduct={onCompareProduct}
            compareCandidate={compareCandidate}
            disabled={disabled}
          />
          {onAskProduct && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => onAskProduct(product)}
              data-testid={`card-ask-${product.id}`}
            >
              اسأل عن الجهاز
            </Button>
          )}
        </div>
      </div>
      <div className="product-thumb product-row-thumb" role="img" aria-label="لا توجد صورة منتج بعد">
        <IconDevice />
      </div>
    </article>
  );
}

const COMPARE_ROWS: Array<{ labelAr: string; get: (p: CustomerProductItem) => string }> = [
  { labelAr: 'السعر (تجريبي)', get: (p) => formatIQD(p.priceIQD) },
  { labelAr: 'التخزين', get: (p) => p.specs.storage ?? '—' },
  { labelAr: 'الرام', get: (p) => p.specs.ram ?? '—' },
  { labelAr: 'الكاميرا', get: (p) => p.specs.camera ?? '—' },
  { labelAr: 'البطارية', get: (p) => p.specs.battery ?? '—' },
  { labelAr: 'المعالج', get: (p) => p.specs.processor ?? '—' },
  { labelAr: 'الضمان', get: (p) => `${p.warrantyMonths} شهر` },
];

export function CompareTable({ products }: { products: readonly CustomerProductItem[] }) {
  return (
    <section className="compare" aria-labelledby="compare-title">
      <header className="compare-head">
        <h3 id="compare-title">مقارنة سريعة</h3>
        <span className="badge badge-accent badge-dot">من الكتالوج التجريبي</span>
      </header>
      <div className="compare-scroll" role="region" aria-label="جدول مقارنة المنتجات" tabIndex={0}>
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col" className="compare-prop-col">الخاصية</th>
              {products.map((p) => (
                <th scope="col" key={p.id} className="compare-product-col">
                  <span className="compare-product-name-ar">{p.nameAr}</span>
                  <span className="compare-product-name-en ltr">{p.nameEn}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((row) => (
              <tr key={row.labelAr}>
                <th scope="row" className="compare-prop-col">{row.labelAr}</th>
                {products.map((p) => (
                  <td key={p.id} className="compare-val-cell">{row.get(p)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
