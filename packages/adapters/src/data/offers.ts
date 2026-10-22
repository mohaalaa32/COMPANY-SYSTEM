import type { Offer } from '../types';

/**
 * Realistic Iraqi Promotional Offers for Tel Baghdad
 */
export const MOCK_OFFERS: Offer[] = [
  {
    id: 'offer-complete-protection',
    titleAr: 'عرض حماية الجهاز المتكاملة: وفر 15% عند شراء كفر سيليكون أصلي وشاحن سريع معاً',
    discountPct: 15,
    applicableProductIds: [
      'prod-acc-apl-20w',
      'prod-acc-ank-45w',
      'prod-acc-sam-25w',
      'prod-acc-ip16pm-case',
      'prod-acc-s24u-case',
      'prod-acc-a55-case',
      'prod-acc-univ-case',
    ],
    validUntil: '2026-12-31T23:59:59Z',
  },
  {
    id: 'offer-student-pack',
    titleAr: 'عرض الطلاب والجامعات: خصم خاص 8% على أجهزة الفئة المتوسطة والأجهزة اللوحية',
    discountPct: 8,
    applicableProductIds: [
      'prod-a55-256',
      'prod-rn13pro-256',
      'prod-inf-n40-256',
      'prod-tecno-sp20p-256',
      'prod-ipad10-64',
      'prod-tabs9fe-128',
    ],
    validUntil: '2026-11-30T23:59:59Z',
  },
  {
    id: 'offer-flagship-upgrade',
    titleAr: 'عرض ترقية الهواتف الرائدة: هدية شاحن أو كفر مع كل جهاز رائد وضمان معتمد',
    discountPct: 5,
    applicableProductIds: [
      'prod-ip16pm-256',
      'prod-ip15-128',
      'prod-s24u-256',
    ],
    validUntil: '2026-12-31T23:59:59Z',
  },
];
