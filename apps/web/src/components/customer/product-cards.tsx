import type { Product } from '@tel/adapters';
import { displayPriceIQD, karbalaQuantity } from '@/lib/demo-data';
import { formatIQD } from '@/lib/format';
import { IconDevice } from '../icons';

export function StockBadge({ product }: { product: Product }) {
  const qty = karbalaQuantity(product);
  return qty > 0 ? (
    <span className="badge badge-success badge-dot">متوفر بكربلاء</span>
  ) : (
    <span className="badge badge-danger badge-dot">غير متوفر</span>
  );
}

export function ProductMiniCard({ product }: { product: Product }) {
  return (
    <article className="product-card" aria-label={product.nameAr}>
      <div className="product-thumb" role="img" aria-label="لا توجد صورة منتج بعد">
        <IconDevice />
      </div>
      <h4 className="product-name ltr" title={product.nameAr}>
        {product.nameEn}
      </h4>
      <div className="product-meta">
        <span className="product-price">{formatIQD(displayPriceIQD(product))}</span>
        <StockBadge product={product} />
      </div>
      <button type="button" className="btn btn-primary btn-block" disabled title="غير مفعّل في هذه المعاينة">
        عرض التفاصيل
      </button>
    </article>
  );
}

export function ProductRowCard({ product }: { product: Product }) {
  return (
    <article className="product-row" aria-label={product.nameAr}>
      <div className="product-row-body">
        <h4 className="product-name">{product.nameAr}</h4>
        <span className="product-price">{formatIQD(displayPriceIQD(product))}</span>
        <div className="product-row-actions">
          <StockBadge product={product} />
          <button type="button" className="btn btn-primary" disabled title="غير مفعّل في هذه المعاينة">
            عرض التفاصيل
          </button>
        </div>
      </div>
      <div className="product-thumb product-row-thumb" role="img" aria-label="لا توجد صورة منتج بعد">
        <IconDevice />
      </div>
    </article>
  );
}

const COMPARE_ROWS: Array<{ labelAr: string; get: (p: Product) => string }> = [
  { labelAr: 'السعر', get: (p) => formatIQD(displayPriceIQD(p)) },
  { labelAr: 'التخزين', get: (p) => p.specs.storage ?? '—' },
  { labelAr: 'الرام', get: (p) => p.specs.ram ?? '—' },
  { labelAr: 'البطارية', get: (p) => p.specs.battery ?? '—' },
  { labelAr: 'الضمان', get: (p) => `${p.specs.warrantyMonths} شهر` },
];

export function CompareTable({ products }: { products: readonly Product[] }) {
  return (
    <section className="compare" aria-labelledby="compare-title">
      <header className="compare-head">
        <h3 id="compare-title">مقارنة سريعة</h3>
        <span className="badge badge-accent badge-dot">من الكتالوج التجريبي</span>
      </header>
      <div className="compare-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">الخاصية</th>
              {products.map((p) => (
                <th scope="col" key={p.id} className="ltr">
                  {p.nameEn}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((row) => (
              <tr key={row.labelAr}>
                <th scope="row">{row.labelAr}</th>
                {products.map((p) => (
                  <td key={p.id}>{row.get(p)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
