/**
 * Deterministic Iraqi Number & Currency Parser
 * Converts Arabic-Indic digits, Iraqi dialect number words, fractions,
 * and mixed expressions into exact integer numbers (IQD).
 */

const ARABIC_INDIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

export function normalizeDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (d) => ARABIC_INDIC_DIGITS[d] ?? d);
}

/**
 * Standard word-to-number mappings in Iraqi dialect and Modern Standard Arabic
 */
const BASE_NUMBERS: Record<string, number> = {
  'صفر': 0,
  'واحد': 1,
  'اثنين': 2,
  'ثنين': 2,
  'اثنان': 2,
  'ثلاثة': 3,
  'تلاثة': 3,
  'ثلاث': 3,
  'تلاث': 3,
  'اربعة': 4,
  'أربعة': 4,
  'اربع': 4,
  'أربع': 4,
  'خمسة': 5,
  'خمس': 5,
  'ستة': 6,
  'ست': 6,
  'سبعة': 7,
  'سبع': 7,
  'ثمانية': 8,
  'ثماني': 8,
  'ثمن': 8,
  'تسعة': 9,
  'تسع': 9,
  'عشرة': 10,
  'عشر': 10,
  'دعش': 11,
  'داعش': 11,
  'احداعش': 11,
  'اثنعش': 12,
  'ثنعش': 12,
  'تلطعش': 13,
  'اربعطعش': 14,
  'خمستعش': 15,
  'ستعش': 16,
  'سبعتعش': 17,
  'ثمنتعش': 18,
  'تسعتعش': 19,
  'عشرين': 20,
  'عشرون': 20,
  'ثلاثين': 30,
  'تلاثين': 30,
  'ثلاثون': 30,
  'اربعين': 40,
  'أربعين': 40,
  'اربعون': 40,
  'خمسين': 50,
  'خمسون': 50,
  'ستين': 60,
  'ستون': 60,
  'سبعين': 70,
  'سبعون': 70,
  'ثمانين': 80,
  'ثمانون': 80,
  'تسعين': 90,
  'تسعون': 90,
  'مية': 100,
  'ميه': 100,
  'مائة': 100,
  'مئة': 100,
  'ميتين': 200,
  'مئتين': 200,
  'تلثمية': 300,
  'ثلاثمية': 300,
  'ثلاثمائة': 300,
  'اربعمية': 400,
  'أربعمية': 400,
  'اربعمائة': 400,
  'خمسمية': 500,
  'خمسمائة': 500,
  'ستمية': 600,
  'ستمائة': 600,
  'سبعمية': 700,
  'سبعمائة': 700,
  'ثمانمية': 800,
  'ثمنمية': 800,
  'ثمانمائة': 800,
  'تسعمية': 900,
  'تسعمائة': 900,
};

export interface ParseNumberOptions {
  /** Exchange rate for market terms like 'ورقة' (100 USD in IQD). Defaults to 150,000 IQD. */
  defaultUsdSheetRateIQD?: number;
}

/**
 * Resolves a single token to its numeric value.
 * Preserves words starting with or containing "و" (such as "واحد" and "عشرون"),
 * while properly treating a leading "و" as a conjunction only when the rest of the word is a known number.
 */
function resolveToken(token: string): number | null {
  // 1. Direct match in dictionary (e.g. "واحد", "عشرون", "مية", "خمسة")
  if (BASE_NUMBERS[token] !== undefined) {
    return BASE_NUMBERS[token]!;
  }

  // 2. Conjunction prefix attached to a recognized word (e.g. "وعشرين", "وخمسة", "وواحد")
  if (token.startsWith('و') && token.length > 1) {
    const withoutWaw = token.slice(1);
    if (BASE_NUMBERS[withoutWaw] !== undefined) {
      return BASE_NUMBERS[withoutWaw]!;
    }
    if (/^\d+$/.test(withoutWaw)) {
      return parseInt(withoutWaw, 10);
    }
  }

  // 3. Pure digits
  if (/^\d+$/.test(token)) {
    return parseInt(token, 10);
  }

  return null;
}

/**
 * Parses numeric text from customer messages into integer IQD units.
 * Returns null if no valid number could be extracted.
 */
