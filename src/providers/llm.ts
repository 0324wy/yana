export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  content: string | null;
  toolCalls?: ToolCall[];
  finishReason: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMProvider {
  chat(
    messages: Array<Record<string, unknown>>,
    tools?: Array<Record<string, unknown>>,
    model?: string,
  ): Promise<LLMResponse>;
  stream?(
    messages: Array<Record<string, unknown>>,
    tools?: Array<Record<string, unknown>>,
    model?: string,
  ): AsyncIterable<LLMResponse>;
}
