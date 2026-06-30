import axios from 'axios';

export interface LLMConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  maxTokens: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  tokenCount?: number;
  model: string;
}

export class LLMService {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async generateResponse(
    messages: LLMMessage[],
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<LLMResponse> {
    try {
      const temperature = options?.temperature ?? 0.7;
      const max_tokens = options?.maxTokens ?? this.config.maxTokens;
      // Cerebras API format (OpenAI-compatible)
      const response = await axios.post(
        `${this.config.baseUrl}/chat/completions`,
        {
          model: this.config.model,
          messages: messages,
          max_tokens,
          temperature,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          timeout: 30000, // 30 second timeout
        }
      );

      const content = response.data.choices[0]?.message?.content || '';
      const tokenCount = response.data.usage?.total_tokens;

      return {
        content,
        tokenCount,
        model: this.config.model,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('LLM API Error:', error.response?.data || error.message);
        throw new Error(`LLM API Error: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }

  async queryWithContext(
    userPrompt: string,
    documentContext: string,
    systemPrompt?: string
  ): Promise<LLMResponse> {
    const messages: LLMMessage[] = [];

    // Add system prompt if provided
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    // Combine user prompt with document context
    const fullPrompt = documentContext
      ? `Context Documents:\n\n${documentContext}\n\n---\n\nUser Question: ${userPrompt}`
      : userPrompt;

    messages.push({
      role: 'user',
      content: fullPrompt,
    });

    return this.generateResponse(messages);
  }

  estimateTokenCount(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  checkContextLimit(text: string): { withinLimit: boolean; estimatedTokens: number } {
    const estimatedTokens = this.estimateTokenCount(text);
    const withinLimit = estimatedTokens < this.config.maxTokens * 0.7; // Leave room for response

    return { withinLimit, estimatedTokens };
  }
}

// Factory function to create LLM service from environment
export function createLLMService(): LLMService {
  const config: LLMConfig = {
    apiKey: process.env.CEREBRAS_API_KEY || '',
    model: process.env.LLM_MODEL || 'llama3.1-8b',
    baseUrl: process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1',
    maxTokens: parseInt(process.env.MAX_TOKENS || '8000'),
  };

  if (!config.apiKey) {
    console.warn('WARNING: CEREBRAS_API_KEY not set. LLM queries will fail.');
  }

  return new LLMService(config);
}
