const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { AgentLoop } = require("../../dist/agent/loop");
const { ToolRegistry } = require("../../dist/agent/tools/registry");
const { SessionManager } = require("../../dist/agent/session");

describe("AgentLoop runOnceStream", () => {
  test("streams assistant text from provider and saves session", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "yana-phase3-"));

    const mockProvider = {
      async chat() {
        return { content: "fallback", finishReason: "stop" };
      },
      async *stream() {
        yield { content: "Hi", finishReason: "streaming" };
        yield { content: " there", finishReason: "streaming" };
        yield { content: null, finishReason: "stop" };
      },
    };

    const loop = new AgentLoop(
      mockProvider,
      new ToolRegistry(),
      new SessionManager(tempDir),
    );

    const deltas = [];
    const events = [];
    const final = await loop.runOnceStream(
      "phase3-smoke",
      "hello",
      (delta) => deltas.push(delta),
      (event) => events.push(event),
    );

    expect(deltas.join("")).toBe("Hi there");
    expect(final).toBe("Hi there");
    expect(events[0]).toMatchObject({ type: "status" });

    const saved = await fs.readFile(path.join(tempDir, "phase3-smoke.jsonl"), "utf8");
    expect(saved.includes("\"role\":\"user\"")).toBe(true);
    expect(saved.includes("\"role\":\"assistant\"")).toBe(true);
  });
});
