import { describe, it, expect, beforeEach } from 'vitest';
import {
  MockWhatsAppAdapter,
  isValidIraqiPhoneNumber,
  normalizeIraqiPhoneNumber,
  formatOrderWhatsAppMessage,
} from '../src/index';
import type { WhatsAppOrderPayload } from '../src/types';
import { brand } from '@tel/config/brand';

describe('WhatsApp Cloud API Adapter (MockWhatsAppAdapter)', () => {
  let adapter: MockWhatsAppAdapter;

  const validPayload: WhatsAppOrderPayload = {
    orderId: 'ord_12345',
    orderNumber: 'TB-2026-1042',
    idempotencyKey: 'idemp_key_abc_1',
    customer: {
      name: 'علي حسن السعدي',
      phone: '07801234567',
      city: 'بغداد',
      addressDetails: 'الكرادة داخل، محلة 903، زقاق 12',
    },
    items: [
      {
        productId: 'prod-ip16pm-256',
        productNameAr: 'آبل آيفون 16 برو ماكس 256 كيكابايت',
        quantity: 1,
        unitPriceIQD: 1850000,
        subtotalIQD: 1850000,
      },
      {
        productId: 'prod-acc-ip16pm-case',
        productNameAr: 'كفر سيليكون أصلي ماج سيف لآيفون 16 برو ماكس',
        quantity: 1,
        unitPriceIQD: 20000,
        subtotalIQD: 20000,
      },
    ],
    deliveryFeeIQD: 5000,
    totalAmountIQD: 1875000,
    paymentMethod: 'cash_on_delivery',
    notes: 'يرجى الاتصال قبل الوصول بنصف ساعة',
  };

  beforeEach(() => {
    adapter = new MockWhatsAppAdapter();
  });

  describe('Phone Helpers', () => {
    it('validates various Iraqi phone formats correctly', () => {
      expect(isValidIraqiPhoneNumber('07801234567')).toBe(true);
      expect(isValidIraqiPhoneNumber('+9647701234567')).toBe(true);
      expect(isValidIraqiPhoneNumber('009647501234567')).toBe(true);
      expect(isValidIraqiPhoneNumber('7901234567')).toBe(true);
      expect(isValidIraqiPhoneNumber('0780-123-4567')).toBe(true);
      expect(isValidIraqiPhoneNumber('+964 770 123 4567')).toBe(true);

      // Invalid formats
      expect(isValidIraqiPhoneNumber('07201234567')).toBe(false); // Invalid operator code (2)
      expect(isValidIraqiPhoneNumber('078012345')).toBe(false); // Too short
      expect(isValidIraqiPhoneNumber('0780123456789')).toBe(false); // Too long
      expect(isValidIraqiPhoneNumber('+12025550199')).toBe(false); // US number
      expect(isValidIraqiPhoneNumber('')).toBe(false);
    });

    it('normalizes Iraqi numbers to standard E.164 (+964...) format', () => {
      expect(normalizeIraqiPhoneNumber('07801234567')).toBe('+9647801234567');
      expect(normalizeIraqiPhoneNumber('7701234567')).toBe('+9647701234567');
      expect(normalizeIraqiPhoneNumber('009647501234567')).toBe('+9647501234567');
      expect(normalizeIraqiPhoneNumber('+9647801234567')).toBe('+9647801234567');
    });
  });

  describe('formatOrderWhatsAppMessage', () => {
    it('formats a detailed Arabic message with branding and order details', () => {
      const msg = formatOrderWhatsAppMessage(validPayload);
      expect(msg).toContain(brand.nameAr);
      expect(msg).toContain('#TB-2026-1042');
      expect(msg).toContain('علي حسن السعدي');
      expect(msg).toContain('07801234567');
      expect(msg).toContain('بغداد — الكرادة داخل');
      expect(msg).toContain('آبل آيفون 16 برو ماكس');
      expect(msg).toContain('1,850,000 د.ع');
      expect(msg).toContain('5,000 د.ع');
      expect(msg).toContain('1,875,000 د.ع');
      expect(msg).toContain('الدفع نقداً عند الاستلام');
      expect(msg).toContain('يرجى الاتصال قبل الوصول بنصف ساعة');
    });
  });

  describe('sendOrderConfirmation', () => {
    it('successfully sends order confirmation and records sent message', async () => {
      const res = await adapter.sendOrderConfirmation(validPayload);

      expect(res.success).toBe(true);
      expect(res.status).toBe('sent');
      expect(res.messageId).toMatch(/^wa_msg_/);
      expect(res.sentAt).toBeDefined();

      const orders = adapter.getSentOrders();
      expect(orders.length).toBe(1);
      expect(orders[0]!.messageId).toBe(res.messageId);
      expect(orders[0]!.payload.orderNumber).toBe('TB-2026-1042');
    });

    it('enforces strict idempotency (same idempotencyKey returns cached response without duplicate sending)', async () => {
      const first = await adapter.sendOrderConfirmation(validPayload);
      const second = await adapter.sendOrderConfirmation(validPayload);

      // Exactly identical result
      expect(second).toEqual(first);

      // Only ONE message was recorded
      expect(adapter.getSentOrders().length).toBe(1);
    });

    it('rejects order with invalid phone number gracefully', async () => {
      const invalidPhonePayload: WhatsAppOrderPayload = {
        ...validPayload,
        idempotencyKey: 'idemp_key_bad_phone',
        customer: {
          ...validPayload.customer,
          phone: '123456', // Invalid phone
        },
      };

      const res = await adapter.sendOrderConfirmation(invalidPhonePayload);
      expect(res.success).toBe(false);
      expect(res.status).toBe('failed');
      expect(res.error).toContain('غير صالح للهواتف العراقية');
      expect(adapter.getSentOrders().length).toBe(0);
    });

    it('rejects order with empty customer name gracefully', async () => {
      const emptyNamePayload: WhatsAppOrderPayload = {
        ...validPayload,
        idempotencyKey: 'idemp_key_empty_name',
        customer: {
          ...validPayload.customer,
          name: '   ',
        },
      };

      const res = await adapter.sendOrderConfirmation(emptyNamePayload);
      expect(res.success).toBe(false);
      expect(res.status).toBe('failed');
      expect(res.error).toContain('اسم العميل مطلوب');
    });

    it('rejects order with empty items list gracefully', async () => {
      const emptyItemsPayload: WhatsAppOrderPayload = {
        ...validPayload,
        idempotencyKey: 'idemp_key_empty_items',
        items: [],
      };

      const res = await adapter.sendOrderConfirmation(emptyItemsPayload);
      expect(res.success).toBe(false);
      expect(res.status).toBe('failed');
      expect(res.error).toContain('الطلب يجب أن يحتوي على منتج واحد');
    });

    it('simulates API network or gateway failures when configured', async () => {
      adapter.setSimulateFailure(true, 'انقطاع الاتصال بخادم WhatsApp API');

      const res = await adapter.sendOrderConfirmation({
        ...validPayload,
        idempotencyKey: 'idemp_key_sim_fail',
      });

      expect(res.success).toBe(false);
      expect(res.status).toBe('failed');
      expect(res.error).toBe('انقطاع الاتصال بخادم WhatsApp API');
    });
  });

  describe('sendHandoffAlert', () => {
    it('successfully sends staff takeover alert with phone, reason, and conversation ID', async () => {
      const res = await adapter.sendHandoffAlert(
        '07801234567',
        'طلب العميل التحدث مع موظف مبيعات بشري بخصوص تقسيط خاص',
        'conv_9988'
      );

      expect(res.success).toBe(true);
      expect(res.status).toBe('sent');
      expect(res.messageId).toMatch(/^wa_alt_/);

      const alerts = adapter.getSentHandoffAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0]!.customerPhone).toBe('07801234567');
      expect(alerts[0]!.reason).toContain('طلب العميل التحدث مع موظف');
      expect(alerts[0]!.conversationId).toBe('conv_9988');
    });

    it('respects simulated failure for handoff alerts', async () => {
      adapter.setSimulateFailure(true);
      const res = await adapter.sendHandoffAlert('07801234567', 'test', 'conv_1');
      expect(res.success).toBe(false);
      expect(res.status).toBe('failed');
    });
  });
});
