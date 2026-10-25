import type { ToolCallResponse } from '../types';
import { normalizeForMatching } from './conversation';

/**
 * Claims guard: blocks replies that CLAIM an action or fact the system cannot back.
 * Complements the numerical guard (which only checks numbers).
 */

export type ClaimViolationCode =
  | 'order_confirmed_without_success'
  | 'handoff_without_success'
  | 'unapproved_delivery_claim'
  | 'unapproved_policy_claim'
  | 'unapproved_discount_claim'
  | 'human_identity_claim';

export interface ClaimViolation {
  code: ClaimViolationCode;
  matched: string;
}

export interface ClaimsVerification {
  isSafe: boolean;
  violations: ClaimViolation[];
}

const ORDER_CONFIRMED =
  /(تم\s+(تاكيد|تثبيت|اعتماد|ارسال)\s+(ال)?طلب|طلبك\s+(تاكد|تثبت|وصل|ارسل)|اكدت\s+(لك\s+)?(ال)?طلب|تم\s+حجز\s+طلبك)/;

const HANDOFF_CLAIM =
  /(حولتك|حولتلك|حولناك|حولت\s+المحادثه|تم\s+تحويل(ك)?|تم\s+اشعار\s+(ال)?موظف|(ال)?موظف\s+(راح|رح|سوف|سيقوم)\s+(يتواصل|يتصل|يكلم)|سيتواصل\s+معك)/;

const DELIVERY_CLAIM =
  /(توصيل\s+مجاني|توصيل\s+مجانا|نوصل\s+(لكل|لجميع|لكافه)\s+(المحافظات|مناطق)|التوصيل\s+(ل)?كافه\s+المحافظات|(رسوم|اجور|كلفه|تكلفه|سعر)\s+(ال)?توصيل\s*(هي|هو|=|:|بس|فقط|\d)|توصيل\s+خلال\s+\S+\s+(ساعه|يوم|ايام))/;

const POLICY_CLAIM =
  /(ساعات\s+(ال)?(دوام|عمل)|دوامنا\s+من|عنوان\s+(ال)?فرع\s+(هو|:)|رقم\s+(ال)?(فرع|محل|هاتف)\s*(هو|:)|تقسيط\s+بدون|بدون\s+(فوايد|فوائد|مقدم)|ضمان\s+(ذهبي|ممتد|مدي\s+الحياه)|استرجاع\s+خلال)/;

const DISCOUNT_CLAIM = /(خصم\s+(خاص|اضافي|حصري|\d)|عرض\s+خاص\s+(اليوم|لك)|نزلتلك|نزلت\s+لك\s+السعر)/;

const HUMAN_CLAIM = /((انا|اني|اني\s+ان|انني)\s+(انسان|بشر|شخص\s+حقيقي|موظف(ه)?|اخوك)|مو\s+روبوت|لست\s+(روبوت|ذكاء))/;

function anySuccess(results: ToolCallResponse[], predicate: (data: Record<string, unknown>) => boolean): boolean {
  return results.some((r) => r.success && predicate(r.data ?? {}));
}

export function verifyReplyClaims(reply: string, toolResults: ToolCallResponse[]): ClaimsVerification {
  const text = normalizeForMatching(reply);
  const violations: ClaimViolation[] = [];

  const check = (re: RegExp, code: ClaimViolationCode, allowed: boolean): void => {
    const m = text.match(re);
    if (m && !allowed) violations.push({ code, matched: m[0] });
  };

  check(ORDER_CONFIRMED, 'order_confirmed_without_success', anySuccess(toolResults, (d) => d.confirmed === true));
  check(HANDOFF_CLAIM, 'handoff_without_success', anySuccess(toolResults, (d) => d.handoffInitiated === true));
  check(DELIVERY_CLAIM, 'unapproved_delivery_claim', anySuccess(toolResults, (d) => d.deliveryStatus === 'approved'));
  check(POLICY_CLAIM, 'unapproved_policy_claim', false);
  check(DISCOUNT_CLAIM, 'unapproved_discount_claim', anySuccess(toolResults, (d) => Array.isArray((d as { offers?: unknown }).offers) && ((d as { offers: unknown[] }).offers.length > 0)));
  check(HUMAN_CLAIM, 'human_identity_claim', false);

  return { isSafe: violations.length === 0, violations };
}

export const CLAIMS_BLOCKED_REPLY_AR =
  'عذراً، ما أگدر أأكد هالمعلومة من النظام حالياً. إذا تحب أقدر أرشّح لك موظف مبيعات يساعدك.';
