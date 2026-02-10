const { OpenAIProvider } = require("../../dist/providers/adapters/openai");
const { ProviderError } = require("../../dist/providers/http");

function toSseResponse(payloadLines) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const line of payloadLines) {
        controller.enqueue(encoder.encode(`data: ${line}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("OpenAIProvider stream/parser", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("normalizes streamed content parts and avoids object stringification", async () => {
    const payloads = [
      JSON.stringify({
        choices: [
          {
            delta: {
              content: [{ type: "output_text", text: "Hello" }],
            },
            finish_reason: null,
          },
        ],
      }),
      JSON.stringify({
        choices: [{ delta: { content: " world" }, finish_reason: null }],
      }),
      "[DONE]",
    ];

    jest.spyOn(global, "fetch").mockResolvedValueOnce(toSseResponse(payloads));

    const provider = new OpenAIProvider({
      apiKey: "test-key",
      apiBase: "https://api.openai.com/v1",
      timeoutMs: 2000,
      maxRetries: 0,
    });

    const chunks = [];
    for await (const chunk of provider.stream([{ role: "user", content: "hi" }])) {
      chunks.push(chunk);
    }

    const text = chunks
      .map((chunk) => (typeof chunk.content === "string" ? chunk.content : ""))
      .join("");
    expect(text).toBe("Hello world");
    expect(text.includes("[object Object]")).toBe(false);
  });

  test("assembles tool call arguments from streaming deltas", async () => {
    const payloads = [
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_1",
                  function: { name: "read_file", arguments: "{\"path\":\"/tmp" },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: "/file.txt\"}" },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      }),
      "[DONE]",
    ];

    jest.spyOn(global, "fetch").mockResolvedValueOnce(toSseResponse(payloads));

    const provider = new OpenAIProvider({
      apiKey: "test-key",
      timeoutMs: 2000,
      maxRetries: 0,
    });

    const chunks = [];
    for await (const chunk of provider.stream([{ role: "user", content: "hi" }])) {
      chunks.push(chunk);
    }

    const final = chunks[chunks.length - 1];
    expect(final.toolCalls).toBeDefined();
    expect(final.toolCalls[0].name).toBe("read_file");
    expect(final.toolCalls[0].arguments).toEqual({ path: "/tmp/file.txt" });
  });
});

describe("OpenAIProvider retry/error handling", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("retries transient server errors and succeeds", async () => {
    const first = new Response("server down", { status: 503 });
    const second = new Response(
      JSON.stringify({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

    const mockFetch = jest.spyOn(global, "fetch");
    mockFetch.mockResolvedValueOnce(first);
    mockFetch.mockResolvedValueOnce(second);

    const provider = new OpenAIProvider({
      apiKey: "test-key",
      timeoutMs: 2000,
      maxRetries: 1,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 2,
    });

    const result = await provider.chat([{ role: "user", content: "hello" }]);
    expect(result.content).toBe("ok");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("throws classified auth error without retry", async () => {
    const mockFetch = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response("bad key", { status: 401 }));

    const provider = new OpenAIProvider({
      apiKey: "test-key",
      timeoutMs: 2000,
      maxRetries: 2,
    });

    let caught;
    try {
      await provider.chat([{ role: "user", content: "hello" }]);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ProviderError);
    expect(caught).toMatchObject({ code: "auth", retryable: false, status: 401 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
