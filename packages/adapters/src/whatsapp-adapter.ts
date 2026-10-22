import type {
  IWhatsAppAdapter,
  WhatsAppOrderPayload,
  WhatsAppSendResult,
} from './types';
import { brand } from '@tel/config/brand';

/**
 * Validates whether a phone number matches standard Iraqi mobile operator formats:
 * - Prefix: +9647, 009647, 07, or 7
 * - Followed by operator code (7, 8, 5, 9, 3, etc.) and 8 digits (total 10 digits after 0).
 */
export function isValidIraqiPhoneNumber(phone: string): boolean {
  const clean = phone.replace(/[\s\-()]/g, '');
  return /^(?:\+?964|00964|0)?7[3-9]\d{8}$/.test(clean);
}

/**
 * Normalizes an Iraqi phone number to standard E.164 format (+9647XXXXXXXXX).
 */
export function normalizeIraqiPhoneNumber(phone: string): string {
  const clean = phone.replace(/[\s\-()+]/g, '');
  if (clean.startsWith('964')) {
    return `+${clean}`;
  }
  if (clean.startsWith('00964')) {
    return `+${clean.substring(2)}`;
  }
  if (clean.startsWith('07')) {
    return `+964${clean.substring(1)}`;
  }
  if (clean.startsWith('7') && clean.length === 10) {
    return `+964${clean}`;
  }
  return `+${clean}`;
}

/**
 * Formats a clean, readable Arabic WhatsApp message text for order confirmation.
 */
export function formatOrderWhatsAppMessage(payload: WhatsAppOrderPayload): string {
  const paymentMethodAr =
    payload.paymentMethod === 'cash_on_delivery'
      ? 'الدفع نقداً عند الاستلام'
      : 'الدفع بالبطاقة الإلكترونية عند الاستلام';

  const itemsList = payload.items
    .map(
      (item, idx) =>
        `${idx + 1}. *${item.productNameAr}*\n   الكمية: ${item.quantity} | السعر: ${item.unitPriceIQD.toLocaleString()} د.ع | الإجمالي: ${item.subtotalIQD.toLocaleString()} د.ع`
    )
    .join('\n');

  const notesSection = payload.notes ? `\n\n📌 *ملاحظات:* ${payload.notes}` : '';

  return (
    `📦 *تأكيد طلب من ${brand.nameAr}*\n` +
    `رقم الطلب: #${payload.orderNumber}\n` +
    `-----------------------------------------\n` +
    `👤 *بيانات العميل:*\n` +
    `• الاسم: ${payload.customer.name}\n` +
    `• الهاتف: ${payload.customer.phone}\n` +
    `• العنوان: ${payload.customer.city} — ${payload.customer.addressDetails}\n` +
    `-----------------------------------------\n` +
    `🛍️ *المنتجات المطلوبة:*\n` +
    `${itemsList}\n` +
    `-----------------------------------------\n` +
    `🚚 أجور التوصيل: ${payload.deliveryFeeIQD.toLocaleString()} د.ع\n` +
    `💰 *المجموع الكلي:* *${payload.totalAmountIQD.toLocaleString()} د.ع*\n` +
    `💳 طريقة الدفع: ${paymentMethodAr}` +
    `${notesSection}\n\n` +
    `شكراً لتسوقك من ${brand.nameAr}!`
  );
}

export interface SentOrderRecord {
  messageId: string;
  payload: WhatsAppOrderPayload;
  formattedMessage: string;
  sentAt: string;
}

export interface SentHandoffAlertRecord {
  messageId: string;
  customerPhone: string;
  reason: string;
  conversationId: string;
  sentAt: string;
}

/**
 * Mock / In-Memory WhatsApp Cloud API Adapter (Agent 2, 4 & 5 Integration)
 * Adheres strictly to docs/CONTRACTS.md §2 and guarantees idempotency.
 */
