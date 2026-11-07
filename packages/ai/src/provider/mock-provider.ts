import type {
  ILLMProvider,
  AIMessage,
  ToolDefinition,
  LLMResponse,
} from '../types';
import {
  detectHandoffTrigger,
  extractBudgetIQD,
  extractCustomerProfile,
  extractTargetPricesIQD,
  isBestChoiceRequested,
  matchProductsToPriceTargets,
  normalizeForMatching,
  type PriceTargetCandidate,
  type PriceTargetMatch,
} from '../persona/conversation';

export interface MockLLMProviderOptions {
  name?: string;
  queuedResponses?: LLMResponse[];
}

interface ToolProductSummary {
  id?: string;
  sku?: string;
  nameAr?: string;
  nameEn?: string;
  brand?: string;
  basePriceIQD?: number;
  salePriceIQD?: number;
  specs?: {
    storage?: string;
    ram?: string;
    camera?: string;
    battery?: string;
    screen?: string;
    processor?: string;
    color?: string;
    warrantyMonths?: number;
  };
}

function extractCatalogProductIds(text: string): string[] {
  const matches = text.match(/\bprod-[a-z0-9-]+\b/gi) ?? [];
  const unique: string[] = [];
  for (const m of matches) {
    const id = m.toLowerCase();
    if (!unique.includes(id)) {
      unique.push(id);
    }
  }
  return unique;
}

interface ToolComparisonItem {
  id?: string;
  nameAr?: string;
  nameEn?: string;
  brand?: string;
  priceIQD?: number;
  storage?: string;
  ram?: string;
  camera?: string;
  battery?: string;
  screen?: string;
  processor?: string;
  warrantyMonths?: number;
  tags?: string[];
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

    // If previous message was a tool result, either continue multi-step tool chain or synthesize a grounded reply
    if (lastMessage.role === 'tool') {
      const followUpToolCall = this.buildFollowUpToolCall(messages, lastMessage);
      if (followUpToolCall) {
        return followUpToolCall;
      }
      return this.synthesizeToolReply(lastMessage, messages);
    }

    const rawText = lastMessage.content;
    const text = rawText.toLowerCase();
    const norm = normalizeForMatching(rawText);
    const targetPrices = extractTargetPricesIQD(rawText);
    const hasCompareIntent =
      norm.includes('مقارنه منتجات') ||
      norm.includes('مقارنه') ||
      norm.includes('قارن') ||
      norm.includes('الفرق بين');

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

    const explicitProductIds = extractCatalogProductIds(rawText);

    // 2b-1. Two or more explicit product IDs supplied (e.g. comparing two selected cards)
    if (explicitProductIds.length >= 2) {
      return {
        content: '',
        toolCalls: [
          {
            id: `call_compare_ids_${Date.now()}`,
            name: 'compare_products',
            arguments: { productIds: explicitProductIds },
          },
        ],
      };
    }

    // 2b-2. Single explicit product ID without a second target price -> fetch exact SKU details
    // (Covers both «اسأل عن الجهاز» and «قارن مع جهاز آخر» when only the first device is selected)
    if (explicitProductIds.length === 1 && targetPrices.length === 0) {
      return {
        content: '',
        toolCalls: [
          {
            id: `call_details_${Date.now()}`,
            name: 'get_product_details',
            arguments: { productId: explicitProductIds[0]! },
          },
        ],
      };
    }

    // 2b. Multi-price comparison or price-targeted comparison intent:
    // First search the catalog for available phones so selection is 100% grounded in real catalog data.
    if (targetPrices.length >= 2 || (hasCompareIntent && targetPrices.length >= 1)) {
      return {
        content: '',
        toolCalls: [
          {
            id: `call_search_for_compare_${Date.now()}`,
            name: 'search_products',
            arguments: { category: 'phone' },
          },
        ],
      };
    }

