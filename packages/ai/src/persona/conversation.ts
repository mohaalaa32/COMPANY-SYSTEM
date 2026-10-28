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
    return DRAFT_MODIFICATION_REGEX.test(normalizeIraqiText(m.content));
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
  usages: string[];
  brands: string[];
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
  { brand: 'Samsung', test: /(سامسونج|سامسونك|samsung|جالكسي|galaxy)/ },
  { brand: 'Xiaomi', test: /(شاومي|شياومي|xiaomi|redmi|ريدمي)/ },
];

/**
 * Parses an Iraqi budget phrase: "ميزانيتي 500 الف", "مليون ونص", "800,000", "٧٥٠ الف".
 * Returns undefined when no confident number is found.
 */
export function extractBudgetIQD(customerMessage: string): number | undefined {
  const text = normalizeForMatching(customerMessage);
  if (!/(ميزانيه|ميزانيتي|ادفع|بحدود|حدود|عندي|مبلغ|سعر|الى|لحد|max|budget|الف|مليون)/.test(text)) {
    return undefined;
  }

  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(مليون|الف)?/g)) {
    if (!m[1]) continue;
    const base = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(base) || base <= 0) continue;
    const value = m[2] === 'مليون' ? base * 1_000_000 : m[2] === 'الف' ? base * 1_000 : base;
    if (value >= 10_000) return value;
  }

  if (/مليون\s+و\s*نص/.test(text)) return 1_500_000;
  if (/(^|\s)مليون(\s|$)/.test(text)) return 1_000_000;
  return undefined;
}

export function extractCustomerProfile(messages: AIMessage[]): CustomerProfile {
  const profile: CustomerProfile = { usages: [], brands: [] };
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const text = normalizeForMatching(m.content);
    const budget = extractBudgetIQD(m.content);
    if (budget !== undefined) profile.budgetIQD = budget; // latest statement wins
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
