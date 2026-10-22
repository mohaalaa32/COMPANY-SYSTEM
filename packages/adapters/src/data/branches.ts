import type { BranchInfo } from '../types';

/**
 * Realistic Iraqi Branch Locations for Tel Baghdad
 */
export const MOCK_BRANCHES: BranchInfo[] = [
  {
    id: 'branch-karrada',
    nameAr: 'فرع بغداد - الكرادة',
    city: 'بغداد',
    addressAr: 'بغداد، الكرادة، شارع العرصات الهندية، مجمع تل بغداد التجاري',
    phone: '+9647801002001',
    isMainStore: true,
  },
  {
    id: 'branch-mansour',
    nameAr: 'فرع بغداد - المنصور',
    city: 'بغداد',
    addressAr: 'بغداد، المنصور، شارع 14 رمضان، قرب ساحة الرواد',
    phone: '+9647801002002',
    isMainStore: false,
  },
  {
    id: 'branch-basra',
    nameAr: 'فرع البصرة - الجزائر',
    city: 'البصرة',
    addressAr: 'البصرة، حي الجزائر، مقابل المتاجر المركزية',
    phone: '+9647801002003',
    isMainStore: false,
  },
  {
    id: 'branch-erbil',
    nameAr: 'فرع أربيل - عينكاوة',
    city: 'أربيل',
    addressAr: 'أربيل، عينكاوة، تقاطع طريق 100 متر',
    phone: '+9647501002004',
    isMainStore: false,
  },
  {
    id: 'branch-najaf',
    nameAr: 'فرع النجف - شارع الروان',
    city: 'النجف',
    addressAr: 'النجف الأشرف، شارع الروان، المجمع التجاري',
    phone: '+9647801002005',
    isMainStore: false,
  },
];
