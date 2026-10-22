import type { ToolCallResponse, ExtractedNumber, NumberVerificationResult } from '../types';
import { normalizeDigits, parseIraqiNumber } from '@tel/calc';

export class NumericalHallucinationError extends Error {
  public readonly unauthorizedNumbers: ExtractedNumber[];

  constructor(message: string, unauthorizedNumbers: ExtractedNumber[]) {
    super(message);
    this.name = 'NumericalHallucinationError';
    this.unauthorizedNumbers = unauthorizedNumbers;
  }
}

export interface NumberGuardOptions {
  /**
   * Safe conversational numbers allowed without explicit tool grounding
   * (e.g. 0, 1, 2, 3 for numbered bullet lists, 24, 7 for 24/7 support).
   */
  allowedConstants?: number[];
  /**
   * If true, corrects the response instead of throwing when enforcing safety.
   */
  autoCorrect?: boolean;
}

const DEFAULT_ALLOWED_CONSTANTS = [0, 1, 2, 3, 4, 5, 24, 7];

/**
 * Recursively extracts all numerical values present in tool call responses.
 */
export function extractAuthorizedNumbers(
  toolResults: ToolCallResponse[],
  additionalConstants: number[] = DEFAULT_ALLOWED_CONSTANTS
): Set<number> {
  const authorized = new Set<number>(additionalConstants);

  function walk(value: unknown): void {
    if (value === null || value === undefined) {
      return;
    }

    if (typeof value === 'number') {
      if (Number.isFinite(value)) {
        authorized.add(value);
      }
      return;
    }

    if (typeof value === 'string') {
      // Extract numbers from strings and specs like "A55", "256GB", "5000mAh", "1,850,000"
      const normalizedStr = normalizeDigits(value);
      const matches = normalizedStr.matchAll(/\d+(?:[.,]\d+)*/g);
      for (const m of matches) {
        // Strip thousand separators if any
        const cleaned = m[0].replace(/,/g, '');
        const parsed = Number(cleaned);
        if (Number.isFinite(parsed)) {
          authorized.add(parsed);
        }
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }

    if (typeof value === 'object') {
      for (const val of Object.values(value as Record<string, unknown>)) {
        walk(val);
      }
    }
  }

  for (const res of toolResults) {
    if (res.success && res.data) {
      walk(res.data);
    }
  }

  return authorized;
}

/**
 * Extracts numbers from text, handling:
 * 1. Western digits: "1,850,000", "475000", "25%"
 * 2. Arabic-Indic digits: "١،٨٥٠،٠٠٠", "١٥٪"
 * 3. Iraqi market number words: "مليون ونص", "مية الف", "ورقة", "دفتر", etc.
 */
export function extractNumbersFromText(text: string): ExtractedNumber[] {
  const results: ExtractedNumber[] = [];
  if (!text || text.trim().length === 0) {
    return results;
  }

  // 1. Convert Arabic-Indic digits and remove thousand separators
  // We keep track of matches in original text
  const digitRegex = /(?:[\d\u0660-\u0669]+(?:[.,،][\d\u0660-\u0669]+)*)/g;
  let match: RegExpExecArray | null;

  while ((match = digitRegex.exec(text)) !== null) {
    const raw = match[0];
    const normalized = normalizeDigits(raw).replace(/[,،]/g, '');
    const num = Number(normalized);

    if (Number.isFinite(num)) {
      results.push({
        raw,
        value: num,
        index: match.index,
      });
    }
  }

  // 2. Scan for Iraqi dialect number words
  const iraqiPhrases = [
    'مليون وربع',
    'مليون ونص',
    'مليونين ونص',
    'مليونين',
    'مليون',
    'نص مليون',
    'ربع مليون',
    'مية الف',
    'ميتين الف',
    'خمسمية الف',
    'ورقة',
    'دفتر',
  ];

  for (const phrase of iraqiPhrases) {
    let searchPos = 0;
    while ((searchPos = text.indexOf(phrase, searchPos)) !== -1) {
      const parsed = parseIraqiNumber(phrase);
      if (parsed !== null && Number.isFinite(parsed)) {
        // Only add if not already captured at this index
        const alreadyFound = results.some(
          (r) => Math.abs(r.index - searchPos) < phrase.length && r.value === parsed
        );
        if (!alreadyFound) {
          results.push({
            raw: phrase,
            value: parsed,
            index: searchPos,
          });
        }
      }
      searchPos += phrase.length;
    }
  }

  return results;
}

/**
 * Verifies that every number mentioned in the AI response is grounded in tool results.
 */
export function verifyResponseNumbers(
  content: string,
  toolResults: ToolCallResponse[],
  options: NumberGuardOptions = {}
): NumberVerificationResult {
  const allowedConstants = options.allowedConstants || DEFAULT_ALLOWED_CONSTANTS;
  const authorized = extractAuthorizedNumbers(toolResults, allowedConstants);
  const extracted = extractNumbersFromText(content);

  const unauthorizedNumbers: ExtractedNumber[] = [];

  for (const num of extracted) {
    if (!authorized.has(num.value)) {
      unauthorizedNumbers.push(num);
    }
  }

  const isSafe = unauthorizedNumbers.length === 0;

  if (isSafe) {
    return {
      isSafe: true,
      extractedNumbers: extracted,
      authorizedNumbers: Array.from(authorized),
      unauthorizedNumbers: [],
    };
  }

  const unauthListStr = unauthorizedNumbers
    .map((n) => `"${n.raw}" (${n.value.toLocaleString()} د.ع)`)
    .join('، ');

  const reasonAr = `تم حظر الرد لوجود أرقام أو أسعار غير معتمدة أو مهلوسة لم ترد في بيانات الأدوات الرسمية: [${unauthListStr}].`;

  // Safe correction: replace hallucinated figures with grounding note
  let correctedContent = content;
  for (const unauth of unauthorizedNumbers) {
    correctedContent = correctedContent.replace(
      unauth.raw,
      '(يرجى مراجعة الأسعار المعتمدة من الفرع)'
    );
  }

  return {
    isSafe: false,
    extractedNumbers: extracted,
    authorizedNumbers: Array.from(authorized),
    unauthorizedNumbers,
    reasonAr,
    correctedContent,
  };
}

/**
 * Enforces numerical safety on the model output.
 * Throws NumericalHallucinationError or returns corrected content.
 */
export function enforceNumberSafety(
  content: string,
  toolResults: ToolCallResponse[],
  options: NumberGuardOptions = {}
): string {
  const check = verifyResponseNumbers(content, toolResults, options);

  if (check.isSafe) {
    return content;
  }

  if (options.autoCorrect && check.correctedContent) {
    return check.correctedContent;
  }

  throw new NumericalHallucinationError(check.reasonAr || 'Numerical hallucination detected', check.unauthorizedNumbers);
}
