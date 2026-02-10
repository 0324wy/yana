import { LLMProvider, LLMResponse, ToolCall } from "../llm";
import { normalizeContent, safeParseArguments } from "../normalize";
import { fetchWithRetry } from "../http";

export type AnthropicProviderOptions = {
  apiKey?: string;
  apiBase?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  maxTokens?: number;
  version?: string;
};

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

type AnthropicTool = {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
};

type AnthropicResponse = {
  content?: Array<{
    type: "text" | "tool_use";
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  stop_reason?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number };
};

function normalizeApiBase(apiBase?: string) {
  const base = apiBase?.trim() || "https://api.anthropic.com";
  return base.replace(/\/$/, "");
}

function toAnthropicTools(
  tools?: Array<Record<string, unknown>>,
): AnthropicTool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  const mapped: AnthropicTool[] = [];
  for (const tool of tools) {
    const fn = (tool as { function?: Record<string, unknown> }).function ?? {};
    const name = String(fn.name ?? "").trim();
    if (!name) continue;
    const description =
      typeof fn.description === "string" ? fn.description : undefined;
    const input_schema =
      (fn.parameters as Record<string, unknown>) ?? { type: "object" };
    mapped.push({ name, description, input_schema });
  }
  return mapped.length > 0 ? mapped : undefined;
}

function mapOpenAIToolCalls(toolCalls: unknown) {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.map((call, index) => {
    const raw = call as {
      id?: string;
      name?: string;
      function?: { name?: string; arguments?: string };
      arguments?: unknown;
    };
    const id = String(raw.id ?? `tool_${index}`);
    const name = String(raw.function?.name ?? raw.name ?? "");
    const argsRaw =
      typeof raw.function?.arguments === "string"
        ? raw.function.arguments
        : typeof raw.arguments === "string"
          ? raw.arguments
          : "";
    const args =
      argsRaw.length > 0
        ? safeParseArguments(argsRaw)
        : raw.arguments && typeof raw.arguments === "object"
          ? (raw.arguments as Record<string, unknown>)
          : {};
    return { id, name, input: args };
  });
}

function mapMessages(messages: Array<Record<string, unknown>>) {
  const systemParts: string[] = [];
  const out: AnthropicMessage[] = [];

  for (const msg of messages) {
    const role = String(msg.role ?? "");
    if (role === "system") {
      const text = normalizeContent(msg.content);
      if (text) systemParts.push(text);
      continue;
    }

    if (role === "tool") {
      const toolResult = normalizeContent(msg.content) ?? "";
      const toolUseId = String((msg as { tool_call_id?: unknown }).tool_call_id ?? "");
      const name = String((msg as { name?: unknown }).name ?? "");
      const blocks: AnthropicContentBlock[] = [
        {
          type: "tool_result",
          tool_use_id: toolUseId || name || "tool_result",
          content: toolResult,
        },
      ];
      out.push({ role: "user", content: blocks });
      continue;
    }

    if (role === "assistant") {
      const toolCalls = mapOpenAIToolCalls(
        (msg as { tool_calls?: unknown }).tool_calls,
      );
      const text = normalizeContent(msg.content) ?? "";
      if (toolCalls.length > 0) {
        const blocks: AnthropicContentBlock[] = [];
        if (text) blocks.push({ type: "text", text });
        for (const call of toolCalls) {
          blocks.push({
            type: "tool_use",
            id: call.id,
            name: call.name,
            input: call.input,
          });
        }
        out.push({ role: "assistant", content: blocks });
      } else {
        out.push({ role: "assistant", content: text });
      }
      continue;
    }

    if (role === "user") {
      const text = normalizeContent(msg.content) ?? "";
      out.push({ role: "user", content: text });
      continue;
    }
  }

  const system = systemParts.length > 0 ? systemParts.join("\n\n") : undefined;
  return { system, messages: out };
}