export function parseIraqiNumber(rawInput: string, options?: ParseNumberOptions): number | null {
  if (!rawInput || typeof rawInput !== 'string') return null;

  let text = rawInput.trim();
  if (text.length === 0) return null;

  // Normalize Arabic-Indic and Persian digits
  text = normalizeDigits(text);

  // Remove common polite or inquiry words
  text = text.replace(/^(حدود|تقريباً|تقريبا|ميزانيتي|بسعر|بحدود|حوالي|أريد|اريد|عندي|يم|سعر|بـ|ب)\s+/gi, '');
  text = text.replace(/\s+(دينار|د\.ع|عراقي|الف دينار|ألف دينار|iqd)\s*$/gi, '');

  // 1. Direct Iraqi market slang terms:
  // "ورقة" = 100 USD (e.g. 150,000 IQD)
  const sheetRate = options?.defaultUsdSheetRateIQD ?? 150000;
  if (/^ورقة(\s+وحدة)?$/i.test(text.trim())) return sheetRate;
  if (/^ورقتين$/i.test(text.trim())) return sheetRate * 2;
  const sheetsMatch = text.match(/^(\d+)\s*(أوراق|اوراق|ورقة|ورقات)$/i);
  if (sheetsMatch && sheetsMatch[1]) {
    return parseInt(sheetsMatch[1], 10) * sheetRate;
  }

  // "دفتر" = 100 sheets = 10,000 USD
  if (/^دفتر$/i.test(text.trim())) return sheetRate * 100;
  if (/^دفترين$/i.test(text.trim())) return sheetRate * 200;

  // 2. Fractions with million / thousand:
  // "نص مليون" -> 500,000
  if (/^(نص|نصف)\s*مليون$/i.test(text)) return 500000;
  // "ربع مليون" -> 250,000
  if (/^ربع\s*مليون$/i.test(text)) return 250000;
  // "ثلاث\s*اربع\s*مليون" / "ثلاثة ارباع مليون" -> 750,000
  if (/^(ثلاث|ثلاثة|تلاث)\s*(أرباع|ارباع|اربع)\s*مليون$/i.test(text)) return 750000;

  // "مليون ونص" / "مليون ونصف" -> 1,500,000
  if (/^مليون\s*و\s*(نص|نصف)$/i.test(text)) return 1500000;
  // "مليون وربع" -> 1,250,000
  if (/^مليون\s*و\s*ربع$/i.test(text)) return 1250000;
  // "مليونين ونص" -> 2,500,000
  if (/^مليونين\s*و\s*(نص|نصف)$/i.test(text)) return 2500000;
  // "مليونين" -> 2,000,000
  if (/^مليونين$/i.test(text)) return 2000000;
  // "مليون" -> 1,000,000
  if (/^مليون$/i.test(text)) return 1000000;

  // Compound million combinations (e.g. "مليون وميتين الف", "مليون و 250 الف")
  const milMatch = text.match(/^(مليون|مليونين)\s*و\s*(.+)$/i);
  if (milMatch && milMatch[1] && milMatch[2]) {
    const baseMil = milMatch[1] === 'مليونين' ? 2000000 : 1000000;
    const remainder = parseIraqiNumber(milMatch[2], options);
    if (remainder !== null) {
      return baseMil + remainder;
    }
  }

  // 3. Numeric digits with multipliers (e.g. "100 الف", "1.5 مليون", "100k", "99,000")
  // Check for "X مليون"
  const millionMatch = text.match(/^(\d+(?:[.,]\d+)?)\s*(مليون|ملايين|m|M)$/i);
  if (millionMatch && millionMatch[1]) {
    const val = parseFloat(millionMatch[1].replace(',', '.'));
    if (!isNaN(val)) return Math.round(val * 1000000);
  }

  // Check for "X الف" or "X k"
  const thousandMatch = text.match(/^(\d+(?:[.,]\d+)?)\s*(ألف|الف|الاف|آلاف|k|K)$/i);
  if (thousandMatch && thousandMatch[1]) {
    const val = parseFloat(thousandMatch[1].replace(',', '.'));
    if (!isNaN(val)) return Math.round(val * 1000);
  }

  // 4. Pure digits with thousand separators ("99,000", "١٠٠٬٠٠٠", "100 000")
  const cleanNumeric = text.replace(/[,٬'\s]/g, '');
  if (/^\d+$/.test(cleanNumeric)) {
    const parsed = parseInt(cleanNumeric, 10);
    if (!isNaN(parsed)) return parsed;
  }

  // 5. Compound Arabic words (e.g. "مية الف", "خمسين الف", "خمسة وعشرين الف", "واحد وعشرين الف")
  let multiplier = 1;
  let workingText = text;

  if (/(ألف|الف|الاف|آلاف)$/i.test(workingText)) {
    multiplier = 1000;
    workingText = workingText.replace(/\s*(ألف|الف|الاف|آلاف)$/i, '').trim();
  } else if (/(مليون|ملايين)$/i.test(workingText)) {
    multiplier = 1000000;
    workingText = workingText.replace(/\s*(مليون|ملايين)$/i, '').trim();
  }

  // Split strictly by whitespace so that "و" inside words (like "واحد" or "عشرون") is never destroyed
  const rawTokens = workingText.split(/\s+/).filter(Boolean);
  if (rawTokens.length > 0) {
    let sum = 0;
    let allTokensRecognized = true;

    for (let i = 0; i < rawTokens.length; i++) {
      const token = rawTokens[i]!;

      // Standalone "و" is accepted only as a conjunction between two valid number tokens
      if (token === 'و') {
        if (i === 0 || i === rawTokens.length - 1) {
          allTokensRecognized = false;
          break;
        }
        continue;
      }

      const val = resolveToken(token);
      if (val !== null) {
        sum += val;
      } else {
        allTokensRecognized = false;
        break;
      }
    }

    if (allTokensRecognized && sum > 0) {
      return sum * multiplier;
    }
  }

  return null;
}
