/**
 * Client-safe types and validators for Customer Interactive Chat (Batch 1-A1).
 *
 * SECURITY RULE: This module must NOT import raw catalog objects from @tel/adapters
 * so that `costIQD` and `minMarginPct` never reach client bundles.
 */

import type { CustomerProductItem } from './customer-search';

export const MAX_CUSTOMER_MESSAGE_LENGTH = 1000;

export interface CustomerChatRequestPayload {
  conversationId?: string;
  message: string;
}

export interface CustomerChatTurnResponse {
  conversationId: string;
  messageId: string;
  reply: string;
  stage: string;
  isSafe: boolean;
  rejected: boolean;
  handoffInitiated: boolean;
  handoffReasonAr?: string;
  products: CustomerProductItem[];
  comparedProducts: CustomerProductItem[];
  toolsUsed: string[];
  providerMode: 'mock';
  dataMode: 'mock';
  branchId: string;
  branchNameAr: string;
  timestamp: string;
}

export interface CustomerChatValidationResult {
  valid: boolean;
  message?: string;
  errorAr?: string;
}

export function validateCustomerChatMessage(raw: unknown): CustomerChatValidationResult {
  if (typeof raw !== 'string') {
    return {
      valid: false,
      errorAr: 'يرجى كتابة نص الرسالة قبل الإرسال.',
    };
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return {
      valid: false,
      errorAr: 'لا يمكن إرسال رسالة فارغة. يرجى كتابة سؤالك أولاً.',
    };
  }

  if (trimmed.length > MAX_CUSTOMER_MESSAGE_LENGTH) {
    return {
      valid: false,
      errorAr: `النص طويل جداً. الحد الأقصى المسموح هو ${MAX_CUSTOMER_MESSAGE_LENGTH} حرف.`,
    };
  }

  return {
    valid: true,
    message: trimmed,
  };
}