    // 2c. Named / generic product comparison intent (without price targets)
    if (hasCompareIntent) {
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

    // 2d. Single-budget matching intent
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

  private buildFollowUpToolCall(
    messages: AIMessage[],
    lastToolMessage: AIMessage
  ): LLMResponse | null {
    if (lastToolMessage.name !== 'search_products') {
      return null;
    }

    // Avoid calling compare_products twice in the same turn
    const alreadyComparedInTurn = messages.some(
      (m, idx) => idx > messages.lastIndexOf(this.findLastUserMessage(messages)!) && m.role === 'tool' && m.name === 'compare_products'
    );
    if (alreadyComparedInTurn) {
      return null;
    }

    const lastUser = this.findLastUserMessage(messages);
    if (!lastUser) return null;

    const targetPrices = extractTargetPricesIQD(lastUser.content);
    const norm = normalizeForMatching(lastUser.content);
    const hasCompareIntent =
      norm.includes('مقارنه منتجات') ||
      norm.includes('مقارنه') ||
      norm.includes('قارن') ||
      norm.includes('الفرق بين');

    if (targetPrices.length < 2 && !(hasCompareIntent && targetPrices.length >= 1)) {
      return null;
    }

    try {
      const parsed = JSON.parse(lastToolMessage.content) as {
        products?: PriceTargetCandidate[];
      };
      const catalogProducts = Array.isArray(parsed.products) ? parsed.products : [];
      if (catalogProducts.length < 2) return null;

      const targetMatches = matchProductsToPriceTargets(catalogProducts, targetPrices);
      const selectedIds: string[] = [];
      const explicitIds = extractCatalogProductIds(lastUser.content);
      for (const id of explicitIds) {
        if (!selectedIds.includes(id)) {
          selectedIds.push(id);
        }
      }

      for (const m of targetMatches) {
        const candidateId = m.matchedProduct?.id ?? m.closestAlternatives[0]?.id;
        if (candidateId && !selectedIds.includes(candidateId)) {
          selectedIds.push(candidateId);
        }
      }

      // Ensure at least 2 distinct IDs are passed to compare_products
      for (const m of targetMatches) {
        if (selectedIds.length >= 2) break;
        for (const alt of m.closestAlternatives) {
          if (!selectedIds.includes(alt.id)) {
            selectedIds.push(alt.id);
            if (selectedIds.length >= 2) break;
          }
        }
      }
      for (const p of catalogProducts) {
        if (selectedIds.length >= 2) break;
        if (p.id && !selectedIds.includes(p.id)) {
          selectedIds.push(p.id);
        }
      }

      if (selectedIds.length >= 2) {
        return {
          content: '',
          toolCalls: [
            {
              id: `call_compare_targets_${Date.now()}`,
              name: 'compare_products',
              arguments: {
                productIds: selectedIds,
                targetPricesIQD: targetPrices,
              },
            },
          ],
        };
      }
    } catch {
      return null;
    }

    return null;
  }

  private findLastUserMessage(messages: AIMessage[]): AIMessage | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user') {
        return messages[i];
      }
    }
    return undefined;
  }

  private synthesizeToolReply(toolMessage: AIMessage, messages: AIMessage[] = []): LLMResponse {
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

      if (toolMessage.name === 'get_product_details' || 'product' in parsed) {
        if (parsed.found === false || !parsed.product) {
          return {
            content: 'عذراً، لم يتم العثور على هذا الصنف في الكتالوج التجريبي لفرع كربلاء.',
          };
        }

        const prod = parsed.product as ToolProductSummary;
        const price = prod.salePriceIQD ?? prod.basePriceIQD ?? 0;
        const warranty = prod.specs?.warrantyMonths ?? 12;
        const specParts: string[] = [];
        if (prod.specs?.storage) specParts.push(`تخزين ${prod.specs.storage}`);
        if (prod.specs?.ram) specParts.push(`رام ${prod.specs.ram}`);
        if (prod.specs?.camera) specParts.push(`كاميرا ${prod.specs.camera}`);
        if (prod.specs?.battery) specParts.push(`بطارية ${prod.specs.battery}`);
        if (prod.specs?.screen) specParts.push(`شاشة ${prod.specs.screen}`);
        if (prod.specs?.processor) specParts.push(`معالج ${prod.specs.processor}`);
        if (prod.specs?.color) specParts.push(`لون ${prod.specs.color}`);

        const lastUser = this.findLastUserMessage(messages);
        const normUser = lastUser ? normalizeForMatching(lastUser.content) : '';
        const isComparePrompt =
          normUser.includes('مقارنه') ||
          normUser.includes('قارن') ||
          normUser.includes('الفرق بين');

        if (isComparePrompt) {
          return {
            content:
              `تم اختيار ${prod.nameAr ?? ''} (رمز الصنف: ${prod.sku ?? ''}) بسعر تجريبي ${price.toLocaleString('en-US')} د.ع من الكتالوج التجريبي لفرع كربلاء للمقارنة. ` +
              `يرجى تحديد الجهاز الثاني الذي تريد مقارنته معه (اختر «قارن» من بطاقة جهاز آخر أو اكتب اسم أو سعر الجهاز الثاني في المحادثة).`,
          };
        }

        const specsNote = specParts.length > 0 ? `، والمواصفات المتوفرة (${specParts.join('، ')})` : '';
        return {
          content:
            `تفاصيل ${prod.nameAr ?? ''} (رمز الصنف: ${prod.sku ?? ''}) بالكتالوج التجريبي لفرع كربلاء: ` +
            `السعر التجريبي ${price.toLocaleString('en-US')} د.ع، ضمان ${warranty} شهر${specsNote}. ` +
            `هل تحب تقارنه ويا جهاز ثاني أو تستفسر عن بدائل أخرى؟`,
        };
      }

      if (toolMessage.name === 'compare_products' && Array.isArray(parsed.comparison)) {
        const items = parsed.comparison as ToolComparisonItem[];
        if (items.length >= 2) {
          const lastUser = this.findLastUserMessage(messages);
          const wantsBest = lastUser ? isBestChoiceRequested(lastUser.content) : false;
          const profile = extractCustomerProfile(messages);
          const priceGapIQD = typeof parsed.priceGapIQD === 'number' ? parsed.priceGapIQD : 0;
          const targetMatches = Array.isArray(parsed.targetMatches)
            ? (parsed.targetMatches as PriceTargetMatch[])
            : undefined;

          return {
            content: this.buildComparisonReply(
              items,
              targetMatches,
              priceGapIQD,
              wantsBest,
              profile.usages
            ),
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

  private buildComparisonReply(
    items: ToolComparisonItem[],
    targetMatches: PriceTargetMatch[] | undefined,
    priceGapIQD: number,
    wantsBest: boolean,
    usages: string[]
  ): string {
    // 1. If target prices were requested and at least one target has NO near phone in the catalog
    if (targetMatches && targetMatches.length > 0 && targetMatches.some((m) => !m.isNear)) {
      const targetNotes = targetMatches.map((m) => {
        const targetStr = m.targetPriceIQD.toLocaleString('en-US');
        if (m.isNear && m.matchedProduct) {
          const prod = m.matchedProduct;
          const diffNote =
            prod.diffIQD === 0
              ? 'مطابق للسعر المطلوب'
              : `بفارق ${prod.diffIQD.toLocaleString('en-US')} د.ع عن السعر المطلوب`;
          return `لهدف ${targetStr} د.ع: أقرب جهاز متوفر بالكتالوج التجريبي لفرع كربلاء هو ${prod.nameAr} بسعر تجريبي ${prod.priceIQD.toLocaleString('en-US')} د.ع (${diffNote})`;
        }

        const altsText =
          m.closestAlternatives.length > 0
            ? m.closestAlternatives
                .map(
                  (alt) =>
                    `${alt.nameAr} بسعر تجريبي ${alt.priceIQD.toLocaleString('en-US')} د.ع (بفارق ${alt.diffIQD.toLocaleString('en-US')} د.ع)`
                )
                .join(' أو ')
            : 'لا توجد بدائل متوفرة حالياً';

        return `لهدف ${targetStr} د.ع: لا يتوفر جهاز قريب من هذا السعر في الكتالوج التجريبي لفرع كربلاء؛ وأقرب البدائل المتاحة بأسعارها الفعلية هي ${altsText}`;
      });

      const followUpQuestion = wantsBest
        ? 'هل تقبل مقارنة أحد هذه البدائل المتوفرة؟ ويا ريت تذكرلي استخدامك الأساسي للموبايل (تصوير، ألعاب، أو استخدام يومي وبطارية) حتى أرشحلك الأنسب حسب المواصفات المتوفرة فعلياً.'
        : 'هل تقبل اعتماد أحد هذه البدائل المتوفرة بالكتالوج التجريبي للمقارنة؟';

      return `توضيح من الكتالوج التجريبي لفرع كربلاء: ${targetNotes.join('؛ و')}. ${followUpQuestion}`;
    }

    // 2. All target prices (if any) have near phones in the catalog
    const parts: string[] = [];

    if (targetMatches && targetMatches.length > 0) {
      const targetDescriptions = targetMatches
        .filter((m) => m.matchedProduct !== null)
        .map((m) => {
          const prod = m.matchedProduct!;
          const targetStr = m.targetPriceIQD.toLocaleString('en-US');
          const priceStr = prod.priceIQD.toLocaleString('en-US');
          if (prod.diffIQD === 0) {
            return `لهدف ${targetStr} د.ع اخترنا ${prod.nameAr} بسعر تجريبي ${priceStr} د.ع`;
          }
          const direction = prod.signedDiffIQD > 0 ? 'أعلى من الهدف بـ' : 'أقل من الهدف بـ';
          return `لهدف ${targetStr} د.ع أقرب جهاز متوفر هو ${prod.nameAr} بسعر تجريبي ${priceStr} د.ع (${direction} ${prod.diffIQD.toLocaleString('en-US')} د.ع)`;
        });

      if (targetDescriptions.length > 0) {
        parts.push(`حسب الكتالوج التجريبي لفرع كربلاء: ${targetDescriptions.join('، و')}.`);
      }
    }

    const summary = items
      .map((item) => {
        const specParts: string[] = [
          `تخزين ${item.storage ?? 'غير محدد'}`,
          `رام ${item.ram ?? 'غير محدد'}`,
        ];
        if (item.camera && item.camera !== 'غير محدد') {
          specParts.push(`كاميرا ${item.camera}`);
        }
        if (item.battery && item.battery !== 'غير محدد') {
          specParts.push(`بطارية ${item.battery}`);
        }
        if (item.processor && item.processor !== 'غير محدد') {
          specParts.push(`معالج ${item.processor}`);
        }
        specParts.push(`ضمان ${item.warrantyMonths ?? 12} شهر`);
        return `${item.nameAr ?? ''} بسعر ${Number(item.priceIQD ?? 0).toLocaleString('en-US')} د.ع (${specParts.join('، ')})`;
      })
      .join(' مقابل ');

    parts.push(`مقارنة المواصفات الفعلية من الكتالوج التجريبي لفرع كربلاء: ${summary}.`);

    if (wantsBest || (targetMatches && targetMatches.length >= 2)) {
      parts.push(this.buildGroundedRecommendation(items, priceGapIQD, usages));
    }

    return parts.join(' ');
  }

  private buildGroundedRecommendation(
    items: ToolComparisonItem[],
    priceGapIQD: number,
    usages: string[]
  ): string {
    const itemA = items[0]!;
    const itemB = items[1]!;
    const priceA = Number(itemA.priceIQD ?? 0);
    const priceB = Number(itemB.priceIQD ?? 0);

    const describeDocumentedSpecs = (item: ToolComparisonItem): string => {
      const facts: string[] = [];
      if (item.ram && item.ram !== 'غير محدد') facts.push(`رام ${item.ram}`);
      if (item.storage && item.storage !== 'غير محدد') facts.push(`تخزين ${item.storage}`);
      if (item.camera && item.camera !== 'غير محدد') facts.push(`كاميرا ${item.camera}`);
      if (item.battery && item.battery !== 'غير محدد') facts.push(`بطارية ${item.battery}`);
      if (item.processor && item.processor !== 'غير محدد') facts.push(`معالج ${item.processor}`);
      if (item.screen && item.screen !== 'غير محدد') facts.push(`شاشة ${item.screen}`);
      return facts.join('، ');
    };

    const factsA = describeDocumentedSpecs(itemA);
    const factsB = describeDocumentedSpecs(itemB);
    const gapNote =
      priceGapIQD > 0 ? ` علماً أن الفارق السعري بينهما ${priceGapIQD.toLocaleString('en-US')} د.ع.` : '';

    if (usages.length > 0) {
      const usageTag = usages[0]!;
      const aHasTag = Array.isArray(itemA.tags) && itemA.tags.includes(usageTag);
      const bHasTag = Array.isArray(itemB.tags) && itemB.tags.includes(usageTag);
      const chosen = aHasTag && !bHasTag ? itemA : bHasTag && !aHasTag ? itemB : itemA;
      const chosenFacts = chosen === itemA ? factsA : factsB;
      const chosenPrice = Number(chosen.priceIQD ?? 0).toLocaleString('en-US');
      return `بناءً على المواصفات المسجلة بالكتالوج التجريبي، أرشحلك ${chosen.nameAr ?? ''} بسعر ${chosenPrice} د.ع لكونه يوفر (${chosenFacts}).${gapNote}`;
    }

    return (
      `الترشيح المشروط حسب المواصفات المتوفرة فعلياً: ` +
      `إذا تفضل مواصفات ${itemA.nameAr ?? ''} بسعر ${priceA.toLocaleString('en-US')} د.ع فهو يقدم (${factsA})؛ ` +
      `وإذا تفضل ${itemB.nameAr ?? ''} بسعر ${priceB.toLocaleString('en-US')} د.ع فهو يقدم (${factsB}).${gapNote} ` +
      `شنو استخدامك الأساسي للجهاز (تصوير، ألعاب، أو استخدام يومي وبطارية) حتى أحددلك الخيار الأنسب إلك؟`
    );
  }
}
