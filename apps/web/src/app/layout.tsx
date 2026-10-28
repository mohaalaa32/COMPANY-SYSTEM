import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import type { ReactNode } from 'react';
import { brand } from '@tel/config/brand';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import '@/styles/globals.css';
import '@/styles/customer.css';
import '@/styles/dashboard.css';

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-plex-arabic',
});

export const metadata: Metadata = {
  title: {
    default: brand.fullTitleAr,
    template: `%s | ${brand.nameAr}`,
  },
  description: `${brand.fullTitleAr}: مساعد يساعدك تختار الموبايل والإكسسوارات المناسبة من فرع كربلاء باللهجة العراقية.`,
  applicationName: brand.fullTitleAr,
  icons: {
    icon: [{ url: brand.logo.src, type: 'image/png' }],
    apple: [{ url: brand.logo.src, type: 'image/png' }],
  },
  // Pre-release skeleton with demo data: keep it out of search indexes.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: brand.colors.lightBgIvory },
    { media: '(prefers-color-scheme: dark)', color: brand.colors.darkBg },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={brand.locale} dir={brand.dir} className={plexArabic.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
