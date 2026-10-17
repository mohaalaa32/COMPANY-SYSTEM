# عقود الواجهات والأنواع البرمجية — CONTRACTS
**Tel Baghdad AI Sales Assistant (مساعد المبيعات الذكي لـ تل بغداد)**

---

## 1. واجهة محول المبيعات (Sales API Adapter Interface)

```typescript
export interface BranchStock {
  branchId: string;
  branchNameAr: string;
  quantity: number;
  available: boolean;
}

export interface ProductSpecification {
  storage?: string;       // e.g. "128GB", "256GB"
  ram?: string;           // e.g. "8GB"
  camera?: string;        // e.g. "50MP Main + 12MP Ultra-wide"
  battery?: string;       // e.g. "5000mAh"
  screen?: string;        // e.g. "6.7 inch AMOLED 120Hz"
  processor?: string;     // e.g. "Snapdragon 8 Gen 3"
  color?: string;         // e.g. "أسود تيتانيوم"
  warrantyMonths: number; // e.g. 12
}

export interface Product {
  id: string;
  sku: string;
  nameAr: string;
  nameEn: string;
  category: 'phone' | 'tablet' | 'accessory' | 'audio' | 'wearable';
  brand: string;
  basePriceIQD: number;
  salePriceIQD?: number;
  costIQD: number;         // Used for margin protection calculations
  imageUrl: string;
  specs: ProductSpecification;
  isAvailable: boolean;
  totalStock: number;
  branches: BranchStock[];
  tags: string[];         // e.g. ['gaming', 'student', 'best-camera', 'budget']
}

export interface ProductSearchParams {
  query?: string;
  category?: Product['category'];
  brand?: string;
  minPriceIQD?: number;
  maxPriceIQD?: number;
  tags?: string[];
  branchId?: string;
  limit?: number;
}

export interface StockReservationItem {
  productId: string;
  quantity: number;
  branchId: string;
}

export interface StockReservationResult {
  reservationId: string;
  success: boolean;
  expiresAt: string;
  items: Array<{ productId: string; reserved: number; status: 'ok' | 'out_of_stock' }>;
}

export interface ISalesAdapter {
  searchProducts(params: ProductSearchParams): Promise<Product[]>;
  getProductById(id: string): Promise<Product | null>;
  checkStock(productId: string, branchId?: string): Promise<BranchStock[]>;
  getOffers(): Promise<Array<{ id: string; titleAr: string; discountPct?: number; applicableProductIds: string[]; validUntil: string }>>;
  reserveStock(items: StockReservationItem[]): Promise<StockReservationResult>;
  releaseStock(reservationId: string): Promise<void>;
}
```

---

## 2. واجهة محول الواتساب (WhatsApp Adapter Interface)

```typescript
export interface WhatsAppCustomerInfo {
  phone: string;         // Iraqi phone number (+9647...)
  name: string;
  city: string;          // e.g. "بغداد", "البصرة", "أربيل"
  addressDetails: string;
}

export interface WhatsAppOrderPayload {
  orderId: string;
  orderNumber: string;   // e.g. "TB-2026-1042"
  idempotencyKey: string;
  customer: WhatsAppCustomerInfo;
  items: Array<{
    productId: string;
    productNameAr: string;
    quantity: number;
    unitPriceIQD: number;
    subtotalIQD: number;
  }>;
  deliveryFeeIQD: number;
  totalAmountIQD: number;
  paymentMethod: 'cash_on_delivery' | 'card_on_delivery';
  notes?: string;
  conversationSummary?: string;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId: string;
  sentAt: string;
  status: 'sent' | 'delivered' | 'failed';
  error?: string;
}

export interface IWhatsAppAdapter {
  sendOrderConfirmation(payload: WhatsAppOrderPayload): Promise<WhatsAppSendResult>;
  sendHandoffAlert(customerPhone: string, reason: string, conversationId: string): Promise<WhatsAppSendResult>;
}
```

---

## 3. واجهة محرك الحسابات (Calc Engine Interface — Agent 5)

```typescript
export interface InstallmentPlan {
  totalPriceIQD: number;
  downPaymentIQD: number;
  months: number;
  monthlyAmountIQD: number;
  breakdownAr: string;     // تفصيل باللغة العربية لشرح طريقة الحساب
}

export interface MarginCheckResult {
  isSafe: boolean;
  actualMarginPct: number;
  minAllowedMarginPct: number;
  recommendedMinPriceIQD: number;
}

export interface BudgetMatchResult {
  directMatches: Product[];
  recommendedBundle?: {
    phone: Product;
    cover: Product;
    charger?: Product;
    totalPriceIQD: number;
    savingsIQD: number;
  };
  explanationAr: string;
}

export interface ICalcEngine {
  parseIraqiNumber(input: string): number | null;
  roundIraqiCurrency(amount: number, step?: 250 | 500 | 1000): number;
  convertCurrency(amount: number, exchangeRate: number, target: 'IQD' | 'USD'): number;
  matchBudget(products: Product[], budgetIQD: number, preference?: string): BudgetMatchResult;
  calculateInstallments(priceIQD: number, months: number, downPaymentIQD?: number): InstallmentPlan;
  verifyMargin(costIQD: number, proposedPriceIQD: number, minMarginPct: number): MarginCheckResult;
  scoreProduct(product: Product, weights: { budgetFit: number; usageFit: number; stock: number; margin: number }): number;
}
```

---

## 4. عقود أدوات الذكاء الاصطناعي (AI Tool Calling Contracts)

```typescript
export type SalesAIToolName =
  | 'search_products'
  | 'get_product_details'
  | 'check_stock'
  | 'compare_products'
  | 'get_offers'
  | 'calculate_budget_and_price'
  | 'calculate_installments'
  | 'create_order_draft'
  | 'confirm_order'
  | 'handoff_to_human';

export interface ToolCallRequest {
  id: string;
  name: SalesAIToolName;
  arguments: Record<string, unknown>;
}

export interface ToolCallResponse {
  toolCallId: string;
  success: boolean;
  data: Record<string, unknown>;
  error?: string;
}
```

---

## 5. مخطط قاعدة البيانات الرئيسي (Prisma Entities Outline)

- **Customer:** المعرف، رقم الهاتف، الاسم، المدينة، العنوان، إجمالي الطلبات، تاريخ الإنشاء.
- **Conversation:** المعرف، معرف العميل، الحالة (`AI_ACTIVE` | `WAITING_STAFF` | `STAFF_TAKEOVER` | `RESOLVED`)، الأولوية، موظف الدعم المسؤول، ملخص المحادثة.
- **Message:** المعرف، معرف المحادثة، المرسل (`CUSTOMER` | `AI` | `STAFF` | `INTERNAL_NOTE`)، المحتوى، البطاقات المرفقة (JSON)، تاريخ الإرسال.
- **Order:** المعرف، رقم الطلب، معرف العميل، الحالة (`DRAFT` | `CONFIRMED` | `SENT_WHATSAPP` | `CANCELLED`)، المبالغ، مفتاح عدم التكرار (`idempotencyKey`).
- **OrderItem:** المعرف، معرف الطلب، معرف المنتج، الكمية، سعر الوحدة بالدينار العراقي.
- **ToolAuditLog:** المعرف، معرف المحادثة، اسم الأداة، المدخلات، المخرجات، مدة التنفيذ.
- **ConversationOutcome:** تصنيف نتيجة الحوار، سبب التحويل أو الإغلاق، تقييم الرضا.
