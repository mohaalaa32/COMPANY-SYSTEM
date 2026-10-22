import type {
  ToolExecutionContext,
  ILLMProvider,
  AIMessage,
  ToolCallRequest,
  ToolCallResponse,
  NumberVerificationResult,
} from './types';
import { getAllToolDefinitions, executeToolCall, isAllowedToolName } from './tools/registry';
import { verifyResponseNumbers } from './guard/number-guard';
import { MockLLMProvider } from './provider/mock-provider';
import { brand } from '@tel/config/brand';

export interface AgentOptions {
  maxIterations?: number;
  systemPrompt?: string;
  autoCorrectNumbers?: boolean;
  rejectOnHallucination?: boolean;
}

export interface AgentTurnResult {
  reply: string;
  toolCallsExecuted: ToolCallRequest[];
  toolResults: ToolCallResponse[];
  verification: NumberVerificationResult;
  isSafe: boolean;
  rejected: boolean;
  messages: AIMessage[];
}

export const DEFAULT_SALES_SYSTEM_PROMPT = `أنت المساعد الذكي لمبيعات "${brand.nameAr}".
مهمتك مساعدة العملاء في اختيار الأجهزة والهواتف الذكية والإكسسوارات مع تقديم عروض دقيقة ومطابقة للميزانية.
القواعد الصارمة:
1. يمنع منعاً باتاً اختراع أو افتراض أي سعر أو نسبة خصم أو توفر للمخزون أو توتال بدون استدعاء الأداة المخصصة.
2. جميع الأسعار والمواصفات والأقساط يجب أن تأتي حصراً من نتائج استدعاء الأدوات (search_products, check_stock, calculate_budget_and_price, calculate_installments).
3. تحدث بأسلوب عراقي ودود ومحترف وقدم النصيحة الصادقة للعميل.`;

/**
 * Sales AI Agent Orchestrator (Agent 4)
 * Coordinates LLM inference, Tool Calling against @tel/adapters and @tel/calc,
 * and enforces strict numerical grounding through the anti-hallucination guard.
 */
export class SalesAIAgent {
  private context: ToolExecutionContext;
  private provider: ILLMProvider;
  private maxIterations: number;
  private systemPrompt: string;
  private autoCorrectNumbers: boolean;
  private rejectOnHallucination: boolean;

  constructor(
    context: ToolExecutionContext,
    provider?: ILLMProvider,
    options: AgentOptions = {}
  ) {
    this.context = context;
    this.provider = provider || new MockLLMProvider();
    this.maxIterations = options.maxIterations || 5;
    this.systemPrompt = options.systemPrompt || DEFAULT_SALES_SYSTEM_PROMPT;
    this.autoCorrectNumbers = options.autoCorrectNumbers || false;
    this.rejectOnHallucination = options.rejectOnHallucination ?? true;
  }

  /**
   * Process incoming user message with multi-turn tool calling and numerical verification.
   */
  public async processMessage(
    userMessage: string,
    history: AIMessage[] = []
  ): Promise<AgentTurnResult> {
    const conversation: AIMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...history,
      { role: 'user', content: userMessage },
    ];

    const toolCallsExecuted: ToolCallRequest[] = [];
    const toolResults: ToolCallResponse[] = [];
    const availableTools = getAllToolDefinitions();

    let iterations = 0;
    let finalReply = '';

    while (iterations < this.maxIterations) {
      iterations++;

      const llmResponse = await this.provider.generateResponse(conversation, availableTools);

      // Check if LLM requested tool execution
      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        // Append assistant tool-call intent to conversation chain
        conversation.push({
          role: 'assistant',
          content: llmResponse.content || '',
          toolCalls: llmResponse.toolCalls,
        });

        for (const call of llmResponse.toolCalls) {
          toolCallsExecuted.push(call);

          if (!isAllowedToolName(call.name)) {
            const errResult: ToolCallResponse = {
              toolCallId: call.id,
              success: false,
              data: {},
              error: `Tool '${call.name}' is strictly unauthorized.`,
            };
            toolResults.push(errResult);
            conversation.push({
              role: 'tool',
              name: call.name,
              toolCallId: call.id,
              content: JSON.stringify(errResult),
            });
            continue;
          }

          const result = await executeToolCall(call, this.context);
          toolResults.push(result);

          conversation.push({
            role: 'tool',
            name: call.name,
            toolCallId: call.id,
            content: JSON.stringify(result.data),
          });
        }

        // Loop continues so LLM synthesizes tool outputs
        continue;
      }

      // LLM gave a final text reply
      finalReply = llmResponse.content;
      break;
    }

    if (!finalReply && iterations >= this.maxIterations) {
      finalReply = 'عذراً، استغرقت معالجة الطلب وقتاً أطول من المتوقع. كيف أقدر أساعدك بشكل مباشر؟';
    }

    // Run Numerical Hallucination Guard
    const verification = verifyResponseNumbers(finalReply, toolResults, {
      autoCorrect: this.autoCorrectNumbers,
    });

    let safeReply = finalReply;
    let isRejected = false;

    if (!verification.isSafe) {
      if (this.autoCorrectNumbers && verification.correctedContent) {
        safeReply = verification.correctedContent;
      } else if (this.rejectOnHallucination) {
        isRejected = true;
        safeReply =
          'عذراً، تم حجب الرد بسبب عدم تطابق الأرقام مع بيانات النظام الرسمية. يرجى مراجعة موظف المبيعات للتأكد من الأسعار المعتمدة.';
      }
    }

    return {
      reply: safeReply,
      toolCallsExecuted,
      toolResults,
      verification,
      isSafe: verification.isSafe,
      rejected: isRejected,
      messages: conversation,
    };
  }
}
