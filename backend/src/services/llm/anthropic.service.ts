import { BaseLLMService, LLMQueryOptions, LLMQueryResult } from './base-llm.service';
import axios from 'axios';

export class AnthropicService extends BaseLLMService {
    private apiKey: string;
    private modelName: string;

    constructor(config: { apiKey: string; model: string }) {
        super();
        this.apiKey = config.apiKey;
        this.modelName = config.model;
    }

    async query(prompt: string, options?: LLMQueryOptions): Promise<LLMQueryResult> {
        const messages: Array<{ role: string; content: string }> = [];
        messages.push({ role: 'user', content: prompt });

        const requestBody: any = {
            model: this.modelName,
            messages,
            max_tokens: options?.maxTokens || 1000
        };

        if (options?.systemPrompt) {
            requestBody.system = options.systemPrompt;
        }

        const response = await axios.post(
            'https://api.anthropic.com/v1/messages',
            requestBody,
            {
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        return {
            content: response.data.content[0].text,
            tokenCount: response.data.usage
                ? response.data.usage.input_tokens + response.data.usage.output_tokens
                : undefined
        };
    }

    get provider() { return 'anthropic'; }
    get model() { return this.modelName; }
    get isConfigured() { return !!this.apiKey && this.apiKey !== 'your_anthropic_api_key_here'; }
}
