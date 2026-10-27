/**
 * Client-safe view model for the staff dashboard.
 *
 * This module must NOT import @tel/adapters: client components use it, and the raw mock
 * catalog contains cost prices that must never reach the browser. The server page maps
 * products to `ProductView` (no cost) before passing them down.
 */

/** Mirrors Conversation.status in docs/CONTRACTS.md §5. */
export type ConversationStatus = 'AI_ACTIVE' | 'WAITING_STAFF' | 'STAFF_TAKEOVER' | 'RESOLVED';
/** Mirrors Message.sender in docs/CONTRACTS.md §5. */
export type MessageSender = 'CUSTOMER' | 'AI' | 'STAFF' | 'INTERNAL_NOTE';

export interface DemoMessage {
  id: string;
  sender: MessageSender;
  authorAr: string;
  timeLabel: string;
  text: string;
  productIds?: string[];
}

export interface DemoConversation {
  id: string;
  customerNameAr: string;
  cityAr: string;
  channelAr: 'واتساب' | 'الموقع';
  status: ConversationStatus;
  timeLabel: string;
  unread: number;
  preview: string;
  assigneeAr?: string;
  priorityAr: 'منخفضة' | 'متوسطة' | 'عالية';
  linkedProductIds: string[];
  messages: DemoMessage[];
}

/** Display-safe product projection (no cost / margin fields). */
export interface ProductView {
  id: string;
  nameAr: string;
  nameEn: string;
  priceIQD: number;
  karbalaQty: number;
}

export const STATUS_LABEL_AR: Record<ConversationStatus, string> = {
  AI_ACTIVE: 'المساعد الذكي يرد',
  WAITING_STAFF: 'بانتظار موظف',
  STAFF_TAKEOVER: 'مع موظف',
  RESOLVED: 'تم الحل',
};

export const STATUS_TONE: Record<ConversationStatus, 'accent' | 'warning' | 'primary' | 'success'> = {
  AI_ACTIVE: 'accent',
  WAITING_STAFF: 'warning',
  STAFF_TAKEOVER: 'primary',
  RESOLVED: 'success',
};

export const SENDER_LABEL_AR: Record<MessageSender, string> = {
  CUSTOMER: 'العميل',
  AI: 'المساعد الذكي',
  STAFF: 'موظف',
  INTERNAL_NOTE: 'ملاحظة داخلية',
};

export const CONVERSATION_FILTERS = [
  { id: 'all', labelAr: 'الكل' },
  { id: 'waiting', labelAr: 'بانتظار موظف' },
  { id: 'resolved', labelAr: 'تم الحل' },
] as const;

export type ConversationFilterId = (typeof CONVERSATION_FILTERS)[number]['id'];

export function filterConversations(
  conversations: readonly DemoConversation[],
  filter: ConversationFilterId,
): DemoConversation[] {
  switch (filter) {
    case 'waiting':
      return conversations.filter((c) => c.status === 'WAITING_STAFF');
    case 'resolved':
      return conversations.filter((c) => c.status === 'RESOLVED');
    default:
      return [...conversations];
  }
}
