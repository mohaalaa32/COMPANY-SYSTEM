/**
 * Calc Engine Type Definitions (Agent 5 - Pure Mathematics & Optimization)
 * Strictly matches docs/CONTRACTS.md §1 and §3.
 */

export interface BranchStock {
  branchId: string;
  branchNameAr: string;
  quantity: number;
  available: boolean;
}

export interface ProductSpecification {
  storage?: string;       // e.g. "128GB", "256GB"
  ram?: string;           // e.g. "8GB"
  camera?: string;        // e.g. "50MP Main + 12MP Ultra-wide"
  battery?: string;       // e.g. "5000mAh"
  screen?: string;        // e.g. "6.7 inch AMOLED 120Hz"
  processor?: string;     // e.g. "Snapdragon 8 Gen 3"
  color?: string;         // e.g. "أسود تيتانيوم"
  warrantyMonths: number; // e.g. 12
}

export interface Product {
  id: string;
  sku: string;
  nameAr: string;
  nameEn: string;
  category: 'phone' | 'tablet' | 'accessory' | 'audio' | 'wearable';
  brand: string;
  basePriceIQD: number;
  salePriceIQD?: number;
  costIQD: number;         // Used for margin protection calculations
  imageUrl: string;
  specs: ProductSpecification;
  isAvailable: boolean;
  totalStock: number;
  branches: BranchStock[];
  tags: string[];         // e.g. ['gaming', 'student', 'best-camera', 'budget']
}

/** Backward compatibility alias */
export type CalcProduct = Product;

export interface InstallmentPlan {
  totalPriceIQD: number;
  downPaymentIQD: number;
  months: number;
  monthlyAmountIQD: number;
  breakdownAr: string;     // تفصيل باللغة العربية لشرح طريقة الحساب
  remainingAmountIQD?: number;
}

export interface MarginCheckResult {
  isSafe: boolean;
  actualMarginPct: number;
  minAllowedMarginPct: number;
  recommendedMinPriceIQD: number;
  costIQD?: number;
  proposedPriceIQD?: number;
}

export interface RecommendedBundle {
  phone: Product;
  cover?: Product;         // كفر الحزمة اختياري
  charger?: Product;
  totalPriceIQD: number;   // totalPriceIQD بدلاً من finalPriceIQD
  savingsIQD: number;
  totalBeforeDiscountIQD?: number;
  bundleDiscountIQD?: number;
}

export interface BudgetMatchResult {
  directMatches: Product[];
  recommendedBundle?: RecommendedBundle;
  explanationAr: string;
  budgetIQD?: number;
  cheapestAvailableIQD?: number | null;
  budgetDeficitIQD?: number | null;
}

export interface RecommendationWeights {
  budgetFit?: number;
  usageFit?: number;
  stock?: number;
  margin?: number;
  /** Backward compatibility aliases */
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

export interface ICalcEngine {
  parseIraqiNumber(input: string): number | null;
  roundIraqiCurrency(amount: number, step?: 250 | 500 | 1000): number;
  convertCurrency(amount: number, exchangeRate: number, target: 'IQD' | 'USD'): number;
  matchBudget(products: Product[], budgetIQD: number, preference?: string): BudgetMatchResult;
  calculateInstallments(priceIQD: number, months: number, downPaymentIQD?: number): InstallmentPlan;
  verifyMargin(costIQD: number, proposedPriceIQD: number, minMarginPct: number): MarginCheckResult;
  scoreProduct(product: Product, weights?: RecommendationWeights, criteria?: ProductScoreCriteria): number;
}
