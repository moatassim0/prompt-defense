import { BaseLLMService, LLMQueryOptions, LLMQueryResult } from './base-llm.service';
import { OpenAIService } from './openai.service';
import { AnthropicService } from './anthropic.service';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * CerebrasLLMService - wraps the existing Cerebras/Llama API
 * into the BaseLLMService interface for multi-LLM comparison
 */
class CerebrasLLMService extends BaseLLMService {
    private apiKey: string;
    private modelName: string;
    private baseUrl: string;

    constructor(config: { apiKey: string; model: string; baseUrl: string }) {
        super();
        this.apiKey = config.apiKey;
        this.modelName = config.model;
        this.baseUrl = config.baseUrl;
    }

    async query(prompt: string, options?: LLMQueryOptions): Promise<LLMQueryResult> {
        const messages: Array<{ role: string; content: string }> = [];

        if (options?.systemPrompt) {
            messages.push({ role: 'system', content: options.systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        const response = await axios.post(
            `${this.baseUrl}/chat/completions`,
            {
                model: this.modelName,
                messages,
                max_tokens: options?.maxTokens || 8000,
                temperature: options?.temperature || 0.7
            },
            {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        return {
            content: response.data.choices[0]?.message?.content || '',
            tokenCount: response.data.usage?.total_tokens
        };
    }

    get provider() { return 'cerebras'; }
    get model() { return this.modelName; }
    get isConfigured() { return !!this.apiKey; }
}

/**
 * LLM Factory - creates and caches LLM service instances
 */
export class LLMFactory {
    private instances: Map<string, BaseLLMService> = new Map();

    /**
     * Get an LLM service by provider name
     */
    getLLM(provider: string): BaseLLMService {
        if (!this.instances.has(provider)) {
            this.instances.set(provider, this.createLLM(provider));
        }
        return this.instances.get(provider)!;
    }

    /**
     * Get all available (configured) providers
     */
    getAvailableProviders(): string[] {
        const allProviders = ['cerebras', 'openai', 'anthropic'];
        return allProviders.filter(p => {
            try {
                const llm = this.getLLM(p);
                return llm.isConfigured;
            } catch {
                return false;
            }
        });
    }

    private createLLM(provider: string): BaseLLMService {
        switch (provider) {
            case 'cerebras':
                return new CerebrasLLMService({
                    apiKey: process.env.CEREBRAS_API_KEY || '',
                    model: process.env.LLM_MODEL || 'llama3.1-8b',
                    baseUrl: process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1'
                });
            case 'openai':
                return new OpenAIService({
                    apiKey: process.env.OPENAI_API_KEY || '',
                    model: 'gpt-3.5-turbo'
                });
            case 'anthropic':
                return new AnthropicService({
                    apiKey: process.env.ANTHROPIC_API_KEY || '',
                    model: 'claude-3-sonnet-20240229'
                });
            default:
                throw new Error(`Unknown LLM provider: ${provider}`);
        }
    }
}

export const llmFactory = new LLMFactory();
