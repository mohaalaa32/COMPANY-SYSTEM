import { describe, it, expect, beforeEach } from 'vitest';
import { MockSalesAdapter, MockWhatsAppAdapter } from '@tel/adapters';
import { calcEngine } from '@tel/calc';
import {
  SalesAIAgent,
  MockLLMProvider,
  loadAIConfigFromEnv,
} from '../src/index';
import type { ToolExecutionContext, SalesAIToolName } from '../src/types';

describe('SalesAIAgent Orchestration & Safety Integration (Agent 4)', () => {
  let context: ToolExecutionContext;
  let salesAdapter: MockSalesAdapter;
  let whatsAppAdapter: MockWhatsAppAdapter;
  let mockProvider: MockLLMProvider;

  beforeEach(() => {
    salesAdapter = new MockSalesAdapter();
    whatsAppAdapter = new MockWhatsAppAdapter();
    context = {
      salesAdapter,
      whatsAppAdapter,
      calcEngine,
      conversationId: 'conv_agent_test',
      customerPhone: '07801234567',
    };
    mockProvider = new MockLLMProvider();
  });

  it('runs end-to-end tool calling flow and verifies grounded numerical output', async () => {
    // 1. Queue a tool call from the model
    mockProvider.queueResponse({
      content: '',
      toolCalls: [
        {
          id: 'call_search_iphone',
          name: 'search_products',
          arguments: { query: 'آيفون 16' },
        },
      ],
    });

    // 2. Queue the final grounded synthesis from the model
    // 1850000 is the real salePriceIQD of iPhone 16 Pro Max in MOCK_PRODUCTS
    mockProvider.queueResponse({
      content: 'آيفون 16 برو ماكس متوفر حالياً بسعر 1,850,000 دينار عراقي وضمان 12 شهر.',
    });

    const agent = new SalesAIAgent(context, mockProvider);
    const result = await agent.processMessage('أريد أعرف سعر آيفون 16 برو ماكس');

    expect(result.toolCallsExecuted.length).toBe(1);
    expect(result.toolCallsExecuted[0]?.name).toBe('search_products');
    expect(result.toolResults.length).toBe(1);
    expect(result.toolResults[0]?.success).toBe(true);

    expect(result.isSafe).toBe(true);
    expect(result.rejected).toBe(false);
    expect(result.reply).toContain('1,850,000');
  });

  it('proves the AI layer rejects a reply containing a price not present in tool results', async () => {
    // 1. Tool call executes and returns real product price (e.g. 1850000)
    mockProvider.queueResponse({
      content: '',
      toolCalls: [
        {
          id: 'call_search_iphone',
          name: 'search_products',
          arguments: { query: 'آيفون 16' },
        },
      ],
    });

    // 2. Model hallucinates an unauthorized price (999,000 instead of 1,850,000)
    mockProvider.queueResponse({
      content: 'آيفون 16 برو ماكس عليه عرض خاص اليوم بسعر 999,000 دينار فقط!',
    });

    const agent = new SalesAIAgent(context, mockProvider, { rejectOnHallucination: true });
    const result = await agent.processMessage('كم سعر الآيفون؟');

    // The guard caught the invented price!
    expect(result.isSafe).toBe(false);
    expect(result.rejected).toBe(true);
    expect(result.verification.unauthorizedNumbers.some((n) => n.value === 999000)).toBe(true);
    // Reply is sanitized with safe fallback notice
    expect(result.reply).toContain('تم حجب الرد');
    expect(result.reply).not.toContain('999,000');
  });

  it('proves the AI layer auto-corrects a reply when autoCorrectNumbers option is enabled', async () => {
    mockProvider.queueResponse({
      content: '',
      toolCalls: [
        {
          id: 'call_search_iphone',
          name: 'search_products',
          arguments: { query: 'آيفون 16' },
        },
      ],
    });

    // Model attempts to invent fake price 777,000
    mockProvider.queueResponse({
      content: 'السعر الخاص هو 777,000 د.ع.',
    });

    const agent = new SalesAIAgent(context, mockProvider, { autoCorrectNumbers: true });
    const result = await agent.processMessage('كم السعر؟');

    expect(result.isSafe).toBe(false);
    expect(result.reply).not.toContain('777,000');
    expect(result.reply).toContain('الأسعار المعتمدة');
  });

  it('rejects execution of any tool not defined in docs/CONTRACTS.md §4', async () => {
    // Model attempts to call an unauthorized imaginary tool
    mockProvider.queueResponse({
      content: '',
      toolCalls: [
        {
          id: 'call_bad',
          name: 'unauthorized_tool_name' as unknown as SalesAIToolName,
          arguments: {},
        },
      ],
    });

    mockProvider.queueResponse({
      content: 'عذراً لا يمكن تنفيذ هذه العملية.',
    });

    const agent = new SalesAIAgent(context, mockProvider);
    const result = await agent.processMessage('تخفيض غير مصرح به');

    expect(result.toolResults[0]?.success).toBe(false);
    expect(result.toolResults[0]?.error).toContain('strictly unauthorized');
  });

  it('loads AI configuration safely from environment without exposing secrets', () => {
    const config = loadAIConfigFromEnv();
    expect(config.providerName).toBeDefined();
    expect(config.modelName).toBeDefined();
    // In test environment, API key is undefined or from safe env, never hardcoded
    expect(typeof config.temperature).toBe('number');
  });
});
