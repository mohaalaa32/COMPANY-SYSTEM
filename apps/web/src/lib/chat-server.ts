/**
 * Server-side Customer Chat Controller (Batch 1-A1)
 *
 * Bridges the Next.js `/api/chat` route with `SalesAIAgent` and `MockLLMProvider` in `@tel/ai`,
 * using the Karbala mock catalog (`MockSalesAdapter`), mock WhatsApp adapter (`MockWhatsAppAdapter`),
 * deterministic calc engine (`@tel/calc`), and published staff knowledge (`SqliteKnowledgeStore`).
 *
 * - Keeps multi-turn session history in server memory (explicitly declared as local trial session state;
 *   durable conversation DB persistence is scheduled for Batch 2-A1).
 * - Strips `costIQD` and margin fields from all product cards via `toCustomerProductItem`.
 * - Enforces Karbala branch (`branch-karbala`) scope on every product returned to the UI.
 */

import {
  KARBALA_BRANCH_ID,
  MockSalesAdapter,
  MockWhatsAppAdapter,
  type Product,
  type SqliteKnowledgeStore,
} from '@tel/adapters';
import {
  MockLLMProvider,
  SalesAIAgent,
  type AIMessage,
  type ILLMProvider,
  type ToolCallResponse,
} from '@tel/ai';
import { calcEngine } from '@tel/calc';
import {
  validateCustomerChatMessage,
  type CustomerChatTurnResponse,
} from './chat-model';
import type { CustomerProductItem } from './customer-search';
import { DEMO_BRANCH, toCustomerProductItem } from './demo-data';
import { getKnowledgeStore } from './knowledge-server';

export class ChatValidationError extends Error {
  public readonly code: string;
  public readonly messageAr: string;

  constructor(code: string, messageAr: string) {
    super(messageAr);
    this.name = 'ChatValidationError';
    this.code = code;
    this.messageAr = messageAr;
  }
}

export interface ChatSessionRecord {
  id: string;
  history: AIMessage[];
  createdAt: string;
  updatedAt: string;
  handoffInitiated: boolean;
}

const MAX_IN_MEMORY_SESSIONS = 200;
const MAX_HISTORY_MESSAGES_PER_SESSION = 40;

const globalForChat = globalThis as unknown as {
  telChatSessions: Map<string, ChatSessionRecord> | undefined;
  telChatSalesAdapter: MockSalesAdapter | undefined;
  telChatWhatsAppAdapter: MockWhatsAppAdapter | undefined;
};

function getSessionStore(): Map<string, ChatSessionRecord> {
  if (!globalForChat.telChatSessions) {
    globalForChat.telChatSessions = new Map<string, ChatSessionRecord>();
  }
  return globalForChat.telChatSessions;
}

function getSharedSalesAdapter(): MockSalesAdapter {
  if (!globalForChat.telChatSalesAdapter) {
    globalForChat.telChatSalesAdapter = new MockSalesAdapter();
  }
  return globalForChat.telChatSalesAdapter;
}

function getSharedWhatsAppAdapter(): MockWhatsAppAdapter {
  if (!globalForChat.telChatWhatsAppAdapter) {
    globalForChat.telChatWhatsAppAdapter = new MockWhatsAppAdapter();
  }
  return globalForChat.telChatWhatsAppAdapter;
}

export function resetChatSessionsForTesting(): void {
  getSessionStore().clear();
}

export function getChatSessionHistory(conversationId: string): AIMessage[] {
  return [...(getSessionStore().get(conversationId)?.history ?? [])];
}

function isProductCandidate(item: unknown): item is Product {
  if (!item || typeof item !== 'object') return false;
  const rec = item as Record<string, unknown>;
  return (
    typeof rec.id === 'string' &&
    typeof rec.sku === 'string' &&
    typeof rec.nameAr === 'string' &&
    typeof rec.basePriceIQD === 'number' &&
    Array.isArray(rec.branches)
  );
}

