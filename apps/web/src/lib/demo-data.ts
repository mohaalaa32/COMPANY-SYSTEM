/**
 * DEMO DATA for the 0-D1a UI skeleton.
 *
 * Everything here is illustrative only:
 *  - Products, prices and stock come verbatim from the mock catalog in @tel/adapters
 *    (isolated Mock Mode, NOT live Karbala inventory). No price is computed in the UI.
 *  - Conversations and customers are fictional. No message is sent anywhere.
 *  - The deployment has a single branch: Karbala (`branch-karbala`).
 *
 * Real data will replace this module once the backend and live adapters are wired (later batches).
 *
 * SERVER-SIDE ONLY: imports the raw mock catalog (which includes cost prices). Client components
 * must receive `ProductView` objects produced by `toProductView` instead.
 */
import {
  KARBALA_BRANCH_ID,
  MOCK_BRANCHES,
  MOCK_PRODUCTS,
  MockSalesAdapter,
  type Product,
} from '@tel/adapters';
import type {
  CustomerProductItem,
  CustomerSearchFilters,
  CustomerSearchResponse,
} from './customer-search';
import type { DemoConversation, ProductView } from './dashboard-model';

export const IS_DEMO = true as const;

const karbala = MOCK_BRANCHES.find((b) => b.id === KARBALA_BRANCH_ID);
if (!karbala) {
  throw new Error('demo-data: Karbala branch missing from mock branches');
}
/** The only branch in this deployment. Address/phone/hours are intentionally absent. */
export const DEMO_BRANCH = karbala;

const PRODUCT_INDEX = new Map(MOCK_PRODUCTS.map((p) => [p.id, p] as const));

/** Look up a mock product; throws so a typo in demo data fails loudly in tests/build. */
export function getDemoProduct(id: string): Product {
  const product = PRODUCT_INDEX.get(id);
  if (!product) {
    throw new Error(`demo-data: unknown mock product id "${id}"`);
  }
  return product;
}

/** Price as stored in the mock catalog (sale price when present). Display only. */
export function displayPriceIQD(product: Product): number {
  return product.salePriceIQD ?? product.basePriceIQD;
}

/** Quantity at the Karbala branch from the mock catalog (0 when absent). */
export function karbalaQuantity(product: Product): number {
  return product.branches.find((b) => b.branchId === KARBALA_BRANCH_ID)?.quantity ?? 0;
}

/** Client-safe projection: drops cost/margin and every non-display field. */
export function toProductView(product: Product): ProductView {
  return {
    id: product.id,
    nameAr: product.nameAr,
    nameEn: product.nameEn,
    priceIQD: displayPriceIQD(product),
    karbalaQty: karbalaQuantity(product),
  };
}

/**
 * Shared read-only adapter instance connected to the system's single catalog in @tel/adapters.
 */
const demoSalesAdapter = new MockSalesAdapter();

/**
 * Converts a catalog Product to a display-safe CustomerProductItem for the customer search UI.
 * - Strips `costIQD` and margin fields completely.
 * - Preserves the original `nameAr`, `nameEn`, and `sku` without merging distinct SKUs.
 * - Reads stock exclusively for `branch-karbala`.
 * - Uses only catalog-verified `warrantyMonths` without inventing agency or source claims.
 */
export function toCustomerProductItem(product: Product): CustomerProductItem {
  const effectivePrice = displayPriceIQD(product);
  const qty = karbalaQuantity(product);
  const karbalaBranch = product.branches.find((b) => b.branchId === KARBALA_BRANCH_ID);
  const isAvailableInKarbala = Boolean(karbalaBranch && karbalaBranch.available && qty > 0);

  return {
    id: product.id,
    sku: product.sku,
    nameAr: product.nameAr,
    nameEn: product.nameEn,
    brand: product.brand,
    category: product.category,
    priceIQD: effectivePrice,
    basePriceIQD: product.basePriceIQD,
    hasDiscount: product.salePriceIQD !== undefined && product.salePriceIQD < product.basePriceIQD,
    karbalaQty: qty,
    isAvailableInKarbala,
    warrantyMonths: product.specs.warrantyMonths,
    specs: {
      ...(product.specs.storage ? { storage: product.specs.storage } : {}),
      ...(product.specs.ram ? { ram: product.specs.ram } : {}),
      ...(product.specs.battery ? { battery: product.specs.battery } : {}),
      ...(product.specs.color ? { color: product.specs.color } : {}),
    },
  };
}

