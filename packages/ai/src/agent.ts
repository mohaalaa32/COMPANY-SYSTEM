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
import {
  buildSalesSystemPrompt,
  extractCustomerProfile,
  findPendingDraft,
  inferStage,
  isExplicitOrderApproval,
  detectHandoffTrigger,
  verifyReplyClaims,
  CLAIMS_BLOCKED_REPLY_AR,
} from './persona';
import type { ClaimsVerification, ConversationStage, CustomerProfile, HandoffSuggestion } from './persona';

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
  claims: ClaimsVerification;
  isSafe: boolean;
  rejected: boolean;
  rejectionReason?: 'numbers' | 'claims';
  stage: ConversationStage;
  profile: CustomerProfile;
  handoffSuggestion: HandoffSuggestion | null;
  messages: AIMessage[];
}

/**
 * Default (Persona v1) prompt without per-turn context. The agent rebuilds the prompt each
 * turn with stage, known customer info, data mode and delivery-policy status.
 */
export const DEFAULT_SALES_SYSTEM_PROMPT = buildSalesSystemPrompt();

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
    this.systemPrompt = options.systemPrompt || '';
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
    const stage = inferStage(history, userMessage);
    const profile = extractCustomerProfile([...history, { role: 'user', content: userMessage }]);
    const handoffSuggestion = detectHandoffTrigger(userMessage);

    // Order approval is derived ONLY from the customer's own latest message and a draft that
    // was already shown to them in an earlier turn. The model cannot grant it.
    const pendingDraft = findPendingDraft(history);
    const approval =
      pendingDraft && isExplicitOrderApproval(userMessage)
        ? { approved: true, draftOrderId: pendingDraft.draftOrderId }
        : undefined;
    const turnContext: ToolExecutionContext = { ...this.context, orderApproval: approval };

    const systemPrompt =
      this.systemPrompt ||
      buildSalesSystemPrompt({
        dataMode: this.context.dataMode,
        deliveryPolicyConfigured: Boolean(this.context.deliveryPolicy),
        stage,
        profile,
      });

    const conversation: AIMessage[] = [
      { role: 'system', content: systemPrompt },
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

          const result = await executeToolCall(call, turnContext);
          toolResults.push(result);

          conversation.push({
            role: 'tool',
            name: call.name,
            toolCallId: call.id,
            // Failed tools must be visible to the model so it can answer honestly.
            content: JSON.stringify(
              result.success ? result.data : { toolFailed: true, error: result.error ?? 'unknown_error' }
            ),
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
    let rejectionReason: 'numbers' | 'claims' | undefined;

    if (!verification.isSafe) {
      if (this.autoCorrectNumbers && verification.correctedContent) {
        safeReply = verification.correctedContent;
      } else if (this.rejectOnHallucination) {
        isRejected = true;
        rejectionReason = 'numbers';
        safeReply =
          'عذراً، تم حجب الرد بسبب عدم تطابق الأرقام مع بيانات النظام الرسمية. يرجى مراجعة موظف المبيعات للتأكد من الأسعار المعتمدة.';
      }
    }

    // Claims guard: no "order confirmed" / "handed off" / delivery / policy / discount claims
    // that the actual tool results do not back.
    const claims = verifyReplyClaims(finalReply, toolResults);
    if (!claims.isSafe && !isRejected) {
      isRejected = true;
      rejectionReason = 'claims';
      safeReply = CLAIMS_BLOCKED_REPLY_AR;
    }

    return {
      reply: safeReply,
      toolCallsExecuted,
      toolResults,
      verification,
      claims,
      isSafe: verification.isSafe && claims.isSafe,
      rejected: isRejected,
      rejectionReason,
      stage,
      profile,
      handoffSuggestion,
      messages: conversation,
    };
  }
}
