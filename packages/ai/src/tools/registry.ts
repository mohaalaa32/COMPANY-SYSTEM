import type {
  Product,
  Offer,
  BranchStock,
  StockReservationResult,
  WhatsAppOrderPayload,
  WhatsAppSendResult,
} from '@tel/adapters';
import type { BudgetMatchResult, InstallmentPlan } from '@tel/calc';
import type {
  SalesAIToolName,
  ToolCallRequest,
  ToolCallResponse,
  ToolDefinition,
  ToolExecutionContext,
} from '../types';

export const ALLOWED_SALES_AI_TOOLS: readonly SalesAIToolName[] = [
  'search_products',
  'get_product_details',
  'check_stock',
  'compare_products',
  'get_offers',
  'calculate_budget_and_price',
  'calculate_installments',
  'create_order_draft',
  'confirm_order',
  'handoff_to_human',
] as const;

export function isAllowedToolName(name: string): name is SalesAIToolName {
  return ALLOWED_SALES_AI_TOOLS.includes(name as SalesAIToolName);
}

/**
 * 1. search_products
 */
const searchProductsTool: ToolDefinition = {
  name: 'search_products',
  descriptionAr: 'البحث عن المنتجات في الكتالوج بالاسم، الماركة، الفئة، نطاق السعر، الكلمات الدلالية، أو توفر الفرع.',
  descriptionEn: 'Search products by query, category, brand, price range, tags, or branch availability.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search term or model name in Arabic or English' },
      category: {
        type: 'string',
        description: 'Product category',
        enum: ['phone', 'tablet', 'accessory', 'audio', 'wearable'],
      },
      brand: { type: 'string', description: 'Brand name, e.g. Apple, Samsung, Xiaomi' },
      minPriceIQD: { type: 'number', description: 'Minimum price in Iraqi Dinars (IQD)' },
      maxPriceIQD: { type: 'number', description: 'Maximum price in Iraqi Dinars (IQD)' },
      tags: { type: 'array', description: 'Tags, e.g. gaming, student, charger, cover' },
      branchId: { type: 'string', description: 'Specific branch ID, e.g. branch-karrada' },
      limit: { type: 'number', description: 'Maximum number of items to return' },
    },
  },
  execute: async (args, context) => {
    const products = await context.salesAdapter.searchProducts({
      query: args.query as string | undefined,
      category: args.category as Product['category'] | undefined,
      brand: args.brand as string | undefined,
      minPriceIQD: args.minPriceIQD as number | undefined,
      maxPriceIQD: args.maxPriceIQD as number | undefined,
      tags: args.tags as string[] | undefined,
      branchId: args.branchId as string | undefined,
      limit: args.limit as number | undefined,
    });

    return {
      count: products.length,
      products,
    };
  },
};

/**
 * 2. get_product_details
 */
const getProductDetailsTool: ToolDefinition = {
  name: 'get_product_details',
  descriptionAr: 'الحصول على المواصفات والأسعار الدقيقة لمنتج محدد عبر المعرف أو رمز SKU.',
  descriptionEn: 'Get detailed product specifications and prices by product ID or SKU.',
  parameters: {
    type: 'object',
    properties: {
      productId: { type: 'string', description: 'Product ID (e.g. prod-ip16pm-256) or SKU' },
    },
    required: ['productId'],
  },
  execute: async (args, context) => {
    const productId = String(args.productId || '').trim();
    if (!productId) {
      throw new Error('productId is required');
    }

    const product = await context.salesAdapter.getProductById(productId);
    return {
      found: Boolean(product),
      product,
    };
  },
};

/**
 * 3. check_stock
 */
const checkStockTool: ToolDefinition = {
  name: 'check_stock',
  descriptionAr: 'التحقق من توفر المخزون اللحظي للمنتج في جميع فروع العراق أو فرع معين.',
  descriptionEn: 'Check real-time stock availability in all branches or a specific branch.',
  parameters: {
    type: 'object',
    properties: {
      productId: { type: 'string', description: 'Product ID or SKU' },
      branchId: { type: 'string', description: 'Optional specific branch ID (e.g. branch-karrada)' },
    },
    required: ['productId'],
  },
  execute: async (args, context) => {
    const productId = String(args.productId || '').trim();
    const branchId = args.branchId ? String(args.branchId).trim() : undefined;

    const branches: BranchStock[] = await context.salesAdapter.checkStock(productId, branchId);
    const totalAvailable = branches.reduce((sum, b) => sum + (b.available ? b.quantity : 0), 0);

    return {
      productId,
      branchId: branchId || null,
      branches,
      totalAvailable,
      isAvailable: totalAvailable > 0,
    };
  },
};

