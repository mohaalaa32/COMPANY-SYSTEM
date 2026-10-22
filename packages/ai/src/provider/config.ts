/**
 * AI Provider Configuration
 * Reads from environment variables (process.env) without hardcoding any real keys, tokens, or credentials.
 */

export interface AIConfig {
  providerName: string;
  apiKey?: string;
  modelName: string;
  temperature: number;
}

export function loadAIConfigFromEnv(): AIConfig {
  return {
    providerName: process.env.AI_PROVIDER || 'mock',
    apiKey: process.env.GEMINI_API_KEY || process.env.LLM_API_KEY,
    modelName: process.env.LLM_MODEL || 'gemini-2.5-flash',
    temperature: Number(process.env.LLM_TEMPERATURE) || 0.2,
  };
}
