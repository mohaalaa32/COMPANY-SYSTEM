/**
 * Adapters Type Definitions
 * Strictly matches docs/CONTRACTS.md §1 (Sales API) and §2 (WhatsApp API).
 */

// ============================================================================
// §1. Sales API Adapter Contracts
// ============================================================================

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

export interface StockReservationResultItem {
  productId: string;
  reserved: number;
  status: 'ok' | 'out_of_stock';
}

export interface StockReservationResult {
  reservationId: string;
  success: boolean;
  expiresAt: string;
  items: StockReservationResultItem[];
}

export interface Offer {
  id: string;
  titleAr: string;
  discountPct?: number;
  applicableProductIds: string[];
  validUntil: string;
}

export interface ISalesAdapter {
  searchProducts(params: ProductSearchParams): Promise<Product[]>;
  getProductById(id: string): Promise<Product | null>;
  checkStock(productId: string, branchId?: string): Promise<BranchStock[]>;
  getOffers(): Promise<Offer[]>;
  reserveStock(items: StockReservationItem[]): Promise<StockReservationResult>;
  releaseStock(reservationId: string): Promise<void>;
}

// ============================================================================
// §2. WhatsApp Adapter Contracts
// ============================================================================

export interface WhatsAppCustomerInfo {
  phone: string;         // Iraqi phone number (+9647...)
  name: string;
  city: string;          // e.g. "بغداد", "البصرة", "أربيل"
  addressDetails: string;
}

export interface WhatsAppOrderItem {
  productId: string;
  productNameAr: string;
  quantity: number;
  unitPriceIQD: number;
  subtotalIQD: number;
}

export interface WhatsAppOrderPayload {
  orderId: string;
  orderNumber: string;   // e.g. "TB-2026-1042"
  idempotencyKey: string;
  customer: WhatsAppCustomerInfo;
  items: WhatsAppOrderItem[];
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

// ============================================================================
// Extended Helper Types for Adapters Implementation
// ============================================================================

export interface BranchInfo {
  id: string;
  nameAr: string;
  city: string;
  addressAr: string;
  phone: string;
  isMainStore: boolean;
}

export interface ActiveStockReservation {
  reservationId: string;
  createdAt: string;
  expiresAt: string;
  released: boolean;
  items: StockReservationItem[];
}