/**
 * 4. compare_products
 */
const compareProductsTool: ToolDefinition = {
  name: 'compare_products',
  descriptionAr: 'مقارنة مواصفات وأسعار وميزات منتجين أو أكثر جنباً إلى جنب.',
  descriptionEn: 'Compare specifications, prices, and features of two or more products side by side.',
  parameters: {
    type: 'object',
    properties: {
      productIds: {
        type: 'array',
        description: 'Array of product IDs to compare (at least 2)',
      },
    },
    required: ['productIds'],
  },
  execute: async (args, context) => {
    const rawIds = (args.productIds as string[]) || [];
    const productIds = rawIds.map((id) => String(id).trim()).filter((id) => id.length > 0);

    if (productIds.length < 2) {
      throw new Error('At least two productIds are required for comparison');
    }

    const products: Product[] = [];
    for (const id of productIds) {
      const p = await context.salesAdapter.getProductById(id);
      if (p) products.push(p);
    }

    const comparisonItems = products.map((p) => ({
      id: p.id,
      nameAr: p.nameAr,
      brand: p.brand,
      priceIQD: p.salePriceIQD ?? p.basePriceIQD,
      storage: p.specs.storage || 'غير محدد',
      ram: p.specs.ram || 'غير محدد',
      camera: p.specs.camera || 'غير محدد',
      battery: p.specs.battery || 'غير محدد',
      screen: p.specs.screen || 'غير محدد',
      processor: p.specs.processor || 'غير محدد',
      warrantyMonths: p.specs.warrantyMonths,
    }));

    return {
      comparedCount: products.length,
      products,
      comparison: comparisonItems,
    };
  },
};

/**
 * 5. get_offers
 */
const getOffersTool: ToolDefinition = {
  name: 'get_offers',
  descriptionAr: 'استرجاع العروض والخصومات والباقات الترويجية الحالية المتوفرة في المتجر.',
  descriptionEn: 'Retrieve current promotional offers, bundles, and discounts available in the store.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_args, context) => {
    const offers: Offer[] = await context.salesAdapter.getOffers();
    return {
      count: offers.length,
      offers,
    };
  },
};

/**
 * 6. calculate_budget_and_price
 */
const calculateBudgetAndPriceTool: ToolDefinition = {
  name: 'calculate_budget_and_price',
  descriptionAr: 'استدعاء محرك الحسابات القطعي لمطابقة ميزانية العميل بالدينار العراقي واقتراح الأجهزة والحزم المثالية.',
  descriptionEn: 'Call deterministic Calc Engine to match budget in IQD and recommend ideal devices/bundles.',
  parameters: {
    type: 'object',
    properties: {
      budgetIQD: { type: 'number', description: 'Customer target budget in Iraqi Dinars (e.g. 500000)' },
      preference: { type: 'string', description: 'Customer preference (e.g. apple, samsung, camera, gaming)' },
    },
    required: ['budgetIQD'],
  },
  execute: async (args, context) => {
    const budgetIQD = Number(args.budgetIQD);
    if (!Number.isFinite(budgetIQD) || budgetIQD <= 0) {
      throw new Error('A valid positive budgetIQD is required');
    }

    const preference = args.preference ? String(args.preference) : undefined;

    // Fetch catalog products
    const allProducts = await context.salesAdapter.searchProducts({});
    const matchResult: BudgetMatchResult = context.calcEngine.matchBudget(allProducts, budgetIQD, preference);

    return {
      budgetIQD,
      preference: preference || null,
      directMatches: matchResult.directMatches,
      recommendedBundle: matchResult.recommendedBundle || null,
      explanationAr: matchResult.explanationAr,
      budgetDeficitIQD: matchResult.budgetDeficitIQD ?? null,
      cheapestAvailableIQD: matchResult.cheapestAvailableIQD ?? null,
    };
  },
};

/**
 * 7. calculate_installments
 */
