import type {
  ILLMProvider,
  AIMessage,
  ToolDefinition,
  LLMResponse,
} from '../types';
import {
  detectHandoffTrigger,
  extractBudgetIQD,
  normalizeForMatching,
} from '../persona/conversation';

export interface MockLLMProviderOptions {
  name?: string;
  queuedResponses?: LLMResponse[];
}

interface ToolProductSummary {
  id?: string;
  nameAr?: string;
  basePriceIQD?: number;
  salePriceIQD?: number;
  specs?: {
    warrantyMonths?: number;
  };
}

interface ToolComparisonItem {
  id?: string;
  nameAr?: string;
  priceIQD?: number;
  storage?: string;
  ram?: string;
  warrantyMonths?: number;
}

/**
 * Mock LLM Provider for unit, integration, evaluation, and local interactive chat.
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
        content: 'أهلاً بك في تِل بغداد! كيف أقدر أساعدك اليوم؟',
      };
    }

    // If previous message was a tool result, synthesize a grounded reply
    if (lastMessage.role === 'tool') {
      return this.synthesizeToolReply(lastMessage);
    }

    const rawText = lastMessage.content;
    const text = rawText.toLowerCase();
    const norm = normalizeForMatching(rawText);

    // 2a. Explicit human handoff or unsupported policy / custom discount / complaint
    const handoffTrigger = detectHandoffTrigger(rawText);
    if (handoffTrigger) {
      return {
        content: '',
        toolCalls: [
          {
            id: `call_handoff_${Date.now()}`,
            name: 'handoff_to_human',
            arguments: { reason: handoffTrigger.reason },
          },
        ],
      };
    }

    // 2b. Product comparison intent
    if (
      norm.includes('مقارنه منتجات') ||
      norm.includes('مقارنه') ||
      norm.includes('قارن') ||
      norm.includes('الفرق بين')
    ) {
      let productIds = ['prod-inf-n40-256', 'prod-tecno-sp20p-256'];
      if (norm.includes('ريدمي') && (norm.includes('سامسونج') || norm.includes('سامسونك') || text.includes('a55'))) {
        productIds = ['prod-a55-256', 'prod-rn13pro-256'];
      } else if (norm.includes('ريدمي') && norm.includes('انفنكس')) {
        productIds = ['prod-rn13pro-256', 'prod-inf-n40-256'];
      }
      return {
        content: '',
        toolCalls: [
          {
            id: `call_compare_${Date.now()}`,
            name: 'compare_products',
            arguments: { productIds },
          },
        ],
      };
    }

    // 2c. Budget matching intent
    const parsedBudget = extractBudgetIQD(rawText);
    if (
      parsedBudget !== undefined ||
      norm.includes('حسب الميزانيه') ||
      text.includes('ميزانيت') ||
      text.includes('ميزانية')
    ) {
      const budgetIQD = parsedBudget ?? 500000;
      let preference: string | undefined;
      if (norm.includes('العاب') || norm.includes(' ببجي') || text.includes('gaming')) {
        preference = 'gaming';
      } else if (norm.includes('كاميرا') || norm.includes('تصوير')) {
        preference = 'camera';
      }
      return {
        content: '',
        toolCalls: [
          {
            id: `call_budget_${Date.now()}`,
            name: 'calculate_budget_and_price',
            arguments: preference ? { budgetIQD, preference } : { budgetIQD },
          },
        ],
      };
    }

    // 2d. Promotional offers intent
    if (norm.includes('عروض') || norm.includes('تخفيضات') || norm.includes('عرض')) {
      return {
        content: '',
        toolCalls: [
          {
            id: `call_offers_${Date.now()}`,
            name: 'get_offers',
            arguments: {},
          },
        ],
      };
    }

    // 2e. Accessories intent
    if (
      norm.includes('الاكسسوارات المتوافقه') ||
      norm.includes('اكسسوارات') ||
      norm.includes('ملحقات') ||
      norm.includes('كفر') ||
      norm.includes('حافظه') ||
      norm.includes('شاحن') ||
      norm.includes('سماعه') ||
      norm.includes('سماعات')
    ) {
      let query: string | undefined;
      if (text.includes('a55')) {
        query = 'A55';
      } else if (norm.includes('ايفون') || text.includes('iphone')) {
        query = 'آيفون';
      } else if (norm.includes('شاحن')) {
        query = 'شاحن';
      } else if (norm.includes('كفر') || norm.includes('حافظه')) {
        query = 'كفر';
      }
      return {
        content: '',
        toolCalls: [
          {
            id: `call_acc_${Date.now()}`,
            name: 'search_products',
            arguments: query ? { query } : { category: 'accessory' },
          },
        ],
      };
    }

    // 2f. Specific brand or model search
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

    if (text.includes('a55')) {
      return {
        content: '',
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'search_products',
            arguments: { query: 'A55' },
          },
        ],
      };
    }

    if (norm.includes('سامسونج') || norm.includes('سامسونك') || text.includes('samsung') || norm.includes('كالكسي')) {
      return {
        content: '',
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'search_products',
            arguments: { brand: 'Samsung' },
          },
        ],
      };
    }

    if (norm.includes('شاومي') || norm.includes('شياومي') || norm.includes('ريدمي') || text.includes('xiaomi') || text.includes('redmi')) {
      return {
        content: '',
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'search_products',
            arguments: { brand: 'Xiaomi' },
          },
        ],
      };
    }

    if (norm.includes('انفنكس') || text.includes('infinix')) {
      return {
        content: '',
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'search_products',
            arguments: { brand: 'Infinix' },
          },
        ],
      };
    }

    if (norm.includes('تكنو') || text.includes('tecno')) {
      return {
        content: '',
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'search_products',
            arguments: { brand: 'Tecno' },
          },
        ],
      };
    }

    if (
      norm.includes('التوفر والاسعار') ||
      norm.includes('الاسعار') ||
      norm.includes('شنو عندكم') ||
      norm.includes('الاجهزه المتوفره')
    ) {
      return {
        content: '',
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'search_products',
            arguments: { category: 'phone', limit: 4 },
          },
        ],
      };
    }

    // General fallback response
    return {
      content: 'أهلاً بيك بتِل بغداد — فرع كربلاء (الوضع التجريبي المحلي). شنو الموبايل أو الجهاز أو الميزانية اللي تدور عليها؟',
    };
  }

  private synthesizeToolReply(toolMessage: AIMessage): LLMResponse {
    try {
      const parsed = JSON.parse(toolMessage.content) as Record<string, unknown>;

      if (parsed.toolFailed === true) {
        return {
          content: 'عذراً، تعذر استرجاع البيانات من النظام التجريبي حالياً. يرجى إعادة المحاولة.',
        };
      }

      if (toolMessage.name === 'handoff_to_human' || 'handoffInitiated' in parsed) {
        if (parsed.handoffInitiated === true) {
          return {
            content: 'تم إشعار موظف المبيعات بفرع كربلاء وسيقوم بالتواصل معك مباشرة لمساعدتك.',
          };
        }
        return {
          content: 'عذراً، تعذر إرسال تنبيه التحويل للموظف حالياً. تقدر تعيد المحاولة بعد قليل.',
        };
      }

      if (toolMessage.name === 'compare_products' && Array.isArray(parsed.comparison)) {
        const items = parsed.comparison as ToolComparisonItem[];
        if (items.length >= 2) {
          const summary = items
            .map(
              (item) =>
                `${item.nameAr ?? ''} بسعر ${Number(item.priceIQD ?? 0).toLocaleString('en-US')} د.ع (تخزين ${item.storage ?? ''}، رام ${item.ram ?? ''}، ضمان ${item.warrantyMonths ?? 12} شهر)`
            )
            .join(' مقابل ');
          return {
            content: `هذي مقارنة من الكتالوج التجريبي لفرع كربلاء: ${summary}.`,
          };
        }
      }

      if (toolMessage.name === 'calculate_budget_and_price' || 'directMatches' in parsed) {
        const matches = Array.isArray(parsed.directMatches)
          ? (parsed.directMatches as ToolProductSummary[])
          : [];
        const budgetIQD = Number(parsed.budgetIQD ?? 0);
        if (matches.length > 0) {
          const top = matches
            .slice(0, 3)
            .map((p) => {
              const price = p.salePriceIQD ?? p.basePriceIQD ?? 0;
              return `${p.nameAr ?? ''} بسعر ${price.toLocaleString('en-US')} د.ع`;
            })
            .join('، و');
          return {
            content: `ضمن ميزانية ${budgetIQD.toLocaleString('en-US')} د.ع بالكتالوج التجريبي لفرع كربلاء، أرشحلك: ${top}.`,
          };
        }
        const cheapest =
          typeof parsed.cheapestAvailableIQD === 'number'
            ? ` أقل جهاز متوفر بالكتالوج التجريبي سعره ${parsed.cheapestAvailableIQD.toLocaleString('en-US')} د.ع.`
            : '';
        return {
          content: `ماكو جهاز ضمن ميزانية ${budgetIQD.toLocaleString('en-US')} د.ع بالكتالوج التجريبي لفرع كربلاء.${cheapest}`,
        };
      }

      if (toolMessage.name === 'get_offers' && Array.isArray(parsed.offers)) {
        const offers = parsed.offers as Array<{ titleAr?: string; discountPct?: number }>;
        if (offers.length > 0) {
          const list = offers
            .map((o) => `${o.titleAr ?? ''}${o.discountPct ? ` (${o.discountPct}%)` : ''}`)
            .join('، و');
          return {
            content: `العروض التجريبية المسجلة بفرع كربلاء: ${list}.`,
          };
        }
      }

      if (Array.isArray(parsed.products) && parsed.products.length > 0) {
        const products = parsed.products as ToolProductSummary[];
        const first = products[0]!;
        const firstPrice = first.salePriceIQD ?? first.basePriceIQD ?? 0;
        if (products.length === 1) {
          return {
            content: `جهاز ${first.nameAr ?? ''} متوفر بالكتالوج التجريبي لفرع كربلاء بسعر ${firstPrice.toLocaleString('en-US')} د.ع.`,
          };
        }
        const topList = products
          .slice(0, 3)
          .map((p) => {
            const pr = p.salePriceIQD ?? p.basePriceIQD ?? 0;
            return `${p.nameAr ?? ''} بسعر ${pr.toLocaleString('en-US')} د.ع`;
          })
          .join('، و');
        return {
          content: `متوفر بالكتالوج التجريبي لفرع كربلاء: ${topList}.`,
        };
      }

      if (Array.isArray(parsed.products) && parsed.products.length === 0) {
        return {
          content: 'ما لكيت منتج مطابق بالكتالوج التجريبي لفرع كربلاء. جرب تبحث باسم موديل ثاني أو تحدد ميزانيتك.',
        };
      }
    } catch {
      // Fall through
    }

    return {
      content: 'تم استرجاع البيانات المعتمدة من النظام التجريبي بنجاح.',
    };
  }
}