/**
 * Executes a customer product search through the system's existing `ISalesAdapter.searchProducts`
 * path, restricted strictly to the Karbala branch, and returns display-safe items.
 */
export async function searchCustomerCatalog(
  filters: CustomerSearchFilters = {}
): Promise<CustomerSearchResponse> {
  const products = await demoSalesAdapter.searchProducts({
    query: filters.query,
    brand: filters.brand,
    minPriceIQD: filters.minPriceIQD,
    maxPriceIQD: filters.maxPriceIQD,
    // When inStockOnly is enabled, filter via the adapter's branch stock check for Karbala.
    branchId: filters.inStockOnly ? KARBALA_BRANCH_ID : undefined,
  });

  // Enforce Karbala-only branch scope even when showing out-of-stock Karbala items
  const karbalaScoped = products.filter((p) =>
    p.branches.some((b) => b.branchId === KARBALA_BRANCH_ID)
  );

  const items = karbalaScoped.map(toCustomerProductItem);

  return {
    items,
    total: items.length,
    branchId: DEMO_BRANCH.id,
    branchNameAr: DEMO_BRANCH.nameAr,
    isDemoData: true,
  };
}

// ---------------------------------------------------------------------------
// Customer page preview (static illustration of the future chat UI)
// ---------------------------------------------------------------------------

export const CUSTOMER_PREVIEW = {
  timeLabel: 'مثال توضيحي',
  /** Budget the sample customer mentions; tests assert every suggestion fits it. */
  budgetIQD: 300_000,
  customerBudgetText: 'ميزانيتي 300 ألف، شنو عندكم ضمن هذا السعر؟',
  aiIntroText: 'هذه أمثلة من الكتالوج التجريبي ضمن ميزانية 300 ألف دينار:',
  suggestionIds: ['prod-inf-n40-256', 'prod-tecno-sp20p-256', 'prod-redmi-13c-128'],
  customerAccessoryText: 'عندكم كفر لـ Galaxy A55؟',
  accessoryId: 'prod-acc-a55-case',
  compareIds: ['prod-inf-n40-256', 'prod-tecno-sp20p-256'] as const,
  quickReplies: ['التوفر والأسعار', 'الإكسسوارات المتوافقة', 'مقارنة منتجات', 'حسب الميزانية'],
} as const;

// ---------------------------------------------------------------------------
// Staff dashboard conversations (fictional)
// ---------------------------------------------------------------------------

export const DEMO_STAFF_USER = { nameAr: 'موظف تجريبي', roleAr: 'مشرف الدعم' } as const;