const calculateInstallmentsTool: ToolDefinition = {
  name: 'calculate_installments',
  descriptionAr: 'حساب خطة الأقساط الشهرية القطعية مع التقريب العراقي ومبلغ الدفعة الأولى والتفصيل العربي.',
  descriptionEn: 'Calculate monthly installment plan with Iraqi rounding, down payment, and breakdown.',
  parameters: {
    type: 'object',
    properties: {
      priceIQD: { type: 'number', description: 'Total price of device or cart in IQD' },
      months: { type: 'number', description: 'Installment tenure (e.g. 6, 12, 18, 24 months)' },
      downPaymentIQD: { type: 'number', description: 'Optional down payment amount in IQD' },
    },
    required: ['priceIQD', 'months'],
  },
  execute: async (args, context) => {
    const priceIQD = Number(args.priceIQD);
    const months = Number(args.months);
    const downPaymentIQD = args.downPaymentIQD !== undefined ? Number(args.downPaymentIQD) : undefined;

    if (!Number.isFinite(priceIQD) || priceIQD <= 0) {
      throw new Error('priceIQD must be a positive number');
    }
    if (!Number.isFinite(months) || months <= 0) {
      throw new Error('months must be a positive integer');
    }

    const plan: InstallmentPlan = context.calcEngine.calculateInstallments(priceIQD, months, downPaymentIQD);
    return {
      plan,
    };
  },
};

/**
 * 8. create_order_draft
 */