function extractTextAndTools(response: AnthropicResponse) {
  const content = response.content ?? [];
  const textParts: string[] = [];
  const toolCalls: ToolCall[] = [];

  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string") {
      textParts.push(block.text);
    }
    if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id ?? `tool_${toolCalls.length}`,
        name: block.name ?? "",
        arguments: block.input ?? {},
      });
    }
  }

  return {
    content: textParts.join(""),
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

export class AnthropicProvider implements LLMProvider {
  private apiKey: string;
  private apiBase: string;
  private model: string;
  private timeoutMs: number;
  private maxRetries: number;
  private retryBaseDelayMs: number;
  private retryMaxDelayMs: number;
  private maxTokens: number;
  private version: string;

  constructor(options: AnthropicProviderOptions) {
    if (!options.apiKey) {
      throw new Error("Missing ANTHROPIC_API_KEY");
    }
    this.apiKey = options.apiKey;
    this.apiBase = normalizeApiBase(options.apiBase);
    this.model = options.model ?? "claude-3-5-sonnet-20240620";
    this.timeoutMs = options.timeoutMs ?? 60000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 200;
    this.retryMaxDelayMs = options.retryMaxDelayMs ?? 2000;
    this.maxTokens = options.maxTokens ?? 1024;
    this.version = options.version ?? "2023-06-01";
  }

  async chat(
    messages: Array<Record<string, unknown>>,
    tools?: Array<Record<string, unknown>>,
    model?: string,
  ): Promise<LLMResponse> {
    const mapped = mapMessages(messages);
    const body: Record<string, unknown> = {
      model: model ?? this.model,
      messages: mapped.messages,
      max_tokens: this.maxTokens,
    };
    if (mapped.system) body.system = mapped.system;
    const toolDefs = toAnthropicTools(tools);
    if (toolDefs && toolDefs.length > 0) body.tools = toolDefs;

    const response = await this.request(body);
    const parsed = extractTextAndTools(response);
    return {
      content: parsed.content ?? null,
      toolCalls: parsed.toolCalls,
      finishReason: response.stop_reason ?? "stop",
      usage: response.usage
        ? {
            promptTokens: response.usage.input_tokens ?? 0,
            completionTokens: response.usage.output_tokens ?? 0,
            totalTokens:
              (response.usage.input_tokens ?? 0) +
              (response.usage.output_tokens ?? 0),
          }
        : undefined,
    };
  }

  async *stream(
    messages: Array<Record<string, unknown>>,
    tools?: Array<Record<string, unknown>>,
    model?: string,
  ): AsyncIterable<LLMResponse> {
    const mapped = mapMessages(messages);
    const body: Record<string, unknown> = {
      model: model ?? this.model,
      messages: mapped.messages,
      max_tokens: this.maxTokens,
      stream: true,
    };
    if (mapped.system) body.system = mapped.system;
    const toolDefs = toAnthropicTools(tools);
    if (toolDefs && toolDefs.length > 0) body.tools = toolDefs;

    const res = await this.requestRaw(body);
    if (!res.body) {
      throw new Error("No response body for streaming");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    const contentBlocks = new Map<
      number,
      { type: "text" | "tool_use"; id: string; name: string; inputJson: string }
    >();
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

        switch (parsed.type) {
          case "message_start": {
            if (parsed.message?.stop_reason) {
              finishReason = parsed.message.stop_reason;
            }
            break;
          }
          case "message_delta": {
            if (parsed.delta?.stop_reason) {
              finishReason = parsed.delta.stop_reason;
            }
            break;
          }
          case "content_block_start": {
            const index = Number(parsed.index ?? 0);
            const block = parsed.content_block ?? {};
            if (block.type === "text") {
              contentBlocks.set(index, {
                type: "text",
                id: "",
                name: "",
                inputJson: "",
              });
              if (typeof block.text === "string" && block.text.length > 0) {
                yield { content: block.text, finishReason: "streaming" };
              }
            } else if (block.type === "tool_use") {
              contentBlocks.set(index, {
                type: "tool_use",
                id: block.id ?? `tool_${index}`,
                name: block.name ?? "",
                inputJson: block.input ? JSON.stringify(block.input) : "",
              });
            }
            break;
          }
          case "content_block_delta": {
            const index = Number(parsed.index ?? 0);
            const delta = parsed.delta ?? {};
            if (delta.type === "text_delta" && typeof delta.text === "string") {
              yield { content: delta.text, finishReason: "streaming" };
            }
            if (
              delta.type === "input_json_delta" &&
              typeof delta.partial_json === "string"
            ) {
              const existing = contentBlocks.get(index);
              if (existing && existing.type === "tool_use") {
                existing.inputJson += delta.partial_json;
              } else {
                contentBlocks.set(index, {
                  type: "tool_use",
                  id: `tool_${index}`,
                  name: "",
                  inputJson: delta.partial_json,
                });
              }
            }
            break;
          }
          case "message_stop": {
            finishReason = finishReason ?? "stop";
            break;
          }
        }
      }
    }

    const toolCalls: ToolCall[] = [];
    for (const block of contentBlocks.values()) {
      if (block.type !== "tool_use") continue;
      toolCalls.push({
        id: block.id || `tool_${toolCalls.length}`,
        name: block.name || "",
        arguments: safeParseArguments(block.inputJson || "{}"),
      });
    }

    if (toolCalls.length > 0) {
      yield {
        content: null,
        toolCalls,
        finishReason: finishReason ?? "tool_calls",
      };
    } else {
      yield { content: null, finishReason: finishReason ?? "stop" };
    }
  }

  private async request(body: Record<string, unknown>): Promise<AnthropicResponse> {
    const res = await this.requestRaw(body);
    const json = (await res.json()) as AnthropicResponse;
    if (!res.ok) {
      throw new Error(`Anthropic error ${res.status}: ${JSON.stringify(json)}`);
    }
    return json;
  }

  private async requestRaw(body: Record<string, unknown>) {
    return fetchWithRetry({
      provider: "Anthropic",
      url: `${this.apiBase}/v1/messages`,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": this.version,
        },
        body: JSON.stringify(body),
      },
      timeoutMs: this.timeoutMs,
      maxRetries: this.maxRetries,
      retryBaseDelayMs: this.retryBaseDelayMs,
      retryMaxDelayMs: this.retryMaxDelayMs,
    });
  }
}