function extractSafeKarbalaProducts(toolResults: ToolCallResponse[]): {
  products: CustomerProductItem[];
  comparedProducts: CustomerProductItem[];
} {
  const productMap = new Map<string, CustomerProductItem>();
  const compareMap = new Map<string, CustomerProductItem>();

  const addSafeProduct = (target: Map<string, CustomerProductItem>, raw: unknown) => {
    if (!isProductCandidate(raw)) return;
    const hasKarbala = raw.branches.some((b) => b.branchId === KARBALA_BRANCH_ID);
    if (!hasKarbala) return;
    target.set(raw.id, toCustomerProductItem(raw));
  };

  for (const res of toolResults) {
    if (!res.success || !res.data) continue;
    const data = res.data;

    // 1. Compare products tool output
    if (Array.isArray(data.comparison) && Array.isArray(data.products)) {
      for (const p of data.products) {
        addSafeProduct(compareMap, p);
      }
      continue;
    }

    // 2. Search products tool output
    if (Array.isArray(data.products)) {
      for (const p of data.products.slice(0, 4)) {
        addSafeProduct(productMap, p);
      }
    }

    // 3. Single product details output
    if (data.product) {
      addSafeProduct(productMap, data.product);
    }

    // 4. Budget matching tool output
    if (Array.isArray(data.directMatches)) {
      for (const p of data.directMatches.slice(0, 4)) {
        addSafeProduct(productMap, p);
      }
    }
    if (data.recommendedBundle && typeof data.recommendedBundle === 'object') {
      const bundle = data.recommendedBundle as Record<string, unknown>;
      addSafeProduct(productMap, bundle.phone);
      addSafeProduct(productMap, bundle.cover);
      if (bundle.charger) {
        addSafeProduct(productMap, bundle.charger);
      }
    }
  }

  return {
    products: Array.from(productMap.values()),
    comparedProducts: Array.from(compareMap.values()),
  };
}

export interface ProcessChatTurnOptions {
  provider?: ILLMProvider;
  knowledgeStore?: SqliteKnowledgeStore;
  salesAdapter?: MockSalesAdapter;
  whatsAppAdapter?: MockWhatsAppAdapter;
}

export async function processCustomerChatTurn(
  input: Record<string, unknown>,
  options: ProcessChatTurnOptions = {}
): Promise<CustomerChatTurnResponse> {
  const validation = validateCustomerChatMessage(input.message);
  if (!validation.valid || !validation.message) {
    throw new ChatValidationError(
      'invalid_message',
      validation.errorAr ?? 'يرجى كتابة نص الرسالة بشكل صحيح.'
    );
  }

  const rawConvId =
    typeof input.conversationId === 'string' ? input.conversationId.trim() : '';
  const conversationId =
    rawConvId.length > 0 && rawConvId.length <= 80
      ? rawConvId
      : `conv_local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const store = getSessionStore();
  let session = store.get(conversationId);
  if (!session) {
    if (store.size >= MAX_IN_MEMORY_SESSIONS) {
      const oldestKey = store.keys().next().value;
      if (oldestKey) store.delete(oldestKey);
    }
    session = {
      id: conversationId,
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      handoffInitiated: false,
    };
    store.set(conversationId, session);
  }

  const salesAdapter = options.salesAdapter ?? getSharedSalesAdapter();
  const whatsAppAdapter = options.whatsAppAdapter ?? getSharedWhatsAppAdapter();
  const knowledgeBase = options.knowledgeStore ?? getKnowledgeStore();
  const provider = options.provider ?? new MockLLMProvider();

  const agent = new SalesAIAgent(
    {
      salesAdapter,
      whatsAppAdapter,
      calcEngine,
      conversationId,
      customerPhone: '07800000000',
      dataMode: 'mock',
      knowledgeBase,
    },
    provider
  );

  const turnResult = await agent.processMessage(validation.message, session.history);

  // Append user message and safe assistant reply to in-memory session history
  const appendedHistory: AIMessage[] = [
    ...session.history,
    { role: 'user', content: validation.message },
    { role: 'assistant', content: turnResult.reply },
  ];
  const nextHistory: AIMessage[] = appendedHistory.slice(-MAX_HISTORY_MESSAGES_PER_SESSION);

  const handoffToolSucceeded = turnResult.toolResults.some(
    (r) => r.success && r.data.handoffInitiated === true
  );

  session.history = nextHistory;
  session.updatedAt = new Date().toISOString();
  if (handoffToolSucceeded) {
    session.handoffInitiated = true;
  }

  const { products, comparedProducts } = extractSafeKarbalaProducts(turnResult.toolResults);

  return {
    conversationId,
    messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    reply: turnResult.reply,
    stage: turnResult.stage,
    isSafe: turnResult.isSafe,
    rejected: turnResult.rejected,
    handoffInitiated: handoffToolSucceeded || session.handoffInitiated,
    handoffReasonAr: turnResult.handoffSuggestion?.reason,
    products,
    comparedProducts,
    toolsUsed: turnResult.toolCallsExecuted.map((t) => t.name),
    providerMode: 'mock',
    dataMode: 'mock',
    branchId: DEMO_BRANCH.id,
    branchNameAr: DEMO_BRANCH.nameAr,
    timestamp: session.updatedAt,
  };
}