const createOrderDraftTool: ToolDefinition = {
  name: 'create_order_draft',
  descriptionAr: 'إنشاء مسودة طلب وحجز المخزون مؤقتاً في الفرع المطلوب وحساب الإجمالي.',
  descriptionEn: 'Create an order draft, temporarily reserve branch stock, and calculate subtotal/total.',
  parameters: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'Array of items with productId, quantity, and branchId',
      },
      deliveryFeeIQD: {
        type: 'number',
        description: 'Delivery fee (defaults to 5,000 IQD for Baghdad, 10,000 other governorates)',
      },
    },
    required: ['items'],
  },
  execute: async (args, context) => {
    const rawItems = (args.items as Array<{ productId: string; quantity: number; branchId: string }>) || [];
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new Error('items array must contain at least one item');
    }

    // Attempt stock reservation
    const reservationResult: StockReservationResult = await context.salesAdapter.reserveStock(
      rawItems.map((i) => ({
        productId: String(i.productId),
        quantity: Number(i.quantity) || 1,
        branchId: String(i.branchId),
      }))
    );

    if (!reservationResult.success) {
      return {
        success: false,
        reservationId: null,
        error: 'بعض المنتجات المطلوبة غير متوفرة بالكمية المطلوبة في الفرع المحدد',
        reservationItems: reservationResult.items,
      };
    }

    // Populate prices and subtotals
    const itemsDetails = [];
    let subtotalIQD = 0;

    for (const item of rawItems) {
      const prod = await context.salesAdapter.getProductById(item.productId);
      const unitPrice = prod ? (prod.salePriceIQD ?? prod.basePriceIQD) : 0;
      const itemSubtotal = unitPrice * (item.quantity || 1);
      subtotalIQD += itemSubtotal;

      itemsDetails.push({
        productId: item.productId,
        productNameAr: prod ? prod.nameAr : item.productId,
        quantity: item.quantity,
        unitPriceIQD: unitPrice,
        subtotalIQD: itemSubtotal,
        branchId: item.branchId,
      });
    }

    const deliveryFeeIQD = Number.isFinite(Number(args.deliveryFeeIQD)) ? Number(args.deliveryFeeIQD) : 5000;
    const totalAmountIQD = subtotalIQD + deliveryFeeIQD;
    const draftOrderId = `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    return {
      success: true,
      draftOrderId,
      reservationId: reservationResult.reservationId,
      expiresAt: reservationResult.expiresAt,
      items: itemsDetails,
      subtotalIQD,
      deliveryFeeIQD,
      totalAmountIQD,
    };
  },
};

/**
 * 9. confirm_order
 */
const confirmOrderTool: ToolDefinition = {
  name: 'confirm_order',
  descriptionAr: 'تأكيد الطلب نهائياً وإرسال إشعار فوري لـ WhatsApp Cloud API مع منع التكرار (Idempotency).',
  descriptionEn: 'Confirm finalized order and dispatch via WhatsApp Cloud API with idempotency.',
  parameters: {
    type: 'object',
    properties: {
      orderId: { type: 'string', description: 'Internal order ID' },
      orderNumber: { type: 'string', description: 'Display order number, e.g. TB-2026-1042' },
      idempotencyKey: { type: 'string', description: 'Unique idempotency key to prevent double submissions' },
      customer: {
        type: 'object',
        description: 'Customer contact details: name, phone (+964...), city, addressDetails',
      },
      items: { type: 'array', description: 'List of order items with price and quantities' },
      deliveryFeeIQD: { type: 'number', description: 'Delivery fee in IQD' },
      totalAmountIQD: { type: 'number', description: 'Total price in IQD' },
      paymentMethod: {
        type: 'string',
        enum: ['cash_on_delivery', 'card_on_delivery'],
        description: 'Payment method',
      },
      notes: { type: 'string', description: 'Optional customer delivery notes' },
    },
    required: [
      'orderId',
      'orderNumber',
      'idempotencyKey',
      'customer',
      'items',
      'deliveryFeeIQD',
      'totalAmountIQD',
      'paymentMethod',
    ],
  },
  execute: async (args, context) => {
    const payload = args as unknown as WhatsAppOrderPayload;

    if (!payload.idempotencyKey) {
      throw new Error('idempotencyKey is strictly required for order confirmation');
    }

    const sendResult: WhatsAppSendResult = await context.whatsAppAdapter.sendOrderConfirmation(payload);

    return {
      confirmed: sendResult.success,
      orderNumber: payload.orderNumber,
      messageId: sendResult.messageId,
      status: sendResult.status,
      error: sendResult.error,
    };
  },
};

/**
 * 10. handoff_to_human
 */
const handoffToHumanTool: ToolDefinition = {
  name: 'handoff_to_human',
  descriptionAr: 'تحويل الحوار إلى موظف بشري فوراً وإرسال تنبيه عاجل مع سبب التحويل إلى واتساب المتجر.',
  descriptionEn: 'Handoff conversation immediately to human staff and send WhatsApp alert with reason.',
  parameters: {
    type: 'object',
    properties: {
      reason: { type: 'string', description: 'Reason for handoff (e.g. custom corporate discount, complaint)' },
      customerPhone: { type: 'string', description: 'Customer phone number' },
      conversationId: { type: 'string', description: 'Conversation session ID' },
    },
    required: ['reason'],
  },
  execute: async (args, context) => {
    const reason = String(args.reason || 'طلب تحويل لموظف بشري');
    const customerPhone = String(args.customerPhone || context.customerPhone || 'unknown');
    const conversationId = String(args.conversationId || context.conversationId || 'conv_default');

    const alertResult = await context.whatsAppAdapter.sendHandoffAlert(customerPhone, reason, conversationId);

    return {
      handoffInitiated: alertResult.success,
      alertMessageId: alertResult.messageId,
      status: alertResult.status,
      messageAr: 'تم إشعار موظف المبيعات وسيقوم بالتواصل معك مباشرة لمساعدتك.',
    };
  },
};

// ============================================================================
// Tool Registry Map
// ============================================================================

export const TOOLS_REGISTRY: Map<SalesAIToolName, ToolDefinition> = new Map<SalesAIToolName, ToolDefinition>([
  ['search_products', searchProductsTool],
  ['get_product_details', getProductDetailsTool],
  ['check_stock', checkStockTool],
  ['compare_products', compareProductsTool],
  ['get_offers', getOffersTool],
  ['calculate_budget_and_price', calculateBudgetAndPriceTool],
  ['calculate_installments', calculateInstallmentsTool],
  ['create_order_draft', createOrderDraftTool],
  ['confirm_order', confirmOrderTool],
  ['handoff_to_human', handoffToHumanTool],
]);

export function getAllToolDefinitions(): ToolDefinition[] {
  return Array.from(TOOLS_REGISTRY.values());
}

export function getToolDefinition(name: SalesAIToolName): ToolDefinition | undefined {
  return TOOLS_REGISTRY.get(name);
}

/**
 * Executes a ToolCallRequest against the verified registry.
 * Rejects any tool not defined in docs/CONTRACTS.md §4.
 */
export async function executeToolCall(
  request: ToolCallRequest,
  context: ToolExecutionContext
): Promise<ToolCallResponse> {
  const tool = TOOLS_REGISTRY.get(request.name);

  if (!tool) {
    return {
      toolCallId: request.id,
      success: false,
      data: {},
      error: `Tool '${request.name}' is unauthorized or does not exist in contracts.`,
    };
  }

  try {
    const result = await tool.execute(request.arguments || {}, context);
    return {
      toolCallId: request.id,
      success: true,
      data: result,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      toolCallId: request.id,
      success: false,
      data: {},
      error: message,
    };
  }
}
