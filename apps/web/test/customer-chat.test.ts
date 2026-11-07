import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

process.env.KB_SQLITE_PATH = ':memory:';

import { KARBALA_BRANCH_ID } from '@tel/adapters';
import { MockLLMProvider } from '@tel/ai';
import { POST as chatPost } from '../src/app/api/chat/route';
import {
  MAX_CUSTOMER_MESSAGE_LENGTH,
  validateCustomerChatMessage,
  type CustomerChatTurnResponse,
} from '../src/lib/chat-model';
import {
  getChatSessionHistory,
  processCustomerChatTurn,
  resetChatSessionsForTesting,
} from '../src/lib/chat-server';

function buildChatRequest(
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>
): Request {
  return new Request('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

describe('Customer Interactive Local Chat & /api/chat Route (Batch 1-A1)', () => {
  beforeEach(() => {
    resetChatSessionsForTesting();
  });

  it('validates customer chat messages (rejects empty, non-string, or overly long messages)', () => {
    expect(validateCustomerChatMessage('').valid).toBe(false);
    expect(validateCustomerChatMessage('   ').valid).toBe(false);
    expect(validateCustomerChatMessage(null).valid).toBe(false);
    expect(validateCustomerChatMessage('أ'.repeat(MAX_CUSTOMER_MESSAGE_LENGTH + 1)).valid).toBe(
      false
    );

    const ok = validateCustomerChatMessage('  ميزانيتي 400 ألف دينار  ');
    expect(ok.valid).toBe(true);
    expect(ok.message).toBe('ميزانيتي 400 ألف دينار');
  });

  it('enforces CSRF protection (403) and input validation (400) on POST /api/chat', async () => {
    const crossSiteReq = buildChatRequest(
      { message: 'مرحبا' },
      { 'sec-fetch-site': 'cross-site' }
    );
    const crossSiteRes = await chatPost(crossSiteReq);
    expect(crossSiteRes.status).toBe(403);

    const emptyReq = buildChatRequest({ message: '   ' });
    const emptyRes = await chatPost(emptyReq);
    expect(emptyRes.status).toBe(400);
    const emptyBody = (await emptyRes.json()) as { errorAr?: string };
    expect(emptyBody.errorAr).toContain('فارغة');
  });

  it('processes a budget inquiry through SalesAIAgent + MockLLMProvider and returns Karbala-scoped products without costIQD', async () => {
    const req = buildChatRequest({
      message: 'ميزانيتي 350 ألف دينار، شنو تنصحوني؟',
    });
    const res = await chatPost(req);
    expect(res.status).toBe(200);

    const data = (await res.json()) as CustomerChatTurnResponse;
    expect(data.providerMode).toBe('mock');
    expect(data.dataMode).toBe('mock');
    expect(data.branchId).toBe(KARBALA_BRANCH_ID);
    expect(data.isSafe).toBe(true);
    expect(data.rejected).toBe(false);
    expect(data.toolsUsed).toContain('calculate_budget_and_price');
    expect(data.reply).toContain('350,000');
    expect(data.products.length).toBeGreaterThan(0);

    for (const prod of data.products) {
      expect(prod.priceIQD).toBeLessThanOrEqual(350_000);
      expect((prod as unknown as Record<string, unknown>).costIQD).toBeUndefined();
      expect((prod as unknown as Record<string, unknown>).minMarginPct).toBeUndefined();
    }
  });

  it('processes product search and comparison turns while preserving multi-turn session history in memory', async () => {
    const turn1Res = await chatPost(
      buildChatRequest({
        message: 'عندكم سامسونج A55؟',
      })
    );
    expect(turn1Res.status).toBe(200);
    const turn1 = (await turn1Res.json()) as CustomerChatTurnResponse;

    expect(turn1.toolsUsed).toContain('search_products');
    expect(turn1.products.some((p) => p.id === 'prod-a55-256')).toBe(true);
    expect(turn1.isSafe).toBe(true);

    // Follow-up turn using the same conversationId
    const turn2Res = await chatPost(
      buildChatRequest({
        conversationId: turn1.conversationId,
        message: 'مقارنة منتجات بين ريدمي وسامسونج',
      })
    );
    expect(turn2Res.status).toBe(200);
    const turn2 = (await turn2Res.json()) as CustomerChatTurnResponse;

    expect(turn2.conversationId).toBe(turn1.conversationId);
    expect(turn2.toolsUsed).toContain('compare_products');
    expect(turn2.comparedProducts.length).toBeGreaterThanOrEqual(2);
    for (const item of turn2.comparedProducts) {
      expect((item as unknown as Record<string, unknown>).costIQD).toBeUndefined();
    }

    const savedHistory = getChatSessionHistory(turn1.conversationId);
    expect(savedHistory.length).toBe(4); // 2 user + 2 assistant messages
  });

  it('handles human handoff requests safely via MockWhatsAppAdapter without external calls', async () => {
    const res = await chatPost(
      buildChatRequest({
        message: 'أريد التحدث مع موظف مبيعات لو سمحت',
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as CustomerChatTurnResponse;

    expect(data.toolsUsed).toContain('handoff_to_human');
    expect(data.handoffInitiated).toBe(true);
    expect(data.isSafe).toBe(true);
    expect(data.reply).toContain('موظف');
  });

  it('enforces numerical and claims safety guards when a provider emits an ungrounded number', async () => {
    const badProvider = new MockLLMProvider({
      queuedResponses: [
        {
          content: 'سعر الجهاز اليوم 123,456 دينار فقط!',
        },
      ],
    });

    const turn = await processCustomerChatTurn(
      { message: 'كم السعر؟' },
      { provider: badProvider }
    );

    expect(turn.isSafe).toBe(false);
    expect(turn.rejected).toBe(true);
    expect(turn.reply).toContain('تم حجب الرد');
    expect(turn.reply).not.toContain('123,456');
  });

  it('reproduces and resolves the two-price comparison prompt (400k vs 500k) with real near-price catalog phones and conditional recommendation', async () => {
    const res = await chatPost(
      buildChatRequest({
        message:
          'أريد تجيب لي موبايل سعره 400 ألف وتقارن لي موبايل سعره 500 وياها، وأنت قرر لي يا هو الأفضل',
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as CustomerChatTurnResponse;

    expect(data.isSafe).toBe(true);
    expect(data.rejected).toBe(false);
    expect(data.toolsUsed).toEqual(['search_products', 'compare_products']);

    // Selects the actual closest available Karbala phones for 400k (420,000 IQD) and 500k (475,000 IQD),
    // NOT the unrelated 250,000 and 215,000 IQD phones.
    expect(data.comparedProducts.map((p) => p.id)).toEqual([
      'prod-rn13pro-256',
      'prod-a55-256',
    ]);
    expect(data.comparedProducts.map((p) => p.priceIQD)).toEqual([420_000, 475_000]);
    expect(data.products.map((p) => p.id)).toEqual(['prod-rn13pro-256', 'prod-a55-256']);

    // Reply explains both targets (400,000 and 500,000), their actual prices (420,000 and 475,000),
    // real specs (12GB vs 8GB, 200MP vs 50MP), conditional recommendation, and asks about usage.
    expect(data.reply).toContain('400,000');
    expect(data.reply).toContain('420,000');
    expect(data.reply).toContain('500,000');
    expect(data.reply).toContain('475,000');
    expect(data.reply).not.toContain('250,000');
    expect(data.reply).not.toContain('215,000');
    expect(data.reply).toContain('الترشيح المشروط');
    expect(data.reply).toContain('استخدامك الأساسي');

    for (const item of data.comparedProducts) {
      expect((item as unknown as Record<string, unknown>).costIQD).toBeUndefined();
      expect((item as unknown as Record<string, unknown>).minMarginPct).toBeUndefined();
    }
  });

  it('handles Arabic-Indic two-price comparison (٤٠٠ ألف vs ٥٠٠ ألف) and tailors recommendation when usage is provided', async () => {
    const res = await chatPost(
      buildChatRequest({
        message:
          'أريد تجيب لي موبايل سعره ٤٠٠ ألف وتقارن لي موبايل سعره ٥٠٠ ألف وياها للألعاب والتصوير، وأنت قرر لي يا هو الأفضل',
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as CustomerChatTurnResponse;

    expect(data.isSafe).toBe(true);
    expect(data.rejected).toBe(false);
    expect(data.comparedProducts.map((p) => p.id)).toEqual([
      'prod-rn13pro-256',
      'prod-a55-256',
    ]);
    expect(data.reply).toContain('400,000');
    expect(data.reply).toContain('500,000');
    expect(data.reply).toContain('أرشحلك شاومي ريدمي نوت 13 برو بلس 5G');
    expect(data.reply).toContain('12GB');
  });

  it('explains clearly when no phone is near one of the requested prices and offers real catalog alternatives without inventing prices', async () => {
    const res = await chatPost(
      buildChatRequest({
        message:
          'أريد موبايل سعره ٤٠٠ ألف وتقارن لي موبايل سعره ٧٥٠ ألف وياها، وأنت قرر لي يا هو الأفضل',
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as CustomerChatTurnResponse;

    expect(data.isSafe).toBe(true);
    expect(data.rejected).toBe(false);
    expect(data.toolsUsed).toEqual(['search_products', 'compare_products']);

    // Because 750,000 IQD has no near phone in the catalog (±15%), it does not force a false comparison table;
    // instead it explains the gap and presents the closest real available alternatives (420k, 475k, 1,025k).
    expect(data.comparedProducts).toEqual([]);
    expect(data.products.length).toBeGreaterThanOrEqual(2);
    expect(data.reply).toContain('400,000');
    expect(data.reply).toContain('420,000');
    expect(data.reply).toContain('750,000');
    expect(data.reply).toContain('لا يتوفر جهاز قريب من هذا السعر');
    expect(data.reply).toContain('475,000');
    expect(data.reply).toContain('1,025,000');
    expect(data.reply).toContain('هل تقبل');
  });

  it('prevents horizontal clipping in CompareTable via fixed layout and text wrapping across RTL, Light, and Dark modes', () => {
    const customerCss = readFileSync(
      join(__dirname, '..', 'src', 'styles', 'customer.css'),
      'utf-8'
    );
    const tokensCss = readFileSync(
      join(__dirname, '..', 'src', 'styles', 'tokens.css'),
      'utf-8'
    );
    const cardsTsx = readFileSync(
      join(__dirname, '..', 'src', 'components', 'customer', 'product-cards.tsx'),
      'utf-8'
    );

    // Table uses fixed layout and wraps text instead of forcing nowrap overflow
    expect(customerCss).toContain('table-layout: fixed');
    expect(customerCss).toContain('overflow-wrap: anywhere');
    expect(customerCss).toContain('.compare-product-name-ar');

    // CompareTable renders Arabic product names and full spec rows (camera, processor, battery, RAM, storage)
    expect(cardsTsx).toContain('compare-product-name-ar');
    expect(cardsTsx).toContain('{p.nameAr}');
    expect(cardsTsx).toContain('الكاميرا');
    expect(cardsTsx).toContain('المعالج');

    // Light and Dark theme tokens exist for surface and text contrast
    expect(tokensCss).toContain(":root[data-theme='light']");
    expect(tokensCss).toContain(":root[data-theme='dark']");
  });
});

