import type {
  ILLMProvider,
  AIMessage,
  ToolDefinition,
  LLMResponse,
} from '../types';

export interface MockLLMProviderOptions {
  name?: string;
  queuedResponses?: LLMResponse[];
}

/**
 * Mock LLM Provider for unit, integration, and evaluation testing.
 * Guarantees zero external network dependencies and uses no real credentials.
 */
export class MockLLMProvider implements ILLMProvider {
  public readonly name: string;
  private responseQueue: LLMResponse[] = [];

  constructor(options: MockLLMProviderOptions = {}) {
    this.name = options.name || 'mock-llm-provider';
    if (options.queuedResponses && options.queuedResponses.length > 0) {
      this.responseQueue = [...options.queuedResponses];
    }
  }

  public queueResponse(response: LLMResponse): void {
    this.responseQueue.push(response);
  }

  public clearQueue(): void {
    this.responseQueue = [];
  }

  public async generateResponse(
    messages: AIMessage[],
    _tools?: ToolDefinition[]
  ): Promise<LLMResponse> {
    // 1. If there are pre-queued responses, return them in order
    if (this.responseQueue.length > 0) {
      return this.responseQueue.shift()!;
    }

    // 2. Default dynamic simulation based on conversation context
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage) {
      return {
        content: 'أهلاً بك في تل بغداد! كيف أقدر أساعدك اليوم؟',
      };
    }

    // If previous message was a tool result, synthesize a grounded reply
    if (lastMessage.role === 'tool') {
      try {
        const parsed = JSON.parse(lastMessage.content);
        if (parsed.products && Array.isArray(parsed.products) && parsed.products.length > 0) {
          const first = parsed.products[0];
          const price = first.salePriceIQD ?? first.basePriceIQD;
          return {
            content: `جهاز ${first.nameAr} متوفر بسعر ${price.toLocaleString()} د.ع.`,
          };
        }
      } catch {
        // Fall through
      }

      return {
        content: 'تم استرجاع البيانات المعتمدة من النظام بنجاح.',
      };
    }

    const text = lastMessage.content.toLowerCase();

    // If user asks about iPhone or pricing, generate a search_products tool call
    if (text.includes('آيفون') || text.includes('ايفون') || text.includes('iphone')) {
      return {
        content: '',
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'search_products',
            arguments: { query: 'آيفون' },
          },
        ],
      };
    }

    // If user asks about budget
    if (text.includes('ميزانيت') || text.includes('ميزانية')) {
      return {
        content: '',
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'calculate_budget_and_price',
            arguments: { budgetIQD: 500000 },
          },
        ],
      };
    }

    // General fallback response
    return {
      content: 'أهلاً بيك بتِل بغداد — فرع كربلاء. شنو الموبايل أو الجهاز اللي تدور عليه؟',
    };
  }
}
