import type { MarginCheckResult } from './types';
import { roundIraqiCurrency } from './currency';

/**
 * Enforces business margin protection.
 * The LLM is NEVER allowed to set or discount a price below the minimum margin threshold.
 *
 * Margin Formula: Margin % = ((Price - Cost) / Price) * 100
 */
export function verifyMargin(
  costIQD: number,
  proposedPriceIQD: number,
  minMarginPct: number = 5
): MarginCheckResult {
  const safeCost = Math.max(0, costIQD || 0);
  const safeProposed = Math.max(0, proposedPriceIQD || 0);
  const safeMinPct = Math.max(0, Math.min(minMarginPct, 95));

  // Compute minimum viable selling price for this cost & margin target
  // minPrice * (1 - minMarginPct/100) = cost
  const rawMinPrice = safeCost / (1 - safeMinPct / 100);
  const recommendedMinPriceIQD = Math.ceil(rawMinPrice / 250) * 250;

  if (safeProposed <= 0) {
    return {
      isSafe: false,
      actualMarginPct: -100,
      minAllowedMarginPct: safeMinPct,
      costIQD: safeCost,
      proposedPriceIQD: 0,
      recommendedMinPriceIQD,
    };
  }

  const rawMargin = ((safeProposed - safeCost) / safeProposed) * 100;
  const actualMarginPct = Math.round(rawMargin * 100) / 100; // rounded to 2 decimals

  const isSafe = actualMarginPct >= safeMinPct;

  return {
    isSafe,
    actualMarginPct,
    minAllowedMarginPct: safeMinPct,
    costIQD: safeCost,
    proposedPriceIQD: roundIraqiCurrency(safeProposed, 250),
    recommendedMinPriceIQD,
  };
}
