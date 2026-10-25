/**
 * AI Package Core Types & Contracts
 * Strictly adheres to docs/CONTRACTS.md §4 and system architecture.
 */

import type { ISalesAdapter, IWhatsAppAdapter } from '@tel/adapters';
import type { ICalcEngine } from '@tel/calc';

// ============================================================================
// §4. AI Tool Calling Contracts (docs/CONTRACTS.md)
// ============================================================================

export type SalesAIToolName =
  | 'search_products'
  | 'get_product_details'
  | 'check_stock'
  | 'compare_products'
  | 'get_offers'
  | 'calculate_budget_and_price'
  | 'calculate_installments'
  | 'create_order_draft'
  | 'confirm_order'
  | 'handoff_to_human';

export interface ToolCallRequest {
  id: string;
  name: SalesAIToolName;
  arguments: Record<string, unknown>;
}

export interface ToolCallResponse {
  toolCallId: string;
  success: boolean;
  data: Record<string, unknown>;
  error?: string;
}

// ============================================================================
// Tool Registry & Execution Context
// ============================================================================

/**
 * Business-approved delivery policy. When absent, delivery is "undetermined":
 * no fee may be shown or included in a final total, and orders cannot be confirmed.
 */
export interface DeliveryPolicy {
  feeIQD: number;
}

/**
 * Set by the agent (never by the model) for a single confirm_order call, only when the
 * customer explicitly approved a draft that was already shown to them in an earlier turn.
 */
export interface OrderApproval {
  approved: boolean;
  draftOrderId: string;
}

export interface ToolExecutionContext {
  salesAdapter: ISalesAdapter;
  whatsAppAdapter: IWhatsAppAdapter;
  calcEngine: ICalcEngine;
  conversationId?: string;
  customerPhone?: string;
  metadata?: Record<string, unknown>;
  /** Defaults to 'mock': catalog/stock data is test data, not confirmed Karbala inventory. */
  dataMode?: 'mock' | 'live';
  deliveryPolicy?: DeliveryPolicy;
  orderApproval?: OrderApproval;
}

export interface ToolParameterProperty {
  type: string;
  description: string;
  enum?: string[];
  items?: Record<string, unknown>;
}

export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolDefinition {
  name: SalesAIToolName;
  descriptionAr: string;
  descriptionEn: string;
  parameters: ToolParameterSchema;
  execute: (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<Record<string, unknown>>;
}

// ============================================================================
// LLM Provider & Message Interfaces
// ============================================================================

export type AIMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AIMessage {
  role: AIMessageRole;
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCallRequest[];
  name?: string;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCallRequest[];
  usage?: LLMUsage;
}

export interface ILLMProvider {
  readonly name: string;
  generateResponse(messages: AIMessage[], tools?: ToolDefinition[]): Promise<LLMResponse>;
}

// ============================================================================
// Numerical Hallucination Guard Types
// ============================================================================

export interface ExtractedNumber {
  raw: string;
  value: number;
  index: number;
}

export interface NumberVerificationResult {
  isSafe: boolean;
  extractedNumbers: ExtractedNumber[];
  authorizedNumbers: number[];
  unauthorizedNumbers: ExtractedNumber[];
  reasonAr?: string;
  correctedContent?: string;
}
