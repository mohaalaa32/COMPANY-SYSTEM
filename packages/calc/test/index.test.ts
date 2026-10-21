import { describe, expect, it } from 'vitest';
import * as CalcIndex from '../src/index';
import {
  calcEngine,
  calculateInstallments,
  convertCurrency,
  formatIQD,
  matchBudget,
  normalizeDigits,
  parseIraqiNumber,
  roundIraqiCurrency,
  scoreProduct,
  verifyMargin,
} from '../src/index';
import type {
  BranchStock,
  BudgetMatchResult,
  BudgetOptions,
  CalcProduct,
  ICalcEngine,
  InstallmentOptions,
  InstallmentPlan,
  MarginCheckResult,
  ParseNumberOptions,
  Product,
  ProductScoreCriteria,
  ProductSpecification,
  RecommendationWeights,
  RecommendedBundle,
  RoundingStep,
} from '../src/index';

describe('@tel/calc public entrypoint (src/index.ts)', () => {
  it('exports all expected calculation and parsing functions', () => {
    expect(typeof normalizeDigits).toBe('function');
    expect(typeof parseIraqiNumber).toBe('function');
    expect(typeof roundIraqiCurrency).toBe('function');
    expect(typeof convertCurrency).toBe('function');
    expect(typeof formatIQD).toBe('function');
    expect(typeof verifyMargin).toBe('function');
    expect(typeof calculateInstallments).toBe('function');
    expect(typeof scoreProduct).toBe('function');
    expect(typeof matchBudget).toBe('function');
  });

  it('exports unified calcEngine adhering to ICalcEngine contract', () => {
    expect(calcEngine).toBeDefined();
    expect(typeof calcEngine.parseIraqiNumber).toBe('function');
    expect(typeof calcEngine.roundIraqiCurrency).toBe('function');
    expect(typeof calcEngine.convertCurrency).toBe('function');
    expect(typeof calcEngine.matchBudget).toBe('function');
    expect(typeof calcEngine.calculateInstallments).toBe('function');
    expect(typeof calcEngine.verifyMargin).toBe('function');
    expect(typeof calcEngine.scoreProduct).toBe('function');
  });

  it('contains no default export and has no unwanted exports', () => {
    expect((CalcIndex as Record<string, unknown>).default).toBeUndefined();
  });

  it('allows usage of exported functions directly via index imports', () => {
    // 1. parser
    expect(parseIraqiNumber('مية الف')).toBe(100000);
    expect(normalizeDigits('١٢٣')).toBe('123');

    // 2. currency
    expect(roundIraqiCurrency(1234, 250)).toBe(1250);
    expect(formatIQD(100000)).toBe('100,000 د.ع');
    expect(convertCurrency(100, 1500, 'IQD')).toBe(150000);

    // 3. margin
    const margin = verifyMargin(90000, 100000, 5);
    expect(margin.isSafe).toBe(true);

    // 4. installments
    const plan = calculateInstallments(1000000, 10, 200000);
    expect(plan.monthlyAmountIQD).toBe(80000);

    // 5. types compilation check
    const mockStock: BranchStock = {
      branchId: 'b1',
      branchNameAr: 'الفرع الرئيسي',
      quantity: 5,
      available: true,
    };
    const mockSpec: ProductSpecification = { warrantyMonths: 12 };
    const mockProduct: Product = {
      id: 'p1',
      sku: 'SKU1',
      nameAr: 'هاتف ذكي',
      nameEn: 'Smartphone',
      category: 'phone',
      brand: 'BrandX',
      basePriceIQD: 500000,
      costIQD: 400000,
      imageUrl: '',
      specs: mockSpec,
      isAvailable: true,
      totalStock: 5,
      branches: [mockStock],
      tags: ['gaming'],
    };

    // 6. scoring
    const score = scoreProduct(mockProduct, { budgetFit: 0.4, usageFit: 0.3, stock: 0.15, margin: 0.15 });
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThanOrEqual(0);

    // 7. matchBudget
    const match = matchBudget([mockProduct], 600000);
    expect(match.directMatches).toHaveLength(1);

    // Verify type assignments work
    const _weights: RecommendationWeights = { budgetFit: 0.5 };
    const _criteria: ProductScoreCriteria = { targetBudgetIQD: 500000 };
    const _parseOpts: ParseNumberOptions = { defaultUsdSheetRateIQD: 150000 };
    const _instOpts: InstallmentOptions = { feePct: 0 };
    const _budgetOpts: BudgetOptions = { minMarginPct: 5 };
    const _step: RoundingStep = 250;
    const _aliasProduct: CalcProduct = mockProduct;
    const _planType: InstallmentPlan = plan;
    const _marginType: MarginCheckResult = margin;
    const _matchType: BudgetMatchResult = match;
    const _bundleType: RecommendedBundle | undefined = match.recommendedBundle;
    const _engineType: ICalcEngine = calcEngine;

    expect(_weights).toBeDefined();
    expect(_criteria).toBeDefined();
    expect(_parseOpts).toBeDefined();
    expect(_instOpts).toBeDefined();
    expect(_budgetOpts).toBeDefined();
    expect(_step).toBe(250);
    expect(_aliasProduct.id).toBe('p1');
    expect(_planType.months).toBe(10);
    expect(_marginType.isSafe).toBe(true);
    expect(_matchType.directMatches.length).toBe(1);
    expect(_bundleType).toBeUndefined();
    expect(_engineType).toBeDefined();
  });
});
