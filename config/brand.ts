/**
 * SINGLE SOURCE OF TRUTH for all branding.
 *
 * Every UI string, prompt, seed record or doc that mentions the company MUST
 * import from here. Never hard-code the company name anywhere else.
 * `pnpm check:brand` fails the build if a forbidden legacy name appears in the repo.
 */
export const brand = {
  /** Company name (Arabic) */
  nameAr: 'تِل بغداد',
  /** Company name (English) */
  nameEn: 'Tel Baghdad',
  /** Product name */
  productAr: 'مساعد المبيعات الذكي',
  productEn: 'AI Sales Assistant',
  /** Secondary subtitle in the customer header (/) */
  customerTaglineAr: 'مساعد المبيعات',
  /** Secondary subtitle in the staff dashboard brand area (/dashboard) */
  staffTaglineAr: 'لوحة الموظفين',
  /** Official logo asset metadata */
  logo: {
    src: '/brand/gold-logo.png',
    altAr: 'شعار تِل بغداد',
  },
  /** Approved UI color palette for the Tel Baghdad identity */
  colors: {
    primaryBurgundy: '#5F160F',
    darkBurgundy: '#420D09',
    goldAccent: '#D4AF37',
    lightBgIvory: '#FAF7F2',
    lightSurfaceWhite: '#FFFFFF',
    lightTextDark: '#2B211F',
    darkBg: '#1B1110',
    darkSurface: '#2A1917',
    darkTextLight: '#F7F2EA',
  },
  /** Full product title used in <title>, headers and the persona */
  get fullTitleAr(): string {
    return `${this.productAr} لـ ${this.nameAr}`;
  },
  get fullTitleEn(): string {
    return `${this.nameEn} ${this.productEn}`;
  },
  /** Assistant display name inside the chat ("مساعد تل بغداد") */
  get assistantDisplayAr(): string {
    return `مساعد ${this.nameAr}`;
  },
  /** Main store label shown in the staff sidebar */
  get mainStoreAr(): string {
    return `متجر ${this.nameAr} الرئيسي`;
  },
  /** Short monogram for avatars/logo fallback */
  monogram: 'ت ب',
  /** Default locale + direction */
  locale: 'ar-IQ',
  dir: 'rtl' as const,
  /** Currency */
  currency: { code: 'IQD', symbolAr: 'د.ع' },
  /** Trust points shown on the customer side card */
  trustPointsAr: ['ضمان محلي معتمد', 'دفع آمن عند الاستلام', 'توصيل لكل محافظات العراق'] as const,
  supportAr: {
    title: 'دعم سريع، بأي وقت',
    body: 'مساعدنا الذكي يساعدك بالمقارنة، التوافق، والأسعار باللهجة العراقية.',
    responseTime: 'أقل من دقيقتين',
  },
  trustAr: {
    title: 'تسوّق بثقة',
    body: 'أسعار محدّثة ومخزون مباشر من فرع كربلاء.',
  },
} as const;

export type Brand = typeof brand;
