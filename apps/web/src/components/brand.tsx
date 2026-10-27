import { brand } from '@tel/config/brand';
import { IconFlask } from './icons';

export function BrandMark({ tagline = brand.productAr }: { tagline?: string }) {
  return (
    <span className="brand">
      <span className="brand-logo" aria-hidden="true">
        {brand.monogram}
      </span>
      <span className="brand-text">
        <span className="brand-name">{brand.nameAr}</span>
        <span className="brand-tagline">{tagline}</span>
      </span>
    </span>
  );
}

/** Persistent strip that states the page shows demo data only. */
export function DemoBanner({ text }: { text: string }) {
  return (
    <div className="demo-banner" role="note" id="demo-banner">
      <IconFlask />
      <span>{text}</span>
    </div>
  );
}

export function DemoBadge({ label = 'بيانات تجريبية' }: { label?: string }) {
  return <span className="badge badge-demo">{label}</span>;
}
