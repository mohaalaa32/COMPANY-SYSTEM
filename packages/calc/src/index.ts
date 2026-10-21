/**
 * @tel/calc — Deterministic Calculation Engine
 * Pure mathematical, financial, and optimization functions for Tel Baghdad AI Sales Assistant.
 *
 * Strictly adheres to docs/CONTRACTS.md §1 & §3.
 * No default exports, no side effects.
 */

// Types & Contracts
export type {
  BranchStock,
  ProductSpecification,
  Product,
  CalcProduct,
  InstallmentPlan,
  MarginCheckResult,
  RecommendedBundle,
  BudgetMatchResult,
  RecommendationWeights,
  ProductScoreCriteria,
  ICalcEngine,
} from './types';

// Parser & Arabic Digits Normalization
export {
  normalizeDigits,
  parseIraqiNumber,
} from './parser';
export type { ParseNumberOptions } from './parser';

// Currency & IQD Cash Rounding
export {
  roundIraqiCurrency,
  convertCurrency,
  formatIQD,
} from './currency';
export type { RoundingStep } from './currency';

// Profit Margin Protection
export { verifyMargin } from './margin';

// Installment Plans
export { calculateInstallments } from './installments';
export type { InstallmentOptions } from './installments';

// Recommendation Scoring
export { scoreProduct } from './scoring';

// Budget & Knapsack Bundle Matching
export { matchBudget } from './budget';
export type { BudgetOptions } from './budget';

// Unified ICalcEngine instance
import type { ICalcEngine } from './types';
import { parseIraqiNumber } from './parser';
import { roundIraqiCurrency, convertCurrency } from './currency';
import { verifyMargin } from './margin';
import { calculateInstallments } from './installments';
import { scoreProduct } from './scoring';
import { matchBudget } from './budget';

export const calcEngine: ICalcEngine = {
  parseIraqiNumber,
  roundIraqiCurrency,
  convertCurrency,
  matchBudget,
  calculateInstallments,
  verifyMargin,
  scoreProduct,
};
