import type { AIMessage } from '../types';

/**
 * Deterministic conversation helpers for the Iraqi sales persona.
 * Everything that gates a real action (order approval, handoff) lives here as code,
 * not as a System Prompt suggestion.
 */

export type ConversationStage =
  | 'discovery' // understand need: usage, budget, preferences
  | 'search' // enough info -> look up products via tools
  | 'recommendation' // recommend / compare from tool data
  | 'objection' // price / trust / hesitation
  | 'order_review' // draft exists, customer reviews it
  | 'approval' // customer explicitly approved the reviewed draft
  | 'handoff'; // a human should take over

// ----------------------------------------------------------------------------
// Arabic normalization (for matching only; original text is never altered)
// ----------------------------------------------------------------------------

export function normalizeForMatching(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ڤ/g, 'ف')
    .replace(/گ/g, 'ك')
    .toLowerCase()
    .trim();
}

function tokenize(input: string): string[] {
  return normalizeForMatching(input)
    .split(/[\s،,.!؟?:;()"'«»-]+/)
    .filter((t) => t.length > 0);
}

// ----------------------------------------------------------------------------
// Explicit order approval
// ----------------------------------------------------------------------------

const APPROVE_TOKENS = new Set([
  'اكد',
  'اكده',
  'اكدي',
  'اكدلي',
  'اكدليياه',
  'اكدلياها',
  'تاكيد',
  'ثبت',
  'ثبته',
  'ثبتي',
  'اثبته',
  'موافق',
  'اوافق',
  'اعتمد',
  'اعتمده',
]);

// Negation, hesitation, questions, and instruction-override attempts all cancel approval.
const BLOCK_TOKENS = new Set([
  'لا',
  'ما',
  'مو',
  'مب',
  'لاتاكد',
  'لحظه',
  'شوي',
  'اسال',
  'افكر',
  'اشاور',
  'بعدين',
  'لسه',
  'هل',
  'شلون',
  'ليش',
  'كم',
  'الغي',
  'الغاء',
  'الغ',
  'تراجع',
  'اعتبرني',
  'اعتبر',
  'افترض',
  'تجاهل',
  'تخطي',
  'تخطَّ',
  'بدون',
  'اذا',
  'لو',
]);

/**
 * True only when the CUSTOMER'S latest message is an unambiguous approval.
 * Questions, negations, hesitation, conditionals and "assume I agreed" tricks are rejected.
 */
export function isExplicitOrderApproval(customerMessage: string): boolean {
  if (/[?؟]/.test(customerMessage)) {
    return false;
  }
  const tokens = tokenize(customerMessage);
  if (tokens.length === 0 || tokens.length > 8) {
    return false;
  }
  if (tokens.some((t) => BLOCK_TOKENS.has(t))) {
    return false;
  }
  return tokens.some((t) => APPROVE_TOKENS.has(t));
}

// ----------------------------------------------------------------------------
// Pending draft discovery (derived only from tool messages in history)
// ----------------------------------------------------------------------------

export interface PendingDraft {
  draftOrderId: string;
}

const DRAFT_MODIFICATION_REGEX =
  /(اغير|غير|تغيير|بدل|تبديل|تعديل|عدل|ضيف|اضف|اضافه|احذف|شيل|الغي|الغاء)/;

/**
 * A draft is "pending review" only when it was created in an EARLIER turn AND the assistant
 * replied after it (i.e. the customer saw the review), and it was not confirmed or invalidated
 * by a customer modification request since.
 * This blocks draft+confirm in the same turn and rejects stale approvals after draft modification.
 */
export function findPendingDraft(history: AIMessage[]): PendingDraft | null {
  let draftIndex = -1;
  let draftOrderId = '';

  history.forEach((m, i) => {
    if (m.role === 'tool' && m.name === 'create_order_draft') {
      try {
        const data = JSON.parse(m.content) as { success?: boolean; draftOrderId?: string };
        if (data.success === true && typeof data.draftOrderId === 'string') {
          draftIndex = i;
          draftOrderId = data.draftOrderId;
        }
      } catch {
        // ignore malformed tool content
      }
    }
  });

  if (draftIndex < 0) return null;

  const after = history.slice(draftIndex + 1);
  const reviewShown = after.some(
    (m) => m.role === 'assistant' && m.content.trim().length > 0 && !(m.toolCalls && m.toolCalls.length > 0)
  );
  if (!reviewShown) return null;

  const confirmedAfter = after.some((m) => {
    if (m.role !== 'tool' || m.name !== 'confirm_order') return false;
    try {
      return (JSON.parse(m.content) as { confirmed?: boolean }).confirmed === true;
    } catch {
      return false;
    }
  });
  if (confirmedAfter) return null;

  const modifiedAfter = after.some((m) => {
    if (m.role !== 'user') return false;
    return DRAFT_MODIFICATION_REGEX.test(normalizeForMatching(m.content));
  });
  if (modifiedAfter) return null;

  return { draftOrderId };
}

// ----------------------------------------------------------------------------
// Handoff triggers
// ----------------------------------------------------------------------------

export interface HandoffSuggestion {
  code: 'human_requested' | 'complaint' | 'wholesale' | 'custom_discount' | 'unsupported_policy';
  reason: string;
}

const HANDOFF_RULES: Array<{ code: HandoffSuggestion['code']; reason: string; test: RegExp }> = [
  {
    code: 'human_requested',
    reason: 'العميل طلب التحدث مع موظف',
    test: /(اريد|ابي|ابغي|اكلم|كلمني|حولني|احچي|اتكلم).{0,12}(موظف|شخص|انسان|مسوول|مدير)|(موظف|مسوول|مدير)\s*(بشري|حقيقي)/,
  },
  {
    code: 'complaint',
    reason: 'شكوى أو مشكلة بعد الشراء',
    test: /(شكوي|اشتكي|مشكله\s+(ب|في|وياه|عندي)|استرجاع|ارجاع|مرتجع|تالف|خربان|ما\s+يشتغل|زعلان)/,
  },
  {
    code: 'wholesale',
    reason: 'طلب جملة أو مشتريات شركات',
    test: /(جمله|للشركه|لشركتنا|فاتوره\s+شركه|كميه\s+كبيره|\d{2,}\s*(جهاز|قطعه|هاتف))/,
  },
  {
    code: 'custom_discount',
    reason: 'العميل يطلب خصماً أو سعراً خاصاً خارج المعتمد',
    test: /(اخر\s+سعر|نزل\s+(لي\s+)?السعر|خصم\s+(خاص|اضافي|اكثر)|سعر\s+خاص|ساوم)/,
  },
  {
    code: 'unsupported_policy',
    reason: 'سؤال عن سياسة غير معتمدة (تقسيط/ضمان ممتد/عنوان الفرع/ساعات الدوام)',
    test: /(تقسيط|اقساط|ساعات\s+(الدوام|العمل)|عنوان\s+الفرع|وين\s+الفرع|رقم\s+(الفرع|المحل)|ضمان\s+ممتد)/,
  },
];

export function detectHandoffTrigger(customerMessage: string): HandoffSuggestion | null {
  const text = normalizeForMatching(customerMessage);
  for (const rule of HANDOFF_RULES) {
    if (rule.test.test(text)) {
      return { code: rule.code, reason: rule.reason };
    }
  }
  return null;
}

// ----------------------------------------------------------------------------
// Known customer info (so the assistant does not re-ask answered questions)
// ----------------------------------------------------------------------------

export interface CustomerProfile {
  budgetIQD?: number;
  targetPricesIQD?: number[];
  usages: string[];
  brands: string[];
}

/**
 * Near-price policy constants:
 * A product in the catalog is considered "near" a customer's target price only when
 * |actualPriceIQD - targetPriceIQD| <= max(NEAR_PRICE_MIN_TOLERANCE_IQD, targetPriceIQD * NEAR_PRICE_MAX_RATIO).
 * Default: ±15% of the target price (minimum 25,000 IQD).
 */
export const NEAR_PRICE_MAX_RATIO = 0.15;
export const NEAR_PRICE_MIN_TOLERANCE_IQD = 25_000;

export interface PriceTargetCandidate {
  id: string;
  nameAr: string;
  nameEn?: string;
  brand?: string;
  category?: string;
  basePriceIQD: number;
  salePriceIQD?: number;
  isAvailable?: boolean;
  totalStock?: number;
  branches?: Array<{ branchId: string; quantity: number; available: boolean }>;
}

export interface PriceTargetMatchedItem {
  id: string;
  nameAr: string;
  priceIQD: number;
  diffIQD: number;
  signedDiffIQD: number;
}

export interface PriceTargetMatch {
  targetPriceIQD: number;
  toleranceIQD: number;
  minNearPriceIQD: number;
  maxNearPriceIQD: number;
  isNear: boolean;
  matchedProduct: PriceTargetMatchedItem | null;
  closestAlternatives: PriceTargetMatchedItem[];
}

const USAGE_RULES: Array<{ usage: string; test: RegExp }> = [
  { usage: 'gaming', test: /(العاب|لعب|gaming|ببجي|pubg)/ },
  { usage: 'camera', test: /(كاميرا|تصوير|صور)/ },
  { usage: 'student', test: /(طالب|دراسه|جامعه|مدرسه)/ },
  { usage: 'battery', test: /(بطاريه|شحن)/ },
  { usage: 'work', test: /(شغل|عمل|دوام|مكتب)/ },
];

const BRAND_RULES: Array<{ brand: string; test: RegExp }> = [
  { brand: 'Apple', test: /(ايفون|آيفون|ابل|apple|iphone)/ },
  { brand: 'Samsung', test: /(سامسونج|سامسونك|samsung|جالكسي|كالكسي|galaxy)/ },
  { brand: 'Xiaomi', test: /(شاومي|شياومي|xiaomi|redmi|ريدمي)/ },
  { brand: 'Infinix', test: /(انفنكس|انفينيكس|infinix)/ },
  { brand: 'Tecno', test: /(تكنو|tecno)/ },
];

const MODEL_PREFIX_BEFORE_NUMBER =
  /(?:[a-z]|ايفون|نوت|note|سبارك|spark|ريدمي|redmi|جالكسي|كالكسي|galaxy|واتش|watch|جيل|تاب|tab|انكر|anker)\s*$/i;

const SPEC_UNIT_AFTER_NUMBER =
  /^\s*(?:gb|tb|كيكا|كيكابايت|كيجا|جيجا|ميكا|mp|mah|واط|w\b|hz|بوصه|ملم|mm|شهر|اشهر|%|٪)/i;

const LOCAL_PRICE_CUE_BEFORE_NUMBER =
  /(?:سعر|سعره|بسعر|بحدود|حدود|ميزانيه|ميزانيتي|مبلغ|ادفع|عندي|ابو|بـ|ب\s|و\s*موبايل|و\s*جهاز|و\s*تلفون|بين\s*\d[\d,\s]*و)\s*$/;

const ARABIC_HUNDRED_WORDS: Record<string, number> = {
  ميه: 100,
  مائه: 100,
  مئه: 100,
  ميتين: 200,
  مئتين: 200,
  تلثميه: 300,
  ثلاثميه: 300,
  ثلاثمائه: 300,
  اربعميه: 400,
  اربعمائه: 400,
  خمسميه: 500,
  خمسمائه: 500,
  ستميه: 600,
  ستمائه: 600,
  سبعميه: 700,
  سبعمائه: 700,
  ثمانميه: 800,
  ثمنميه: 800,
  ثمانمائه: 800,
  تسعميه: 900,
  تسعمائه: 900,
};

/**
 * Extracts all target prices / budgets mentioned in a customer message as separate IQD amounts
 * in order of appearance, without merging them into a single budget.
 *
 * Examples:
 * - "موبايل سعره 400 ألف وتقارن لي موبايل سعره 500 وياها" -> [400000, 500000]
 * - "موبايل سعره ٤٠٠ ألف وتقارن لي موبايل سعره ٥٠٠ ألف" -> [400000, 500000]
 * - "ميزانيتي 800 الف" -> [800000]
 */
export function extractTargetPricesIQD(customerMessage: string): number[] {
  const text = normalizeForMatching(customerMessage).replace(/(\d)[٬،](\d)/g, '$1,$2');
  if (
    !/(ميزانيه|ميزانيتي|ادفع|بحدود|حدود|عندي|مبلغ|سعر|سعره|بسعر|ابو|الى|لحد|max|budget|الف|الاف|مليون|دينار)/.test(
      text
    )
  ) {
    return [];
  }

  const hasExplicitThousandWord = /(?:^|\s|\d)(الف|الاف)(?:\s|$|[،,.؟?])/.test(text);
  const found: Array<{ index: number; value: number }> = [];

  const addValue = (index: number, value: number) => {
    if (!Number.isFinite(value) || value < 10_000) return;
    const rounded = Math.round(value);
    if (!found.some((item) => item.value === rounded)) {
      found.push({ index, value: rounded });
    }
  };

  // 1. Compound million phrases ("مليون ونص", "نص مليون", "ربع مليون")
  for (const m of text.matchAll(/مليون\s+و\s*(?:نص|نصف)/g)) {
    addValue(m.index ?? 0, 1_500_000);
  }
  for (const m of text.matchAll(/مليون\s+و\s*ربع/g)) {
    addValue(m.index ?? 0, 1_250_000);
  }
  for (const m of text.matchAll(/(?:^|\s)(?:نص|نصف)\s+مليون/g)) {
    addValue(m.index ?? 0, 500_000);
  }
  for (const m of text.matchAll(/(?:^|\s)ربع\s+مليون/g)) {
    addValue(m.index ?? 0, 250_000);
  }

  // 2. Numeric tokens with explicit or contextual multipliers
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(مليون|ملايين|الف|الاف|k|m)?/gi)) {
    const rawNum = m[1];
    if (!rawNum) continue;
    const matchIndex = m.index ?? 0;
    const matchEnd = matchIndex + m[0].length;

    const beforeSlice = text.slice(Math.max(0, matchIndex - 24), matchIndex);
    const afterSlice = text.slice(matchEnd, Math.min(text.length, matchEnd + 18));

    // Skip model numbers (e.g. A55, S24, iPhone 16, Note 13) and hardware specs (e.g. 256GB, 5000mAh)
    if (MODEL_PREFIX_BEFORE_NUMBER.test(beforeSlice)) continue;
    if (SPEC_UNIT_AFTER_NUMBER.test(afterSlice)) continue;

    const base = Number(rawNum.replace(/,/g, ''));
    if (!Number.isFinite(base) || base <= 0) continue;

    const unit = (m[2] || '').toLowerCase();
    let value = 0;

    if (unit === 'مليون' || unit === 'ملايين' || unit === 'm') {
      value = base * 1_000_000;
    } else if (unit === 'الف' || unit === 'الاف' || unit === 'k') {
      value = base * 1_000;
    } else if (base >= 10_000) {
      value = base;
    } else if (base >= 50 && base < 1_000) {
      // Shorthand Iraqi thousands: e.g. "سعره 400 ألف وتقارن لي موبايل سعره 500 وياها"
      if (LOCAL_PRICE_CUE_BEFORE_NUMBER.test(beforeSlice) || hasExplicitThousandWord) {
        value = base * 1_000;
      }
    }

    if (value >= 10_000) {
      addValue(matchIndex, value);
    }
  }

  // 3. Arabic hundred-word expressions (e.g. "اربعمية الف", "خمسمية الف")
  const hundredKeys = Object.keys(ARABIC_HUNDRED_WORDS).join('|');
  const wordRegex = new RegExp(`(?:^|\\s)(${hundredKeys})(?:\\s+(الف|الاف))?`, 'g');
  for (const m of text.matchAll(wordRegex)) {
    const word = m[1];
    if (!word) continue;
    const base = ARABIC_HUNDRED_WORDS[word];
    if (!base) continue;
    const matchIndex = m.index ?? 0;
    const beforeSlice = text.slice(Math.max(0, matchIndex - 24), matchIndex);
    if (m[2] || hasExplicitThousandWord || LOCAL_PRICE_CUE_BEFORE_NUMBER.test(beforeSlice)) {
      addValue(matchIndex, base * 1_000);
    }
  }

  if (found.length === 0 && /(^|\s)مليون(\s|$)/.test(text)) {
    return [1_000_000];
  }

  return found.sort((a, b) => a.index - b.index).map((item) => item.value);
}

