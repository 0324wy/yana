import { LLMProvider, LLMResponse, ToolCall } from "../llm";
import {
  extractText,
  normalizeContent,
  safeParseArguments,
} from "../normalize";
import { fetchWithRetry } from "../http";

export type OpenAIProviderOptions = {
  apiKey?: string;
  apiBase?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  extraHeaders?: Record<string, string>;
};

type OpenAIToolCall = {
  id: string;
  type?: string;
  function: {
    name: string;
    arguments: string;
  };
};

type OpenAIChatResponse = {
  choices: Array<{
    message?: {
      content?: unknown;
      tool_calls?: OpenAIToolCall[];
      function_call?: { name: string; arguments: string } | null;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

function normalizeApiBase(apiBase?: string) {
  const base = apiBase?.trim() || "https://api.openai.com/v1";
  if (base.endsWith("/v1")) return base;
  return `${base.replace(/\/$/, "")}/v1`;
}

function mapToolCalls(toolCalls?: OpenAIToolCall[]): ToolCall[] | undefined {
  if (!toolCalls || toolCalls.length === 0) return undefined;
  return toolCalls.map((call) => ({
    id: call.id,
    name: call.function.name,
    arguments: safeParseArguments(call.function.arguments),
  }));
}

export class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private apiBase: string;
  private model: string;
  private timeoutMs: number;
  private maxRetries: number;
  private retryBaseDelayMs: number;
  private retryMaxDelayMs: number;
  private extraHeaders: Record<string, string>;

  constructor(options: OpenAIProviderOptions) {
    if (!options.apiKey) {
      throw new Error("Missing OPENAI_API_KEY");
    }
    this.apiKey = options.apiKey;
    this.apiBase = normalizeApiBase(options.apiBase);
    this.model = options.model ?? "gpt-4o-mini";
    this.timeoutMs = options.timeoutMs ?? 60000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 200;
    this.retryMaxDelayMs = options.retryMaxDelayMs ?? 2000;
    this.extraHeaders = options.extraHeaders ?? {};
  }

  async chat(
    messages: Array<Record<string, unknown>>,
    tools?: Array<Record<string, unknown>>,
    model?: string,
  ): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: model ?? this.model,
      messages,
    };
    if (tools && tools.length > 0) body.tools = tools;

    const response = await this.request(body);
    const choice = response.choices[0];
    const message = choice?.message ?? {};

    const toolCalls = mapToolCalls(message.tool_calls);
    const normalizedContent = normalizeContent(message.content);
    const functionCall = message.function_call;
    if (!toolCalls && functionCall) {
      return {
        content: normalizedContent,
        toolCalls: [
          {
            id: "function_call",
            name: functionCall.name,
            arguments: safeParseArguments(functionCall.arguments),
          },
        ],
        finishReason: choice?.finish_reason ?? "stop",
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens ?? 0,
              completionTokens: response.usage.completion_tokens ?? 0,
              totalTokens: response.usage.total_tokens ?? 0,
            }
          : undefined,
      };
    }

    return {
      content: normalizedContent,
      toolCalls,
      finishReason: choice?.finish_reason ?? "stop",
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens ?? 0,
            completionTokens: response.usage.completion_tokens ?? 0,
            totalTokens: response.usage.total_tokens ?? 0,
          }
        : undefined,
    };
  }

  async *stream(
    messages: Array<Record<string, unknown>>,
    tools?: Array<Record<string, unknown>>,
    model?: string,
  ): AsyncIterable<LLMResponse> {
    const body: Record<string, unknown> = {
      model: model ?? this.model,
      messages,
      stream: true,
    };
    if (tools && tools.length > 0) body.tools = tools;

    const res = await this.requestRaw(body);
    if (!res.body) {
      throw new Error("No response body for streaming");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    const toolCallState = new Map<number, { id: string; name: string; args: string }>();
    let finishReason: string | null = null;

    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let lineEnd = buffer.indexOf("\n");
      while (lineEnd !== -1) {
        const line = buffer.slice(0, lineEnd).trim();
        buffer = buffer.slice(lineEnd + 1);
        lineEnd = buffer.indexOf("\n");

        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") {
          finishReason = finishReason ?? "stop";
          continue;
        }

        let parsed: any;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }

        const delta = parsed?.choices?.[0]?.delta ?? {};
        finishReason = parsed?.choices?.[0]?.finish_reason ?? finishReason;

        const deltaText = extractText(delta.content);
        if (typeof deltaText === "string" && deltaText.length > 0) {
          yield {
            content: deltaText,
            finishReason: finishReason ?? "streaming",
          };
        }

        if (Array.isArray(delta.tool_calls)) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index as number;
            const existing = toolCallState.get(index) ?? {
              id: toolCallDelta.id ?? `tool_${index}`,
              name: toolCallDelta.function?.name ?? "",
              args: "",
            };

            if (toolCallDelta.id) existing.id = toolCallDelta.id;
            if (toolCallDelta.function?.name) {
              existing.name = toolCallDelta.function.name;
            }
            if (toolCallDelta.function?.arguments) {
              existing.args += toolCallDelta.function.arguments;
            }

            toolCallState.set(index, existing);
          }
        }
      }
    }

    if (toolCallState.size > 0) {
      const toolCalls: ToolCall[] = Array.from(toolCallState.values()).map(
        (call) => ({
          id: call.id,
          name: call.name,
          arguments: safeParseArguments(call.args),
        }),
      );

      yield {
        content: null,
        toolCalls,
        finishReason: finishReason ?? "tool_calls",
      };
    } else {
      yield {
        content: null,
        finishReason: finishReason ?? "stop",
      };
    }
  }

  private async request(body: Record<string, unknown>): Promise<OpenAIChatResponse> {
    const res = await this.requestRaw(body);
    const json = (await res.json()) as OpenAIChatResponse;
    if (!res.ok) {
      throw new Error(`OpenAI error ${res.status}: ${JSON.stringify(json)}`);
    }
    return json;
  }

  private async requestRaw(body: Record<string, unknown>) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
    for (const [key, value] of Object.entries(this.extraHeaders)) {
      if (value) headers[key] = value;
    }
    return fetchWithRetry({
      provider: "OpenAI",
      url: `${this.apiBase}/chat/completions`,
      init: {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
      timeoutMs: this.timeoutMs,
      maxRetries: this.maxRetries,
      retryBaseDelayMs: this.retryBaseDelayMs,
      retryMaxDelayMs: this.retryMaxDelayMs,
    });
  }
}
