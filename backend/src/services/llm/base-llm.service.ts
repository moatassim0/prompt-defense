// Abstract base class for LLM providers
// All LLM services must implement this interface

export interface LLMQueryOptions {
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
}

export interface LLMQueryResult {
    content: string;
    tokenCount?: number;
}

export abstract class BaseLLMService {
    /**
     * Send a prompt to the LLM and get a response
     */
    abstract query(prompt: string, options?: LLMQueryOptions): Promise<LLMQueryResult>;

    /**
     * The provider name (e.g., 'cerebras', 'openai', 'anthropic')
     */
    abstract get provider(): string;

    /**
     * The model identifier being used
     */
    abstract get model(): string;

    /**
     * Check if the service is properly configured
     */
    abstract get isConfigured(): boolean;
}