/**
 * Parses an Iraqi budget phrase: "ميزانيتي 500 الف", "مليون ونص", "800,000", "٧٥٠ الف".
 * Returns undefined when no confident number is found.
 */
export function extractBudgetIQD(customerMessage: string): number | undefined {
  const prices = extractTargetPricesIQD(customerMessage);
  return prices[0];
}

/**
 * Detects whether the customer is asking the assistant to decide/recommend which option is better.
 */
export function isBestChoiceRequested(customerMessage: string): boolean {
  const text = normalizeForMatching(customerMessage);
  return /(يا\s*هو|ياهو|ايهما|ايهم|منو|اي\s+واحد|اي\s+جهاز).{0,18}(افضل|احسن|انسب|اقوي)|(قرر\s*لي|قررلي|اختار\s*لي|اختارلي|رشح\s*لي|رشحلي|شنو\s+تنصح|بشنو\s+تنصح|تنصحني\s+باي|الافضل\s+بينهم|الاحسن\s+بينهم)/.test(
    text
  );
}

/**
 * Deterministically matches catalog products to one or more target prices using the
 * Near-Price Policy (±15%, min 25,000 IQD tolerance) for available Karbala phones.
 */
export function matchProductsToPriceTargets(
  products: PriceTargetCandidate[],
  targetPricesIQD: number[],
  maxRatio: number = NEAR_PRICE_MAX_RATIO
): PriceTargetMatch[] {
  const availablePhones = products.filter((p) => {
    if (p.category && p.category !== 'phone') return false;
    if (p.isAvailable === false) return false;
    if (typeof p.totalStock === 'number' && p.totalStock <= 0) return false;
    if (Array.isArray(p.branches) && p.branches.length > 0) {
      const karbala = p.branches.find((b) => b.branchId === 'branch-karbala');
      if (!karbala || !karbala.available || karbala.quantity <= 0) return false;
    }
    return true;
  });

  const getPrice = (p: PriceTargetCandidate): number => p.salePriceIQD ?? p.basePriceIQD;
  const usedIds = new Set<string>();

  return targetPricesIQD.map((targetPriceIQD) => {
    const toleranceIQD = Math.max(
      NEAR_PRICE_MIN_TOLERANCE_IQD,
      Math.round(targetPriceIQD * maxRatio)
    );
    const minNearPriceIQD = Math.max(0, targetPriceIQD - toleranceIQD);
    const maxNearPriceIQD = targetPriceIQD + toleranceIQD;

    const ranked = availablePhones
      .map((p) => {
        const priceIQD = getPrice(p);
        const signedDiffIQD = priceIQD - targetPriceIQD;
        const diffIQD = Math.abs(signedDiffIQD);
        return {
          id: p.id,
          nameAr: p.nameAr,
          priceIQD,
          diffIQD,
          signedDiffIQD,
        };
      })
      .sort((a, b) => {
        if (a.diffIQD !== b.diffIQD) return a.diffIQD - b.diffIQD;
        return a.priceIQD - b.priceIQD;
      });

    const nearCandidate =
      ranked.find((item) => item.diffIQD <= toleranceIQD && !usedIds.has(item.id)) ??
      ranked.find((item) => item.diffIQD <= toleranceIQD) ??
      null;

    if (nearCandidate) {
      usedIds.add(nearCandidate.id);
    }

    // Build up to 2 closest alternatives (preferring closest lower + closest higher when available)
    const lowerClosest = ranked
      .filter((item) => item.priceIQD <= targetPriceIQD)
      .sort((a, b) => b.priceIQD - a.priceIQD)[0];
    const higherClosest = ranked
      .filter((item) => item.priceIQD > targetPriceIQD)
      .sort((a, b) => a.priceIQD - b.priceIQD)[0];

    const alternativesMap = new Map<string, PriceTargetMatchedItem>();
    if (lowerClosest) alternativesMap.set(lowerClosest.id, lowerClosest);
    if (higherClosest) alternativesMap.set(higherClosest.id, higherClosest);
    for (const item of ranked) {
      if (alternativesMap.size >= 2) break;
      alternativesMap.set(item.id, item);
    }

    return {
      targetPriceIQD,
      toleranceIQD,
      minNearPriceIQD,
      maxNearPriceIQD,
      isNear: nearCandidate !== null,
      matchedProduct: nearCandidate,
      closestAlternatives: Array.from(alternativesMap.values()),
    };
  });
}