export const DEMO_CONVERSATIONS: DemoConversation[] = [
  {
    id: 'demo-conv-1',
    customerNameAr: 'سارة محمد',
    cityAr: 'كربلاء',
    channelAr: 'واتساب',
    status: 'WAITING_STAFF',
    timeLabel: '10:32',
    unread: 2,
    preview: 'تريد تكلم موظف بخصوص Galaxy A55',
    assigneeAr: 'غير معيّن',
    priorityAr: 'متوسطة',
    linkedProductIds: ['prod-a55-256', 'prod-acc-a55-case'],
    messages: [
      { id: 'm1', sender: 'CUSTOMER', authorAr: 'سارة', timeLabel: '10:24', text: 'هلو، أريد موبايل كاميرته زينة وبطاريته تدوم.' },
      {
        id: 'm2',
        sender: 'AI',
        authorAr: 'المساعد الذكي',
        timeLabel: '10:24',
        text: 'أهلاً بيج. هذا خيار من الكتالوج التجريبي يناسب طلبج:',
        productIds: ['prod-a55-256'],
      },
      { id: 'm3', sender: 'CUSTOMER', authorAr: 'سارة', timeLabel: '10:27', text: 'عندكم كفر إله؟ وأريد أحچي ويا موظف.' },
      {
        id: 'm4',
        sender: 'INTERNAL_NOTE',
        authorAr: 'النظام',
        timeLabel: '10:28',
        text: 'بيانات تجريبية: طلبت العميلة موظفاً. لا يوجد طلب أو حجز فعلي.',
      },
    ],
  },
  {
    id: 'demo-conv-2',
    customerNameAr: 'علي كريم',
    cityAr: 'كربلاء',
    channelAr: 'الموقع',
    status: 'AI_ACTIVE',
    timeLabel: '10:28',
    unread: 1,
    preview: 'يقارن بين Redmi Note 13 Pro+ و Infinix Note 40 Pro',
    priorityAr: 'منخفضة',
    linkedProductIds: ['prod-rn13pro-256', 'prod-inf-n40-256'],
    messages: [
      { id: 'm1', sender: 'CUSTOMER', authorAr: 'علي', timeLabel: '10:26', text: 'شنو الفرق بين ريدمي نوت 13 برو بلس وانفنكس نوت 40؟' },
      {
        id: 'm2',
        sender: 'AI',
        authorAr: 'المساعد الذكي',
        timeLabel: '10:27',
        text: 'هذولة الجهازين من الكتالوج التجريبي، تكدر تشوف المواصفات بالتفاصيل:',
        productIds: ['prod-rn13pro-256', 'prod-inf-n40-256'],
      },
    ],
  },
  {
    id: 'demo-conv-3',
    customerNameAr: 'نور حسين',
    cityAr: 'كربلاء',
    channelAr: 'واتساب',
    status: 'STAFF_TAKEOVER',
    timeLabel: '10:19',
    unread: 0,
    preview: 'تسأل عن شاحن سريع للآيفون',
    assigneeAr: 'موظف تجريبي',
    priorityAr: 'متوسطة',
    linkedProductIds: ['prod-acc-apl-20w'],
    messages: [
      { id: 'm1', sender: 'CUSTOMER', authorAr: 'نور', timeLabel: '10:15', text: 'عندكم شاحن أصلي للآيفون؟' },
      {
        id: 'm2',
        sender: 'STAFF',
        authorAr: 'موظف تجريبي',
        timeLabel: '10:19',
        text: 'أهلاً بيج، راح أتأكد من التوفر بفرع كربلاء وأرجعلج.',
        productIds: ['prod-acc-apl-20w'],
      },
    ],
  },
  {
    id: 'demo-conv-4',
    customerNameAr: 'مصطفى فاضل',
    cityAr: 'كربلاء',
    channelAr: 'الموقع',
    status: 'WAITING_STAFF',
    timeLabel: '09:58',
    unread: 3,
    preview: 'يسأل عن رسوم التوصيل',
    assigneeAr: 'غير معيّن',
    priorityAr: 'عالية',
    linkedProductIds: ['prod-ip15-128'],
    messages: [
      { id: 'm1', sender: 'CUSTOMER', authorAr: 'مصطفى', timeLabel: '09:55', text: 'بيش التوصيل؟' },
      {
        id: 'm2',
        sender: 'AI',
        authorAr: 'المساعد الذكي',
        timeLabel: '09:56',
        text: 'رسوم التوصيل غير محددة حالياً، راح أحوّلك لموظف حتى يأكدلك.',
      },
    ],
  },
  {
    id: 'demo-conv-5',
    customerNameAr: 'آية جاسم',
    cityAr: 'كربلاء',
    channelAr: 'واتساب',
    status: 'RESOLVED',
    timeLabel: 'أمس',
    unread: 0,
    preview: 'استفسار عن الضمان',
    assigneeAr: 'موظف تجريبي',
    priorityAr: 'منخفضة',
    linkedProductIds: ['prod-aud-ank-p3'],
    messages: [
      { id: 'm1', sender: 'CUSTOMER', authorAr: 'آية', timeLabel: 'أمس', text: 'السماعة عليها ضمان؟' },
      {
        id: 'm2',
        sender: 'STAFF',
        authorAr: 'موظف تجريبي',
        timeLabel: 'أمس',
        text: 'مدة الضمان مذكورة بمواصفات المنتج بالكتالوج.',
        productIds: ['prod-aud-ank-p3'],
      },
    ],
  },
];

/** Every product id referenced by the dashboard demo, mapped to client-safe views. */
export function dashboardProductViews(): Record<string, ProductView> {
  const ids = new Set<string>();
  for (const conv of DEMO_CONVERSATIONS) {
    conv.linkedProductIds.forEach((id) => ids.add(id));
    conv.messages.forEach((m) => m.productIds?.forEach((id) => ids.add(id)));
  }
  return Object.fromEntries([...ids].map((id) => [id, toProductView(getDemoProduct(id))]));
}
