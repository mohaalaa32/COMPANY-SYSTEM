import { describe, it, expect } from 'vitest';
import {
  verifyResponseNumbers,
  enforceNumberSafety,
  extractNumbersFromText,
  extractAuthorizedNumbers,
  NumericalHallucinationError,
} from '../src/index';
import type { ToolCallResponse } from '../src/types';

describe('Numerical Hallucination Guard (Anti-Hallucination Barrier)', () => {
  const sampleToolResults: ToolCallResponse[] = [
    {
      toolCallId: 'call_search_1',
      success: true,
      data: {
        count: 1,
        products: [
          {
            id: 'prod-a55-256',
            nameAr: 'سامسونج جالكسي A55 5G',
            basePriceIQD: 490000,
            salePriceIQD: 475000,
            costIQD: 430000,
            totalStock: 32,
            specs: {
              storage: '256GB',
              ram: '8GB',
              battery: '5000mAh',
              screen: '6.6 inch',
              warrantyMonths: 12,
            },
          },
        ],
      },
    },
    {
      toolCallId: 'call_offers_1',
      success: true,
      data: {
        offers: [
          {
            id: 'offer-protection',
            discountPct: 15,
          },
        ],
      },
    },
  ];

  describe('extractAuthorizedNumbers', () => {
    it('recursively gathers all numeric values from tool results', () => {
      const authorized = extractAuthorizedNumbers(sampleToolResults);

      expect(authorized.has(490000)).toBe(true);
      expect(authorized.has(475000)).toBe(true);
      expect(authorized.has(32)).toBe(true);
      expect(authorized.has(256)).toBe(true);
      expect(authorized.has(5000)).toBe(true);
      expect(authorized.has(15)).toBe(true);
      expect(authorized.has(12)).toBe(true);
    });
  });

  describe('extractNumbersFromText', () => {
    it('extracts Western digits with commas', () => {
      const numbers = extractNumbersFromText('السعر الحالي هو 475,000 دينار مع ضمان 12 شهر');
      const values = numbers.map((n) => n.value);
      expect(values).toContain(475000);
      expect(values).toContain(12);
    });

    it('extracts Arabic-Indic digits (الارقام العربية المشرقية)', () => {
      const numbers = extractNumbersFromText('السعر ٤٧٥،٠٠٠ د.ع وبطارية ٥٠٠٠ ملي امبير');
      const values = numbers.map((n) => n.value);
      expect(values).toContain(475000);
      expect(values).toContain(5000);
    });

    it('extracts Iraqi dialect number words (مليون ونص, مية الف, الخ)', () => {
      const numbers = extractNumbersFromText('ميزانيتك مليون ونص وتكفي للجهاز ومعه هدية');
      const values = numbers.map((n) => n.value);
      expect(values).toContain(1500000);
    });
  });

  describe('verifyResponseNumbers', () => {
    it('approves response when all mentioned prices and specs match tool results', () => {
      const responseText =
        'جهاز سامسونج A55 متوفر بسعر 475,000 دينار (السعر الأصلي 490,000 دينار) مع سعة 256 كيكابايت وبطارية 5000 ملي أمبير وضمان 12 شهر مع خصم 15% على الإكسسوارات.';

      const check = verifyResponseNumbers(responseText, sampleToolResults);
      expect(check.isSafe).toBe(true);
      expect(check.unauthorizedNumbers.length).toBe(0);
    });

    it('rejects response when model invents an unauthorized price (Price Hallucination)', () => {
      // Model hallucinates price 500,000 instead of 475,000
      const hallucinatedText =
        'جهاز سامسونج A55 متوفر حالياً بسعر 500,000 دينار عراقي فقط!';

      const check = verifyResponseNumbers(hallucinatedText, sampleToolResults);
      expect(check.isSafe).toBe(false);
      expect(check.unauthorizedNumbers.length).toBe(1);
      expect(check.unauthorizedNumbers[0]?.value).toBe(500000);
      expect(check.reasonAr).toContain('500,000');
    });

    it('rejects response when model invents an unauthorized discount percentage', () => {
      // Model hallucinates 50% discount instead of approved 15%
      const hallucinatedText =
        'سعر الجهاز 475,000 دينار ونعطيك خصم خاص 50% على الحماية!';

      const check = verifyResponseNumbers(hallucinatedText, sampleToolResults);
      expect(check.isSafe).toBe(false);
      expect(check.unauthorizedNumbers.some((n) => n.value === 50)).toBe(true);
    });

    it('rejects response when model invents fake stock quantity', () => {
      // Model invents 99 in stock while real stock is 32
      const hallucinatedText =
        'الجهاز متوفر بسعر 475,000 دينار ومتبقي في المخزن 99 قطعة فقط!';

      const check = verifyResponseNumbers(hallucinatedText, sampleToolResults);
      expect(check.isSafe).toBe(false);
      expect(check.unauthorizedNumbers.some((n) => n.value === 99)).toBe(true);
    });

    it('rejects response with hallucinated Arabic-Indic digits', () => {
      // Model invents ٦٥٠٠٠٠ (650,000)
      const hallucinatedText = 'السعر النهائي هو ٦٥٠٠٠٠ د.ع';

      const check = verifyResponseNumbers(hallucinatedText, sampleToolResults);
      expect(check.isSafe).toBe(false);
      expect(check.unauthorizedNumbers[0]?.value).toBe(650000);
    });

    it('provides automatic correction when autoCorrect is requested', () => {
      const hallucinatedText = 'السعر لدينا هو 600000 د.ع فقط!';
      const check = verifyResponseNumbers(hallucinatedText, sampleToolResults, { autoCorrect: true });

      expect(check.isSafe).toBe(false);
      expect(check.correctedContent).toBeDefined();
      expect(check.correctedContent).not.toContain('600000');
      expect(check.correctedContent).toContain('الأسعار المعتمدة');
    });
  });

  describe('enforceNumberSafety', () => {
    it('returns original content when text is numerically safe', () => {
      const safeText = 'سعر الجهاز هو 475,000 د.ع مع ضمان 12 شهر.';
      const result = enforceNumberSafety(safeText, sampleToolResults);
      expect(result).toBe(safeText);
    });

    it('throws NumericalHallucinationError on unauthorized numbers by default', () => {
      const unsafeText = 'سعر الجهاز هو 850,000 د.ع.';
      expect(() => enforceNumberSafety(unsafeText, sampleToolResults)).toThrow(
        NumericalHallucinationError
      );
    });

    it('returns auto-corrected content when autoCorrect option is enabled', () => {
      const unsafeText = 'سعر الجهاز هو 850,000 د.ع.';
      const result = enforceNumberSafety(unsafeText, sampleToolResults, { autoCorrect: true });
      expect(result).not.toContain('850,000');
    });
  });
});