export function extractCustomerProfile(messages: AIMessage[]): CustomerProfile {
  const profile: CustomerProfile = { usages: [], brands: [] };
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const text = normalizeForMatching(m.content);
    const prices = extractTargetPricesIQD(m.content);
    if (prices.length > 0) {
      profile.budgetIQD = prices[0]; // latest statement wins
      profile.targetPricesIQD = prices;
    }
    for (const u of USAGE_RULES) {
      if (u.test.test(text) && !profile.usages.includes(u.usage)) profile.usages.push(u.usage);
    }
    for (const b of BRAND_RULES) {
      if (b.test.test(text) && !profile.brands.includes(b.brand)) profile.brands.push(b.brand);
    }
  }
  return profile;
}

// ----------------------------------------------------------------------------
// Stage inference
// ----------------------------------------------------------------------------

const OBJECTION_TEST = /(غالي|مرتفع|كلش\s+غالي|اغلى|ارخص|مو\s+مقتنع|ما\s+اثق|اخاف|اشوف\s+بمكان\s+ثاني|اتردد|خصم|اخر\s+سعر)/;

export function inferStage(history: AIMessage[], customerMessage: string): ConversationStage {
  if (detectHandoffTrigger(customerMessage)) return 'handoff';

  const pending = findPendingDraft(history);
  if (pending) {
    return isExplicitOrderApproval(customerMessage) ? 'approval' : 'order_review';
  }

  if (OBJECTION_TEST.test(normalizeForMatching(customerMessage))) return 'objection';

  const profile = extractCustomerProfile([...history, { role: 'user', content: customerMessage }]);
  const hasRecommendedBefore = history.some(
    (m) => m.role === 'tool' && (m.name === 'search_products' || m.name === 'compare_products')
  );
  if (hasRecommendedBefore) return 'recommendation';

  const hasNeed = profile.budgetIQD !== undefined || profile.usages.length > 0 || profile.brands.length > 0;
  return hasNeed ? 'search' : 'discovery';
}
