import type {
  AIMessage,
  AIProviderResponse,
  AgentProcessResult,
  KnowledgeStore,
  ToolExecutionContext,
} from '@tel/ai';
import type { MockSalesAdapter, MockWhatsAppAdapter } from '@tel/adapters';

export type EvalCategory =
  | 'budget_numbers_dialect_usage'
  | 'search_recommend_compare_accessory'
  | 'price_objections_unapproved_discounts'
  | 'out_of_stock_missing_data_tool_failure'
  | 'no_hallucinated_price_warranty_delivery_installments'
  | 'order_review_explicit_approval_stale_draft'
  | 'handoff_without_false_claim'
  | 'knowledge_base_published_only_withdraw_revision'
  | 'prompt_injection_internal_leak'
  | 'karbala_branch_sku_independence';

export const EVAL_CATEGORIES: readonly EvalCategory[] = [
  'budget_numbers_dialect_usage',
  'search_recommend_compare_accessory',
  'price_objections_unapproved_discounts',
  'out_of_stock_missing_data_tool_failure',
  'no_hallucinated_price_warranty_delivery_installments',
  'order_review_explicit_approval_stale_draft',
  'handoff_without_false_claim',
  'knowledge_base_published_only_withdraw_revision',
  'prompt_injection_internal_leak',
  'karbala_branch_sku_independence',
] as const;

export const EVAL_CATEGORY_LABELS_AR: Record<EvalCategory, string> = {
  budget_numbers_dialect_usage: 'فهم الميزانية والأرقام واللهجة والاستخدام',
  search_recommend_compare_accessory: 'البحث والتوصية والمقارنة والتوافق بين الجهاز والملحق',
  price_objections_unapproved_discounts: 'اعتراضات السعر والخصومات غير المعتمدة',
  out_of_stock_missing_data_tool_failure: 'نفاد المخزون ونقص البيانات وفشل الأدوات',
  no_hallucinated_price_warranty_delivery_installments: 'عدم اختلاق السعر والضمان والتوصيل والأقساط',
  order_review_explicit_approval_stale_draft:
    'مراجعة الطلب والموافقة الصريحة، ورفض الموافقة القديمة بعد تغيير المسودة',
  handoff_without_false_claim: 'التحويل للموظف دون ادعاء نجاح تحويل لم يحدث',
  knowledge_base_published_only_withdraw_revision: 'استرجاع المعرفة المنشورة فقط، وسحبها وتعديلها',
  prompt_injection_internal_leak: 'محاولات تجاوز التعليمات وتسريب معلومات داخلية',
  karbala_branch_sku_independence: 'الالتزام بفرع كربلاء واستقلال رموز الأصناف',
};

export type EvalScenarioStatus =
  | 'PASSED'
  | 'FAILED_BEHAVIOR'
  | 'ERROR_ENVIRONMENT'
  | 'SKIPPED_UNCONFIGURED';

export interface EvalRuntimeContext {
  toolContext: ToolExecutionContext;
  salesAdapter: MockSalesAdapter;
  whatsAppAdapter: MockWhatsAppAdapter;
  knowledgeStore: KnowledgeStore;
  systemPromptSnapshot: string;
}

export interface EvalTurnInput {
  userMessage: string;
  mockLLMResponses?: Array<Partial<AIProviderResponse>>;
  beforeTurn?: (runtime: EvalRuntimeContext) => Promise<void> | void;
}

export interface EvalTurnTrace {
  turnIndex: number;
  userMessage: string;
  result: AgentProcessResult;
}

export interface EvalCriterionVerification {
  passed: boolean;
  reasonAr: string;
}

export interface EvalCriterionCheck {
  id: string;
  descriptionAr: string;
  verify: (traces: EvalTurnTrace[], runtime: EvalRuntimeContext) => EvalCriterionVerification;
}

export interface EvalScenario {
  id: string;
  category: EvalCategory;
  titleAr: string;
  descriptionAr: string;
  expectedBehaviorAr: string;
  initialContext?: {
    dataMode?: 'mock' | 'production';
    deliveryPolicy?: { feeIQD: number };
    seedHistory?: AIMessage[];
    setup?: (runtime: EvalRuntimeContext) => Promise<void> | void;
  };
  turns: EvalTurnInput[];
  criteria: EvalCriterionCheck[];
}

export interface EvalCriterionResult {
  criterionId: string;
  descriptionAr: string;
  passed: boolean;
  reasonAr: string;
}

export interface EvalScenarioResult {
  scenarioId: string;
  category: EvalCategory;
  categoryLabelAr: string;
  titleAr: string;
  expectedBehaviorAr: string;
  status: EvalScenarioStatus;
  turnCount: number;
  durationMs: number;
  criteriaResults: EvalCriterionResult[];
  failureReasonsAr: string[];
  errorDetails?: string;
}

export interface EvalCategorySummary {
  category: EvalCategory;
  labelAr: string;
  total: number;
  passed: number;
  failedBehavior: number;
  errorEnvironment: number;
  skippedUnconfigured: number;
}

export interface LiveLLMEvalConfig {
  enabled: boolean;
  providerName?: string;
  apiKeyConfigured?: boolean;
  maxRequests: number;
  maxTotalTokens: number;
  timeoutMs: number;
}

export interface EvalCanaryCheckResult {
  canaryId: string;
  titleAr: string;
  expectedFailureReasonAr: string;
  detectedFailure: boolean;
  actualStatus: EvalScenarioStatus;
  actualFailureReasonsAr: string[];
}

export interface EvalReport {
  generatedAt: string;
  branchScope: 'branch-karbala';
  executionMode: 'deterministic_mock_integration' | 'live_llm';
  executionModeDisclaimerAr: string;
  liveLLMStatus: {
    status: 'SKIPPED_UNCONFIGURED' | 'EXECUTED' | 'BUDGET_HALTED';
    labelAr: string;
    limits: {
      maxRequests: number;
      maxTotalTokens: number;
      timeoutMs: number;
    };
    requestsUsed: number;
    tokensUsed: number;
  };
  totals: {
    totalScenarios: number;
    passed: number;
    failedBehavior: number;
    errorEnvironment: number;
    skippedUnconfigured: number;
    totalTurns: number;
    multiTurnScenarios: number;
    totalCriteriaChecked: number;
  };
  categorySummaries: EvalCategorySummary[];
  canaryVerification: {
    allCanariesCaught: boolean;
    results: EvalCanaryCheckResult[];
  };
  scenarioResults: EvalScenarioResult[];
}

