import type { BranchInfo } from '../types';

/**
 * Tel Baghdad operates a single branch in this deployment: Karbala.
 *
 * Address, phone and working hours are intentionally NOT defined: they have not been
 * provided by the company, and must never be invented. Add them only from verified data.
 */
export const KARBALA_BRANCH_ID = 'branch-karbala';

export const MOCK_BRANCHES: BranchInfo[] = [
  {
    id: KARBALA_BRANCH_ID,
    nameAr: 'فرع كربلاء',
    city: 'كربلاء',
    isMainStore: true,
  },
];
