import { brand } from '@tel/config/brand';
import { IconFlask } from './icons';

export function BrandMark({ tagline = brand.customerTaglineAr }: { tagline?: string }) {
  return (
    <span className="brand">
      <span className="brand-logo">
        <img
          src={brand.logo.src}
          alt={brand.logo.altAr}
          width={48}
          height={48}
          className="brand-logo-img"
        />
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
