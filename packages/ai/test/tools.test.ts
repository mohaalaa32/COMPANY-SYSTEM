import { describe, it, expect, beforeEach } from 'vitest';
import { MockSalesAdapter, MockWhatsAppAdapter } from '@tel/adapters';
import { calcEngine } from '@tel/calc';
import {
  executeToolCall,
  getAllToolDefinitions,
  getToolDefinition,
  ALLOWED_SALES_AI_TOOLS,
  type SalesAIToolName,
} from '../src/index';
import type { ToolExecutionContext } from '../src/types';

describe('Sales AI Tools Registry (Agent 4 Tool Calling)', () => {
  let context: ToolExecutionContext;
  let salesAdapter: MockSalesAdapter;
  let whatsAppAdapter: MockWhatsAppAdapter;

  beforeEach(() => {
    salesAdapter = new MockSalesAdapter();
    whatsAppAdapter = new MockWhatsAppAdapter();
    context = {
      salesAdapter,
      whatsAppAdapter,
      calcEngine,
      conversationId: 'conv_test_123',
      customerPhone: '07801234567',
    };
  });

  it('exposes exactly the 10 tools defined in docs/CONTRACTS.md §4', () => {
    const tools = getAllToolDefinitions();
    expect(tools.length).toBe(10);
    const names = tools.map((t) => t.name);
    for (const allowed of ALLOWED_SALES_AI_TOOLS) {
      expect(names).toContain(allowed);
      expect(getToolDefinition(allowed)).toBeDefined();
    }
  });

  it('1. search_products: successfully executes product search', async () => {
    const res = await executeToolCall(
      {
        id: 'call_1',
        name: 'search_products',
        arguments: { query: 'سامسونج S24' },
      },
      context
    );

    expect(res.success).toBe(true);
    const data = res.data as { count: number; products: Array<{ id: string }> };
    expect(data.count).toBeGreaterThan(0);
    expect(data.products[0]?.id).toBe('prod-s24u-256');
  });

  it('2. get_product_details: retrieves full specs and price for valid product', async () => {
    const res = await executeToolCall(
      {
        id: 'call_2',
        name: 'get_product_details',
        arguments: { productId: 'prod-ip16pm-256' },
      },
      context
    );

    expect(res.success).toBe(true);
    const data = res.data as { found: boolean; product: { nameAr: string; basePriceIQD: number } };
    expect(data.found).toBe(true);
    expect(data.product.nameAr).toContain('آبل آيفون 16 برو ماكس');
    expect(data.product.basePriceIQD).toBe(1875000);
  });

  it('3. check_stock: checks branch stock availability', async () => {
    const res = await executeToolCall(
      {
        id: 'call_3',
        name: 'check_stock',
        arguments: { productId: 'prod-ip16pm-256', branchId: 'branch-karbala' },
      },
      context
    );

    expect(res.success).toBe(true);
    const data = res.data as { isAvailable: boolean; totalAvailable: number };
    expect(data.isAvailable).toBe(true);
    expect(data.totalAvailable).toBeGreaterThan(0);
  });

  it('4. compare_products: generates side-by-side comparison for 2+ devices', async () => {
    const res = await executeToolCall(
      {
        id: 'call_4',
        name: 'compare_products',
        arguments: { productIds: ['prod-ip16pm-256', 'prod-s24u-256'] },
      },
      context
    );

    expect(res.success).toBe(true);
    const data = res.data as { comparedCount: number; comparison: Array<{ id: string; nameAr: string }> };
    expect(data.comparedCount).toBe(2);
    expect(data.comparison.length).toBe(2);
  });

  it('5. get_offers: returns current active promotions', async () => {
    const res = await executeToolCall(
      {
        id: 'call_5',
        name: 'get_offers',
        arguments: {},
      },
      context
    );

    expect(res.success).toBe(true);
    const data = res.data as { count: number; offers: Array<{ id: string; discountPct: number }> };
    expect(data.count).toBeGreaterThan(0);
    expect(data.offers[0]?.discountPct).toBeGreaterThan(0);
  });

  it('6. calculate_budget_and_price: connects to calcEngine.matchBudget', async () => {
    const res = await executeToolCall(
      {
        id: 'call_6',
        name: 'calculate_budget_and_price',
        arguments: { budgetIQD: 500000 },
      },
      context
    );

    expect(res.success).toBe(true);
    const data = res.data as { directMatches: unknown[]; explanationAr: string };
    expect(data.explanationAr).toBeDefined();
    expect(Array.isArray(data.directMatches)).toBe(true);
  });

  it('7. calculate_installments: connects to calcEngine.calculateInstallments', async () => {
    const res = await executeToolCall(
      {
        id: 'call_7',
        name: 'calculate_installments',
        arguments: { priceIQD: 1000000, months: 12, downPaymentIQD: 200000 },
      },
      context
    );

    expect(res.success).toBe(true);
    const data = res.data as { plan: { monthlyAmountIQD: number; breakdownAr: string } };
    expect(data.plan.monthlyAmountIQD).toBeGreaterThan(0);
    expect(data.plan.breakdownAr).toContain('12');
  });

  it('8. create_order_draft: reserves stock and prepares draft with delivery', async () => {
    const res = await executeToolCall(
      {
        id: 'call_8',
        name: 'create_order_draft',
        arguments: {
          items: [
            {
              productId: 'prod-ip16pm-256',
              quantity: 1,
              branchId: 'branch-karbala',
            },
          ],
          deliveryFeeIQD: 5000,
        },
      },
      context
    );

    expect(res.success).toBe(true);
    const data = res.data as { success: boolean; draftOrderId: string; totalAmountIQD: number };
    expect(data.success).toBe(true);
    expect(data.draftOrderId).toBeDefined();
    expect(data.totalAmountIQD).toBe(1850000 + 5000);
  });

  it('9. confirm_order: dispatches order confirmation via WhatsApp adapter', async () => {
    const res = await executeToolCall(
      {
        id: 'call_9',
        name: 'confirm_order',
        arguments: {
          orderId: 'ord_123',
          orderNumber: 'TB-2026-9999',
          idempotencyKey: 'idemp_tool_call_test_1',
          customer: {
            name: 'حيدر الكرخي',
            phone: '07801234567',
            city: 'بغداد',
            addressDetails: 'المنصور، شارع 14 رمضان',
          },
          items: [
            {
              productId: 'prod-ip16pm-256',
              productNameAr: 'آبل آيفون 16 برو ماكس',
              quantity: 1,
              unitPriceIQD: 1850000,
              subtotalIQD: 1850000,
            },
          ],
          deliveryFeeIQD: 5000,
          totalAmountIQD: 1855000,
          paymentMethod: 'cash_on_delivery',
        },
      },
      context
    );

    expect(res.success).toBe(true);
    const data = res.data as { confirmed: boolean; orderNumber: string };
    expect(data.confirmed).toBe(true);
    expect(data.orderNumber).toBe('TB-2026-9999');
  });

  it('10. handoff_to_human: triggers WhatsApp staff alert with reason', async () => {
    const res = await executeToolCall(
      {
        id: 'call_10',
        name: 'handoff_to_human',
        arguments: {
          reason: 'العميل يستفسر عن شراء جملة للشركات',
          customerPhone: '07801234567',
        },
      },
      context
    );

    expect(res.success).toBe(true);
    const data = res.data as { handoffInitiated: boolean; messageAr: string };
    expect(data.handoffInitiated).toBe(true);
    expect(data.messageAr).toContain('موظف المبيعات');
  });

  it('strictly rejects any tool call not in docs/CONTRACTS.md §4', async () => {
    // Attempting an unauthorized tool
    const res = await executeToolCall(
      {
        id: 'call_unauth',
        name: 'hack_discounts' as unknown as SalesAIToolName,
        arguments: {},
      },
      context
    );

    expect(res.success).toBe(false);
    expect(res.error).toContain('unauthorized');
  });

  describe('Karbala-only scope (server-enforced)', () => {
    it('check_stock ignores a model-supplied foreign branchId and reports Karbala only', async () => {
      const res = await executeToolCall(
        {
          id: 'scope_1',
          name: 'check_stock',
          arguments: { productId: 'prod-ip16pm-256', branchId: 'branch-basra' },
        },
        context
      );

      expect(res.success).toBe(true);
      const data = res.data as { isAvailable: boolean; branches: Array<{ branchId: string }> };
      expect(data.isAvailable).toBe(true);
      expect(data.branches.map((b) => b.branchId)).toEqual(['branch-karbala']);
    });

    it('search_products ignores a foreign branchId instead of returning an empty catalog', async () => {
      const res = await executeToolCall(
        { id: 'scope_2', name: 'search_products', arguments: { branchId: 'branch-erbil', limit: 3 } },
        context
      );

      expect(res.success).toBe(true);
      const data = res.data as { count: number; products: Array<{ branches: Array<{ branchId: string }> }> };
      expect(data.count).toBe(3);
      for (const p of data.products) {
        expect(p.branches.every((b) => b.branchId === 'branch-karbala')).toBe(true);
      }
    });

    it('create_order_draft reserves in Karbala even if the model names another branch', async () => {
      const res = await executeToolCall(
        {
          id: 'scope_3',
          name: 'create_order_draft',
          arguments: {
            items: [{ productId: 'prod-ip16pm-256', quantity: 1, branchId: 'branch-najaf' }],
          },
        },
        context
      );

      expect(res.success).toBe(true);
      const data = res.data as { success: boolean; items: Array<{ branchId: string }> };
      expect(data.success).toBe(true);
      expect(data.items.map((i) => i.branchId)).toEqual(['branch-karbala']);
    });
  });

});
