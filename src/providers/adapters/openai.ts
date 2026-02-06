import { LLMProvider, LLMResponse, ToolCall } from "../llm";

export type OpenAIProviderOptions = {
  apiKey?: string;
  apiBase?: string;
  model?: string;
  timeoutMs?: number;
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

function safeParseArguments(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return {} as Record<string, unknown>;
}

function extractText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (typeof content === "number" || typeof content === "boolean") {
    return String(content);
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((part) => extractText(part))
      .filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts.join("") : null;
  }
  if (content && typeof content === "object") {
    const maybeText = (content as { text?: unknown }).text;
    if (typeof maybeText === "string") return maybeText;
    const maybeContent = (content as { content?: unknown }).content;
    if (typeof maybeContent === "string") return maybeContent;
  }
  return null;
}

function normalizeContent(content: unknown): string | null {
  const extracted = extractText(content);
  if (extracted !== null) return extracted;
  if (content === null || content === undefined) return null;
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
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

  constructor(options: OpenAIProviderOptions) {
    if (!options.apiKey) {
      throw new Error("Missing OPENAI_API_KEY");
    }
    this.apiKey = options.apiKey;
    this.apiBase = normalizeApiBase(options.apiBase);
    this.model = options.model ?? "gpt-4o-mini";
    this.timeoutMs = options.timeoutMs ?? 60000;
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.apiBase}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok && !res.body) {
        throw new Error(`OpenAI error ${res.status}`);
      }

      return res;
    } finally {
      clearTimeout(timeout);
    }
  }
}
