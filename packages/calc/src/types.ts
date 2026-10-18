/**
 * Calc Engine Type Definitions (Agent 5 - Pure Mathematics & Optimization)
 */

export interface CalcProduct {
  id: string;
  sku: string;
  nameAr: string;
  nameEn?: string;
  category: 'phone' | 'tablet' | 'accessory' | 'audio' | 'wearable';
  priceIQD: number;
  costIQD: number;
  stock: number;
  tags?: string[];
  specs?: {
    storage?: string;
    ram?: string;
    battery?: string;
    camera?: string;
  };
}

export interface InstallmentPlan {
  totalPriceIQD: number;
  downPaymentIQD: number;
  months: number;
  remainingAmountIQD: number;
  monthlyAmountIQD: number;
  breakdownAr: string;
}

export interface MarginCheckResult {
  isSafe: boolean;
  actualMarginPct: number;
  minAllowedMarginPct: number;
  costIQD: number;
  proposedPriceIQD: number;
  recommendedMinPriceIQD: number;
}

export interface RecommendedBundle {
  phone: CalcProduct;
  cover?: CalcProduct;
  charger?: CalcProduct;
  totalBeforeDiscountIQD: number;
  bundleDiscountIQD: number;
  finalPriceIQD: number;
  savingsIQD: number;
}

export interface BudgetMatchResult {
  budgetIQD: number;
  directMatches: CalcProduct[];
  recommendedBundle?: RecommendedBundle;
  cheapestAvailableIQD: number | null;
  budgetDeficitIQD: number | null;
  explanationAr: string;
}

export interface RecommendationWeights {
  budgetWeight?: number;
  usageWeight?: number;
  stockWeight?: number;
  marginWeight?: number;
}

export interface ProductScoreCriteria {
  targetBudgetIQD?: number;
  targetUsageTag?: string;
  minMarginPct?: number;
}
