import { ToolCall } from "./llm";

export function safeParseArguments(raw: string) {
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

export function extractText(content: unknown): string | null {
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

export function normalizeContent(content: unknown): string | null {
  const extracted = extractText(content);
  if (extracted !== null) return extracted;
  if (content === null || content === undefined) return null;
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

export function normalizeToolCalls(
  toolCalls: Array<{ id: string; name: string; arguments: unknown }>,
): ToolCall[] {
  return toolCalls.map((call, index) => ({
    id: call.id || `tool_${index}`,
    name: call.name,
    arguments:
      call.arguments && typeof call.arguments === "object"
        ? (call.arguments as Record<string, unknown>)
        : {},
  }));
}
