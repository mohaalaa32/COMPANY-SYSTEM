import { describe, expect, it } from 'vitest';
import {
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
import type { Product } from '../src/index';

describe('Comprehensive Edge Cases Suite (100+ Edge Cases) — Agent 5 Math Engine', () => {
  describe('Group 1: Iraqi Market Slang & Sheet/Daftar Terminology (10 cases)', () => {
    const sheetCases: Array<[string, number]> = [
      ['ورقة', 150000],
      ['ورقة وحدة', 150000],
      ['ورقتين', 300000],
      ['3 اوراق', 450000],
      ['5 أوراق', 750000],
      ['7 ورقات', 1050000],
      ['10 اوراق', 1500000],
      ['15 ورقة', 2250000],
      ['دفتر', 15000000],
      ['دفترين', 30000000],
    ];

    it.each(sheetCases)('correctly parses market term "%s" -> %i IQD', (input, expected) => {
      expect(parseIraqiNumber(input)).toBe(expected);
    });
  });

  describe('Group 2: Fractional Millions & Dialect Million Compounds (15 cases)', () => {
    const millionCases: Array<[string, number]> = [
      ['ربع مليون', 250000],
      ['نص مليون', 500000],
      ['نصف مليون', 500000],
      ['ثلاث ارباع مليون', 750000],
      ['ثلاثة ارباع مليون', 750000],
      ['تلاث ارباع مليون', 750000],
      ['مليون', 1000000],
      ['مليون وربع', 1250000],
      ['مليون ونص', 1500000],
      ['مليون ونصف', 1500000],
      ['مليونين', 2000000],
      ['مليونين ونص', 2500000],
      ['مليون وميتين الف', 1200000],
      ['مليون و 250 الف', 1250000],
      ['مليونين و خمسمية الف', 2500000],
    ];

    it.each(millionCases)('correctly parses million expression "%s" -> %i IQD', (input, expected) => {
      expect(parseIraqiNumber(input)).toBe(expected);
    });
  });

  describe('Group 3: Iraqi Dialect Hundreds of Thousands & Teens (25 cases)', () => {
    const thousandCases: Array<[string, number]> = [
      ['عشرة الاف', 10000],
      ['دعش الف', 11000],
      ['داعش الف', 11000],
      ['احداعش الف', 11000],
      ['اثنعش الف', 12000],
      ['ثنعش الف', 12000],
      ['تلطعش الف', 13000],
      ['اربعطعش الف', 14000],
      ['خمستعش الف', 15000],
      ['ستعش الف', 16000],
      ['سبعتعش الف', 17000],
      ['ثمنتعش الف', 18000],
      ['تسعتعش الف', 19000],
      ['عشرين الف', 20000],
      ['واحد وعشرين الف', 21000],
      ['خمسة وعشرين الف', 25000],
      ['خمسين الف', 50000],
      ['سبعين الف', 70000],
      ['مية الف', 100000],
      ['ميه الف', 100000],
      ['ميتين الف', 200000],
      ['تلثمية الف', 300000],
      ['اربعمية الف', 400000],
      ['خمسمية الف', 500000],
      ['ستمية الف', 600000],
    ];

    it.each(thousandCases)('correctly parses thousand expression "%s" -> %i IQD', (input, expected) => {
      expect(parseIraqiNumber(input)).toBe(expected);
    });
  });

  describe('Group 4: Arabic-Indic Digits, Suffixes & Latin Multipliers (15 cases)', () => {
    const digitCases: Array<[string, number]> = [
      ['١٠٠ الف', 100000],
      ['٢٥٠ ألف', 250000],
      ['٥٠٠ الاف', 500000],
      ['٧٥٠ الف', 750000],
      ['١ مليون', 1000000],
      ['١.٥ مليون', 1500000],
      ['٢ مليون', 2000000],
      ['١٠٠٬٠٠٠', 100000],
      ['٢٥٠،٠٠٠', 250000],
      ['٥٠٠٠٠٠', 500000],
      ['۱۰۰ الف', 100000],
      ['۲۵۰۰۰۰', 250000],
      ['100k', 100000],
      ['250K', 250000],
      ['1.5m', 1500000],
    ];

    it.each(digitCases)('correctly parses digit/symbol combo "%s" -> %i IQD', (input, expected) => {
      expect(parseIraqiNumber(input)).toBe(expected);
    });
  });

  describe('Group 5: Customer Inquiries with Prefixes & Currency Labels (15 cases)', () => {
    const inquiryCases: Array<[string, number]> = [
      ['بحدود 500 الف', 500000],
      ['ميزانيتي 300 الف دينار', 300000],
      ['حوالي 250 الف د.ع', 250000],
      ['اريد جهاز بسعر 150 الف', 150000],
      ['أريد بسعر 200 الف', 200000],
      ['عندي مليون عراقي', 1000000],
      ['تقريبا 450 الف دينار', 450000],
      ['تقريباً 600 الف', 600000],
      ['يم 700 الف iqd', 700000],
      ['بـ 800 الف', 800000],
      ['ب 900 الف', 900000],
      ['سعر 350 الف', 350000],
      ['بحدود مية الف دينار', 100000],
      ['ميزانيتي حوالي مليون ونص د.ع', 1500000],
      ['عندي ربع مليون دينار', 250000],
    ];

    it.each(inquiryCases)('cleans inquiry prefix/suffix in "%s" -> %i IQD', (input, expected) => {
      expect(parseIraqiNumber(input)).toBe(expected);
    });
  });

  describe('Group 6: Malformed, Empty & Non-Numeric Text Protection (15 cases)', () => {
    const invalidCases: string[] = [
      '',
      '    ',
      'سلام عليكم',
      'شلونكم عيوني',
      'وين المحل',
      'وصل الجهاز',
      'وصلني كفر',
      'اريد استفسار فقط',
      'شنو احسن جهاز للالعاب',
      'هاتف ايفون 15', // phone name without price intent
      'كفر حماية وشاحن',
      'اكو توصيل للبصرة',
      'شكرا جزيلا',
      'وين الفرع بالكرادة',
      'مرحبا',
    ];

    it.each(invalidCases)('returns null for non-numeric text: "%s"', (input) => {
      expect(parseIraqiNumber(input)).toBeNull();
    });
  });

  describe('Group 7: Currency Rounding & Formatting Edge Cases (10 cases)', () => {
    it('rounds zero to 0', () => {
      expect(roundIraqiCurrency(0)).toBe(0);
    });

    it('rounds negative number to 0', () => {
      expect(roundIraqiCurrency(-500)).toBe(0);
    });

    it('rounds 124 down to 0 at step 250', () => {
      expect(roundIraqiCurrency(124, 250)).toBe(0);
    });

    it('rounds 125 up to 250 at step 250', () => {
      expect(roundIraqiCurrency(125, 250)).toBe(250);
    });

    it('rounds 375 up to 500 at step 500', () => {
      expect(roundIraqiCurrency(375, 500)).toBe(500);
    });

    it('rounds 750 up to 1000 at step 1000', () => {
      expect(roundIraqiCurrency(750, 1000)).toBe(1000);
    });

    it('handles giant number rounding properly', () => {
      expect(roundIraqiCurrency(999999999, 250)).toBe(1000000000);
    });

    it('formats 0 IQD properly', () => {
      expect(formatIQD(0)).toBe('0 د.ع');
    });

    it('formats negative number gracefully to 0 د.ع', () => {
      expect(formatIQD(-250)).toBe('0 د.ع');
    });

    it('formats large multi-million amounts with comma grouping', () => {
      expect(formatIQD(15000000)).toBe('15,000,000 د.ع');
    });
  });

  describe('Group 8: Currency Conversion Boundaries (5 cases)', () => {
    it('returns 0 when amount is 0 or negative', () => {
      expect(convertCurrency(0, 1500, 'IQD')).toBe(0);
      expect(convertCurrency(-50, 1500, 'IQD')).toBe(0);
    });

    it('returns 0 when exchange rate is 0 or negative', () => {
      expect(convertCurrency(100, 0, 'IQD')).toBe(0);
      expect(convertCurrency(100, -1500, 'IQD')).toBe(0);
    });

    it('converts USD to IQD with exact 250 multiple rounding', () => {
      // 100 * 1520 = 152,000
      expect(convertCurrency(100, 1520, 'IQD')).toBe(152000);
    });

    it('converts IQD to USD integer', () => {
      // 150,000 / 1500 = 100
      expect(convertCurrency(150000, 1500, 'USD')).toBe(100);
    });

    it('rounds fractional USD result to nearest integer', () => {
      // 155,000 / 1500 = 103.33 -> 103
      expect(convertCurrency(155000, 1500, 'USD')).toBe(103);
    });
  });

  describe('Group 9: Margin Protection Boundary Conditions (10 cases)', () => {
    it('returns safe when cost is 0', () => {
      const res = verifyMargin(0, 50000, 5);
      expect(res.isSafe).toBe(true);
      expect(res.actualMarginPct).toBe(100);
    });

    it('returns unsafe when proposed price is 0', () => {
      const res = verifyMargin(50000, 0, 5);
      expect(res.isSafe).toBe(false);
      expect(res.actualMarginPct).toBe(-100);
    });

    it('handles exact minimum margin threshold', () => {
      // Cost 95, Price 100 -> Margin = 5%
      const res = verifyMargin(95000, 100000, 5);
      expect(res.actualMarginPct).toBe(5);
      expect(res.isSafe).toBe(true);
    });

    it('rejects proposed price slightly below minimum margin', () => {
      // Cost 96, Price 100 -> Margin = 4% (< 5%)
      const res = verifyMargin(96000, 100000, 5);
      expect(res.isSafe).toBe(false);
      expect(res.actualMarginPct).toBe(4);
      expect(res.recommendedMinPriceIQD).toBeGreaterThan(100000);
    });

    it('handles minMarginPct = 0 boundary', () => {
      const res = verifyMargin(100000, 100000, 0);
      expect(res.isSafe).toBe(true);
      expect(res.actualMarginPct).toBe(0);
    });

    it('clamps minMarginPct to safe upper limit (95%)', () => {
      const res = verifyMargin(10000, 200000, 999);
      expect(res.minAllowedMarginPct).toBe(95);
    });

    it('handles negative cost gracefully as 0', () => {
      const res = verifyMargin(-5000, 50000, 5);
      expect(res.costIQD).toBe(0);
      expect(res.isSafe).toBe(true);
    });

    it('handles negative price gracefully as 0', () => {
      const res = verifyMargin(50000, -10000, 5);
      expect(res.isSafe).toBe(false);
    });

    it('recommendedMinPriceIQD is always an integer multiple of 250', () => {
      const res = verifyMargin(123456, 150000, 15);
      expect(res.recommendedMinPriceIQD % 250).toBe(0);
    });

    it('recommends valid price when cost is high and margin is strict', () => {
      const res = verifyMargin(900000, 910000, 10);
      expect(res.isSafe).toBe(false);
      expect(res.recommendedMinPriceIQD).toBe(1000000);
    });
  });

  describe('Group 10: Installments Calculation Edge Cases (10 cases)', () => {
    it('handles 0 price with 0 monthly amount', () => {
      const plan = calculateInstallments(0, 12, 0);
      expect(plan.totalPriceIQD).toBe(0);
      expect(plan.monthlyAmountIQD).toBe(0);
    });

    it('clamps 0 or negative months to at least 1 month', () => {
      const plan = calculateInstallments(600000, 0, 0);
      expect(plan.months).toBe(1);
      expect(plan.monthlyAmountIQD).toBe(600000);
    });

    it('clamps excessive months (> 36) to maximum 36 months', () => {
      const plan = calculateInstallments(3600000, 60, 0);
      expect(plan.months).toBe(36);
      expect(plan.monthlyAmountIQD).toBe(100000);
    });

    it('handles 100% down payment leaving 0 monthly payment', () => {
      const plan = calculateInstallments(1000000, 12, 1000000);
      expect(plan.remainingAmountIQD).toBe(0);
      expect(plan.monthlyAmountIQD).toBe(0);
      expect(plan.breakdownAr).toContain('دفعة مقدمة قدرها 1,000,000 د.ع');
    });

    it('clamps down payment higher than total price', () => {
      const plan = calculateInstallments(500000, 6, 900000);
      expect(plan.downPaymentIQD).toBe(500000);
      expect(plan.remainingAmountIQD).toBe(0);
      expect(plan.monthlyAmountIQD).toBe(0);
    });

    it('handles negative down payment gracefully as 0', () => {
      const plan = calculateInstallments(600000, 6, -50000);
      expect(plan.downPaymentIQD).toBe(0);
      expect(plan.breakdownAr).toContain('بدون دفعة مقدمة');
    });

    it('rounds monthly payment UP to nearest 250 IQD so no unpaid pennies remain', () => {
      // 100,000 / 3 = 33,333.33 -> rounded up to 33,500
      const plan = calculateInstallments(100000, 3, 0);
      expect(plan.monthlyAmountIQD).toBe(33500);
      expect(plan.monthlyAmountIQD % 250).toBe(0);
    });

    it('includes optional administrative fee when feePct is specified', () => {
      // Price 1,000,000, fee 5% = 50,000 -> remaining 1,050,000 / 10 = 105,000
      const plan = calculateInstallments(1000000, 10, 0, { feePct: 5 });
      expect(plan.remainingAmountIQD).toBe(1050000);
      expect(plan.monthlyAmountIQD).toBe(105000);
      expect(plan.breakdownAr).toContain('رسوم إدارية 50,000 د.ع');
    });

    it('formats breakdown explanation in valid Arabic text', () => {
      const plan = calculateInstallments(450000, 3, 150000);
      expect(plan.breakdownAr).toContain('السعر الإجمالي');
      expect(plan.breakdownAr).toContain('دفعة مقدمة');
      expect(plan.breakdownAr).toContain('القسط الشهري');
    });

    it('rounds price to realistic 250 IQD multiple before calculating plan', () => {
      const plan = calculateInstallments(450123, 3, 0);
      expect(plan.totalPriceIQD).toBe(450000);
    });
  });

  describe('Group 11: Budget Matching & Knapsack Optimization Edge Cases (10 cases)', () => {
    const testCatalog: Product[] = [
      {
        id: 'phone-mid',
        sku: 'P-MID',
        nameAr: 'سامسونج A55',
        nameEn: 'Samsung A55',
        category: 'phone',
        brand: 'Samsung',
        basePriceIQD: 450000,
        costIQD: 380000,
        imageUrl: '',
        specs: { warrantyMonths: 12 },
        isAvailable: true,
        totalStock: 5,
        branches: [],
        tags: ['samsung', 'gaming'],
      },
      {
        id: 'phone-cheap',
        sku: 'P-CHEAP',
        nameAr: 'ريدمي 13 سي',
        nameEn: 'Redmi 13C',
        category: 'phone',
        brand: 'Xiaomi',
        basePriceIQD: 150000,
        costIQD: 120000,
        imageUrl: '',
        specs: { warrantyMonths: 12 },
        isAvailable: true,
        totalStock: 5,
        branches: [],
        tags: ['xiaomi', 'budget'],
      },
      {
        id: 'cover-1',
        sku: 'C-1',
        nameAr: 'كفر سيليكون A55',
        nameEn: 'Silicon Case A55',
        category: 'accessory',
        brand: 'Samsung',
        basePriceIQD: 25000,
        costIQD: 15000,
        imageUrl: '',
        specs: { warrantyMonths: 6 },
        isAvailable: true,
        totalStock: 10,
        branches: [],
        tags: ['cover', 'samsung'],
      },
      {
        id: 'charger-1',
        sku: 'CH-1',
        nameAr: 'شاحن 25 واط',
        nameEn: 'Fast Charger 25W',
        category: 'accessory',
        brand: 'Samsung',
        basePriceIQD: 25000,
        costIQD: 14000,
        imageUrl: '',
        specs: { warrantyMonths: 12 },
        isAvailable: true,
        totalStock: 10,
        branches: [],
        tags: ['charger', 'samsung'],
      },
    ];

    it('handles negative budget safely by converting to 0 and prompting user', () => {
      const res = matchBudget(testCatalog, -50000);
      expect(res.budgetIQD).toBe(0);
      expect(res.directMatches).toHaveLength(0);
      expect(res.recommendedBundle).toBeUndefined();
      expect(res.explanationAr).toContain('يرجى تحديد ميزانية صالحة');
    });

    it('handles NaN or undefined budget safely', () => {
      const res = matchBudget(testCatalog, NaN as unknown as number);
      expect(res.budgetIQD).toBe(0);
      expect(res.directMatches).toHaveLength(0);
    });

    it('handles null or empty products list gracefully', () => {
      const res = matchBudget([], 500000);
      expect(res.directMatches).toHaveLength(0);
      expect(res.recommendedBundle).toBeUndefined();
      expect(res.explanationAr).toContain('لا تتوفر منتجات حالياً');
    });

    it('matches exact budget boundary for single product', () => {
      const res = matchBudget(testCatalog, 150000);
      expect(res.directMatches.some((p) => p.id === 'phone-cheap')).toBe(true);
    });

    it('recommends bundle when budget is slightly above raw bundle cost', () => {
      // A55 (450k) + Cover (25k) + Charger (25k) = 500,000 raw. 5% discount -> 475,000 IQD
      const res = matchBudget(testCatalog, 480000);
      expect(res.recommendedBundle).toBeDefined();
      expect(res.recommendedBundle!.totalPriceIQD).toBeLessThanOrEqual(480000);
    });

    it('calculates exact budget deficit when budget is 1 IQD below cheapest phone', () => {
      // Cheapest phone is 150,000 IQD. Budget is 149,999 IQD.
      const res = matchBudget(testCatalog, 149999);
      expect(res.cheapestAvailableIQD).toBe(150000);
      expect(res.budgetDeficitIQD).toBe(1);
      expect(res.explanationAr).toContain('أقل من سعر أرخص هاتف');
      expect(res.explanationAr).toContain('أقساط');
    });

    it('never includes out of stock items in direct matches or bundles', () => {
      const catalogWithOOS: Product[] = [
        ...testCatalog,
        {
          id: 'phone-oos',
          sku: 'P-OOS',
          nameAr: 'هاتف نافد',
          nameEn: 'OOS Phone',
          category: 'phone',
          brand: 'Test',
          basePriceIQD: 100000,
          costIQD: 80000,
          imageUrl: '',
          specs: { warrantyMonths: 12 },
          isAvailable: false,
          totalStock: 0,
          branches: [],
          tags: ['budget'],
        },
      ];
      const res = matchBudget(catalogWithOOS, 500000);
      expect(res.directMatches.some((p) => p.id === 'phone-oos')).toBe(false);
    });

    it('applies maxDirectMatches option cleanly', () => {
      const res = matchBudget(testCatalog, 1000000, undefined, { maxDirectMatches: 2 });
      expect(res.directMatches.length).toBeLessThanOrEqual(2);
    });

    it('returns valid score and ranking with empty tags', () => {
      const prodNoTags: Product = {
        ...testCatalog[0]!,
        tags: [],
      };
      const score = scoreProduct(prodNoTags);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('preserves customer trust by never exposing internal costs in explanation', () => {
      const res = matchBudget(testCatalog, 500000);
      for (const p of testCatalog) {
        expect(res.explanationAr).not.toContain(p.costIQD.toString());
      }
      expect(res.explanationAr).not.toMatch(/cost/i);
      expect(res.explanationAr).not.toMatch(/سعر التكلفة|تكلفة/);
    });
  });

  describe('Group 12: Digit Normalization & Eastern Arabic Numerals (5 cases)', () => {
    it('normalizes standard Arabic-Indic digits ٠-٩', () => {
      expect(normalizeDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    });

    it('normalizes Persian/Urdu digits ۰-۹', () => {
      expect(normalizeDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    });

    it('leaves standard ASCII digits intact', () => {
      expect(normalizeDigits('0123456789')).toBe('0123456789');
    });

    it('leaves Arabic words without digits unchanged', () => {
      expect(normalizeDigits('هاتف سامسونج جديد')).toBe('هاتف سامسونج جديد');
    });

    it('normalizes mixed text with embedded Arabic-Indic digits', () => {
      expect(normalizeDigits('سعر الجهاز ٢٥٠ الف دينار')).toBe('سعر الجهاز 250 الف دينار');
    });
  });
});
