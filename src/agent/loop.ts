import { LLMProvider } from "../providers/llm";
import { ToolRegistry } from "./tools/registry";
import { SessionManager } from "./session";

export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "tool_call"; name: string; arguments: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: string }
  | { type: "tool_error"; name: string; error: string };

export class AgentLoop {
  private maxIterations = 4;

  constructor(
    private provider: LLMProvider,
    private tools: ToolRegistry,
    private sessions: SessionManager,
  ) {}

  async runOnce(sessionKey: string, userContent: string) {
    const session = await this.sessions.getOrCreate(sessionKey);
    const history = session.getHistory().map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: "You are a helpful assistant." },
      ...history,
      { role: "user", content: userContent },
    ];

    let finalContent: string | null = null;
    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration += 1;
      const response = await this.provider.chat(
        messages,
        this.tools.getDefinitions(),
      );

      if (response.toolCalls && response.toolCalls.length > 0) {
        messages.push({
          role: "assistant",
          content: response.content ?? null,
          tool_calls: response.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: {
              name: call.name,
              arguments: JSON.stringify(call.arguments ?? {}),
            },
          })),
        });

        for (const toolCall of response.toolCalls) {
          const result = await this.tools.execute(
            toolCall.name,
            toolCall.arguments,
          );
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolCall.name,
            content: result,
          });
        }
      } else {
        finalContent = response.content ?? "";
        break;
      }
    }

    session.addMessage("user", userContent);
    session.addMessage("assistant", finalContent ?? "");
    await this.sessions.save(session);

    return finalContent ?? "";
  }

  async runOnceStream(
    sessionKey: string,
    userContent: string,
    onDelta: (delta: string) => void,
    onEvent?: (event: AgentEvent) => void,
  ) {
    const session = await this.sessions.getOrCreate(sessionKey);
    const history = session.getHistory().map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: "You are a helpful assistant." },
      ...history,
      { role: "user", content: userContent },
    ];

    let finalContent = "";
    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration += 1;

      if (this.provider.stream) {
        onEvent?.({ type: "status", message: "thinking" });
        let toolCalls = undefined as
          | { id: string; name: string; arguments: Record<string, unknown> }[]
          | undefined;
        let streamedContent = "";

        for await (const chunk of this.provider.stream(
          messages,
          this.tools.getDefinitions(),
        )) {
          if (typeof chunk.content === "string" && chunk.content.length > 0) {
            streamedContent += chunk.content;
            onDelta(chunk.content);
          }
          if (chunk.toolCalls && chunk.toolCalls.length > 0) {
            toolCalls = chunk.toolCalls;
          }
        }

        if (toolCalls && toolCalls.length > 0) {
          for (const toolCall of toolCalls) {
            onEvent?.({
              type: "tool_call",
              name: toolCall.name,
              arguments: toolCall.arguments,
            });
          }

          messages.push({
            role: "assistant",
            content: streamedContent || null,
            tool_calls: toolCalls.map((call) => ({
              id: call.id,
              type: "function",
              function: {
                name: call.name,
                arguments: JSON.stringify(call.arguments ?? {}),
              },
            })),
          });

          for (const toolCall of toolCalls) {
            let result = "";
            try {
              result = await this.tools.execute(
                toolCall.name,
                toolCall.arguments,
              );
              onEvent?.({
                type: "tool_result",
                name: toolCall.name,
                result,
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              onEvent?.({
                type: "tool_error",
                name: toolCall.name,
                error: msg,
              });
              throw err;
            }
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: toolCall.name,
              content: result,
            });
          }

          finalContent = "";
          continue;
        }

        finalContent = streamedContent;
        break;
      } else {
        onEvent?.({ type: "status", message: "thinking" });
        const response = await this.provider.chat(
          messages,
          this.tools.getDefinitions(),
        );

        if (response.toolCalls && response.toolCalls.length > 0) {
          for (const toolCall of response.toolCalls) {
            onEvent?.({
              type: "tool_call",
              name: toolCall.name,
              arguments: toolCall.arguments,
            });
          }

          messages.push({
            role: "assistant",
            content: response.content ?? null,
            tool_calls: response.toolCalls.map((call) => ({
              id: call.id,
              type: "function",
              function: {
                name: call.name,
                arguments: JSON.stringify(call.arguments ?? {}),
              },
            })),
          });

          for (const toolCall of response.toolCalls) {
            let result = "";
            try {
              result = await this.tools.execute(
                toolCall.name,
                toolCall.arguments,
              );
              onEvent?.({
                type: "tool_result",
                name: toolCall.name,
                result,
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              onEvent?.({
                type: "tool_error",
                name: toolCall.name,
                error: msg,
              });
              throw err;
            }
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: toolCall.name,
              content: result,
            });
          }
        } else {
          finalContent = response.content ?? "";
          if (finalContent) onDelta(finalContent);
          break;
        }
      }
    }

    session.addMessage("user", userContent);
    session.addMessage("assistant", finalContent);
    await this.sessions.save(session);

    return finalContent;
  }
}