export class MockWhatsAppAdapter implements IWhatsAppAdapter {
  private idempotencyCache: Map<string, WhatsAppSendResult> = new Map();
  private sentOrders: SentOrderRecord[] = [];
  private sentHandoffAlerts: SentHandoffAlertRecord[] = [];
  private simulateFailure = false;
  private failureErrorMessage = 'فشل محاكاة الاتصال بواجهة WhatsApp Cloud API';

  /**
   * Send order confirmation with strict idempotency and Iraqi data validation.
   */
  public async sendOrderConfirmation(payload: WhatsAppOrderPayload): Promise<WhatsAppSendResult> {
    const nowIso = new Date().toISOString();

    // 1. Idempotency Check: return previously cached result immediately
    const existing = this.idempotencyCache.get(payload.idempotencyKey);
    if (existing) {
      return { ...existing };
    }

    // 2. Simulated Failure Check
    if (this.simulateFailure) {
      const failResult: WhatsAppSendResult = {
        success: false,
        messageId: '',
        sentAt: nowIso,
        status: 'failed',
        error: this.failureErrorMessage,
      };
      return failResult;
    }

    // 3. Validation: Customer info
    if (!payload.customer.name || payload.customer.name.trim().length === 0) {
      return {
        success: false,
        messageId: '',
        sentAt: nowIso,
        status: 'failed',
        error: 'اسم العميل مطلوب ولا يمكن أن يكون فارغاً',
      };
    }

    if (!isValidIraqiPhoneNumber(payload.customer.phone)) {
      return {
        success: false,
        messageId: '',
        sentAt: nowIso,
        status: 'failed',
        error: `رقم الهاتف (${payload.customer.phone}) غير صالح للهواتف العراقية`,
      };
    }

    // 4. Validation: Items
    if (!payload.items || payload.items.length === 0) {
      return {
        success: false,
        messageId: '',
        sentAt: nowIso,
        status: 'failed',
        error: 'الطلب يجب أن يحتوي على منتج واحد على الأقل',
      };
    }

    // 5. Successful Send Emulation
    const messageId = `wa_msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const formattedMessage = formatOrderWhatsAppMessage(payload);

    const result: WhatsAppSendResult = {
      success: true,
      messageId,
      sentAt: nowIso,
      status: 'sent',
    };

    // Record message & cache idempotency key
    this.sentOrders.push({
      messageId,
      payload: {
        ...payload,
        items: payload.items.map((i) => ({ ...i })),
        customer: { ...payload.customer },
      },
      formattedMessage,
      sentAt: nowIso,
    });
    this.idempotencyCache.set(payload.idempotencyKey, result);

    return result;
  }

  /**
   * Send an urgent staff takeover handoff alert via WhatsApp.
   */
  public async sendHandoffAlert(
    customerPhone: string,
    reason: string,
    conversationId: string
  ): Promise<WhatsAppSendResult> {
    const nowIso = new Date().toISOString();

    if (this.simulateFailure) {
      return {
        success: false,
        messageId: '',
        sentAt: nowIso,
        status: 'failed',
        error: this.failureErrorMessage,
      };
    }

    const messageId = `wa_alt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    this.sentHandoffAlerts.push({
      messageId,
      customerPhone,
      reason,
      conversationId,
      sentAt: nowIso,
    });

    return {
      success: true,
      messageId,
      sentAt: nowIso,
      status: 'sent',
    };
  }

  // ==========================================================================
  // Inspection & Testing Helpers
  // ==========================================================================

  public getSentOrders(): SentOrderRecord[] {
    return [...this.sentOrders];
  }

  public getSentHandoffAlerts(): SentHandoffAlertRecord[] {
    return [...this.sentHandoffAlerts];
  }

  public clear(): void {
    this.idempotencyCache.clear();
    this.sentOrders = [];
    this.sentHandoffAlerts = [];
    this.simulateFailure = false;
  }

  public setSimulateFailure(fail: boolean, errorMessage?: string): void {
    this.simulateFailure = fail;
    if (errorMessage) {
      this.failureErrorMessage = errorMessage;
    }
  }
}

/** Backward compatibility alias */
export const InMemoryWhatsAppAdapter = MockWhatsAppAdapter;
