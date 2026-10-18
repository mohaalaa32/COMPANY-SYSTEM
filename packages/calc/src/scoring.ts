import type {
  Product,
  ProductScoreCriteria,
  RecommendationWeights,
} from './types';

/**
 * Deterministic recommendation scoring formula.
 * Combines budget proximity, usage/environment fit, live stock health, and business margin.
 * Output: Integer score from 0 to 100.
 *
 * Implements ICalcEngine.scoreProduct from docs/CONTRACTS.md §3.
 */
export function scoreProduct(
  product: Product,
  arg2?: RecommendationWeights | ProductScoreCriteria,
  arg3?: RecommendationWeights | ProductScoreCriteria
): number {
  // Determine whether arg2 is weights or criteria
  let weights: RecommendationWeights | undefined;
  let criteria: ProductScoreCriteria | undefined;

  if (arg2) {
    if (
      'budgetFit' in arg2 ||
      'budgetWeight' in arg2 ||
      'usageFit' in arg2 ||
      'usageWeight' in arg2 ||
      'stock' in arg2 ||
      'stockWeight' in arg2 ||
      'margin' in arg2 ||
      'marginWeight' in arg2
    ) {
      weights = arg2 as RecommendationWeights;
      criteria = arg3 as ProductScoreCriteria | undefined;
    } else {
      criteria = arg2 as ProductScoreCriteria;
      weights = arg3 as RecommendationWeights | undefined;
    }
  }

  const wBudget = weights?.budgetFit ?? weights?.budgetWeight ?? 0.4;
  const wUsage = weights?.usageFit ?? weights?.usageWeight ?? 0.3;
  const wStock = weights?.stock ?? weights?.stockWeight ?? 0.15;
  const wMargin = weights?.margin ?? weights?.marginWeight ?? 0.15;

  const totalWeights = wBudget + wUsage + wStock + wMargin;
  if (totalWeights <= 0) return 0;

  const price =
    product.salePriceIQD ??
    product.basePriceIQD ??
    (product as unknown as { priceIQD?: number }).priceIQD ??
    0;
  const stock =
    product.totalStock ??
    (product as unknown as { stock?: number }).stock ??
    0;
  const cost = product.costIQD ?? 0;
  const tags = product.tags ?? [];

  // 1. Budget Fit Score (0.0 - 1.0)
  let budgetScore = 0.8;
  const targetBudget = criteria?.targetBudgetIQD;
  if (targetBudget && targetBudget > 0) {
    if (price <= targetBudget) {
      // Products that maximize the customer's budget get higher satisfaction scores
      const ratio = price / targetBudget;
      budgetScore = 0.5 + 0.5 * Math.min(1, ratio);
    } else {
      // Products exceeding the budget are penalized based on deficit percentage
      const excessRatio = (price - targetBudget) / targetBudget;
      budgetScore = Math.max(0, 0.5 - excessRatio * 2);
    }
  }

  // 2. Usage Fit Score (0.0 - 1.0)
  let usageScore = 0.7;
  const targetTag = criteria?.targetUsageTag?.toLowerCase().trim();
  if (targetTag) {
    const hasTag = tags.some((t) => t.toLowerCase().includes(targetTag));
    usageScore = hasTag ? 1.0 : 0.3;
  }

  // 3. Stock Health Score (0.0 - 1.0)
  let stockScore = 0.0;
  if (stock > 5) {
    stockScore = 1.0;
  } else if (stock > 0) {
    stockScore = 0.6;
  } else {
    stockScore = 0.0; // Out of stock severely penalized
  }

  // 4. Margin Health Score (0.0 - 1.0)
  // Handles minMarginPct = 0 and guarantees marginScore never exceeds 1.0
  let marginScore = 0.5;
  if (price > 0 && cost > 0) {
    const marginPct = ((price - cost) / price) * 100;
    const minMargin = criteria?.minMarginPct ?? 5;

    if (marginPct < minMargin) {
      marginScore = 0.1;
    } else if (marginPct >= 20) {
      marginScore = 1.0;
    } else {
      // Linearly scale between minMargin and 20%
      const denominator = Math.max(1, 20 - minMargin);
      const normalizedRatio = Math.min(1.0, Math.max(0.0, (marginPct - minMargin) / denominator));
      marginScore = Math.min(1.0, Math.max(0.1, 0.4 + normalizedRatio * 0.6));
    }
  }

  // Strictly clamp marginScore to [0.0, 1.0]
  marginScore = Math.max(0.0, Math.min(1.0, marginScore));

  const rawScore =
    (budgetScore * wBudget +
      usageScore * wUsage +
      stockScore * wStock +
      marginScore * wMargin) /
    totalWeights;

  return Math.round(Math.max(0, Math.min(100, rawScore * 100)));
}
