import { BaseLLMService, LLMQueryOptions, LLMQueryResult } from './base-llm.service';
import axios from 'axios';

export class OpenAIService extends BaseLLMService {
    private apiKey: string;
    private modelName: string;

    constructor(config: { apiKey: string; model: string }) {
        super();
        this.apiKey = config.apiKey;
        this.modelName = config.model;
    }

    async query(prompt: string, options?: LLMQueryOptions): Promise<LLMQueryResult> {
        const messages: Array<{ role: string; content: string }> = [];

        if (options?.systemPrompt) {
            messages.push({ role: 'system', content: options.systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: this.modelName,
                messages,
                max_tokens: options?.maxTokens || 1000,
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
            content: response.data.choices[0].message.content,
            tokenCount: response.data.usage?.total_tokens
        };
    }

    get provider() { return 'openai'; }
    get model() { return this.modelName; }
    get isConfigured() { return !!this.apiKey && this.apiKey !== 'your_openai_api_key_here'; }
}
