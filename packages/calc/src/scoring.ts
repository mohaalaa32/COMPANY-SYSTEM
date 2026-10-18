import type {
  CalcProduct,
  ProductScoreCriteria,
  RecommendationWeights,
} from './types';

/**
 * Deterministic recommendation scoring formula.
 * Combines budget proximity, usage/environment fit, live stock health, and business margin.
 * Output: Integer score from 0 to 100.
 */
export function scoreProduct(
  product: CalcProduct,
  criteria?: ProductScoreCriteria,
  weights?: RecommendationWeights
): number {
  const wBudget = weights?.budgetWeight ?? 0.4;
  const wUsage = weights?.usageWeight ?? 0.3;
  const wStock = weights?.stockWeight ?? 0.15;
  const wMargin = weights?.marginWeight ?? 0.15;

  const totalWeights = wBudget + wUsage + wStock + wMargin;
  if (totalWeights <= 0) return 0;

  // 1. Budget Fit Score (0.0 - 1.0)
  let budgetScore = 0.8;
  const targetBudget = criteria?.targetBudgetIQD;
  if (targetBudget && targetBudget > 0) {
    if (product.priceIQD <= targetBudget) {
      // Products that maximize the customer's budget get higher satisfaction scores
      const ratio = product.priceIQD / targetBudget;
      budgetScore = 0.5 + 0.5 * Math.min(1, ratio);
    } else {
      // Products exceeding the budget are penalized based on deficit percentage
      const excessRatio = (product.priceIQD - targetBudget) / targetBudget;
      budgetScore = Math.max(0, 0.5 - excessRatio * 2);
    }
  }

  // 2. Usage Fit Score (0.0 - 1.0)
  let usageScore = 0.7;
  const targetTag = criteria?.targetUsageTag?.toLowerCase().trim();
  if (targetTag) {
    const hasTag = product.tags?.some((t) => t.toLowerCase().includes(targetTag));
    if (hasTag) {
      usageScore = 1.0;
    } else {
      usageScore = 0.3;
    }
  }

  // 3. Stock Health Score (0.0 - 1.0)
  let stockScore = 0.0;
  if (product.stock > 5) {
    stockScore = 1.0;
  } else if (product.stock > 0) {
    stockScore = 0.6;
  } else {
    stockScore = 0.0; // Out of stock severely penalized
  }

  // 4. Margin Health Score (0.0 - 1.0)
  let marginScore = 0.5;
  if (product.priceIQD > 0 && product.costIQD > 0) {
    const marginPct = ((product.priceIQD - product.costIQD) / product.priceIQD) * 100;
    const minMargin = criteria?.minMarginPct ?? 5;
    if (marginPct < minMargin) {
      marginScore = 0.1;
    } else if (marginPct >= 20) {
      marginScore = 1.0;
    } else {
      marginScore = 0.4 + (marginPct - minMargin) * 0.04;
    }
  }

  const rawScore =
    (budgetScore * wBudget +
      usageScore * wUsage +
      stockScore * wStock +
      marginScore * wMargin) /
    totalWeights;

  return Math.round(Math.max(0, Math.min(100, rawScore * 100)));
}
