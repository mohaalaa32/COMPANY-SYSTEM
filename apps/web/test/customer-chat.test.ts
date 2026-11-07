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
});
