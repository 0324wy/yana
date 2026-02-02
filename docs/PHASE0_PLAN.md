# Phase 0 Detailed Plan (Vertical Slice)

Goal: prove the full path works end‑to‑end before scaling scope: CLI → LLM → tool → response.

## Deliverables
- Minimal CLI: `yana -m "..."` single‑turn response
- One provider adapter (OpenAI‑compatible) with streaming output
- Tool registry with **one** tool (`read_file`) + policy gate
- Session save/load (JSONL, append‑only)
- E2E sanity check: prompt → tool call → response

---

## File List (Exact)
Create:
- `src/cli/index.ts`
- `src/providers/llm.ts`
- `src/providers/adapters/openai.ts`
- `src/agent/tools/base.ts`
- `src/agent/tools/registry.ts`
- `src/agent/tools/filesystem.ts`
- `src/agent/policy.ts`
- `src/agent/session.ts`
- `src/agent/loop.ts`
- `src/utils/fs.ts`
- `tsconfig.json`

Update:
- `package.json` (already started)

Optional (if you want minimal configs now):
- `.gitignore`

---

## Implementation Steps (Exact)

### 1) TypeScript scaffold
1. Create `tsconfig.json` for Node 20 + CommonJS output:
   - `target: ES2022`, `module: CommonJS`, `outDir: dist`, `rootDir: src`, `declaration: true`.
2. Add `src/` folder structure as needed.

### 2) Provider abstraction
1. `src/providers/llm.ts`
   - Define `ToolCall` and `LLMResponse` types.
   - Define `LLMProvider` interface with `chat()` and optional `stream()`.

### 3) OpenAI‑compatible adapter (streaming)
1. `src/providers/adapters/openai.ts`
   - Implement `OpenAIProvider` with `chat()` and `stream()`.
   - Use fetch to call OpenAI‑compatible `/v1/chat/completions`.
   - `stream()` returns an `AsyncIterable` of deltas (`content` + tool call deltas).
   - Normalize tool calls into `{ id, name, arguments }`.
   - Config for base URL + API key via env (e.g., `OPENAI_API_BASE`, `OPENAI_API_KEY`).

### 4) Tool system (base + registry)
1. `src/agent/tools/base.ts`
   - Abstract class with `name`, `description`, `parameters`, `execute()`.
   - `toSchema()` for LLM function definitions.
2. `src/agent/tools/registry.ts`
   - `register`, `unregister`, `get`, `getDefinitions`, `execute`.
   - `execute` should throw if tool missing.

### 5) Policy gate + read_file tool
1. `src/agent/policy.ts`
   - Allowlist for readable paths.
   - `canRead(path: string): boolean` and `assertCanRead(path)`.
2. `src/agent/tools/filesystem.ts`
   - `read_file` tool only (Phase 0 scope).
   - Validate input path, pass through policy gate, then read file.

### 6) Session persistence (JSONL)
1. `src/agent/session.ts`
   - `Session` with messages array, `addMessage(role, content)`.
   - `SessionManager` with:
     - `getOrCreate(key)`
     - `save(session)` → append JSONL to `~/.yana/sessions/{key}.jsonl`
     - `load(key)` → read JSONL and rebuild messages

### 7) Agent loop (minimal)
1. `src/agent/loop.ts`
   - Single‑turn, minimal loop:
     - Build messages: `[system, history, user]` (system can be minimal placeholder).
     - Call provider with tool definitions.
     - If tool calls returned → execute tool(s), append tool results, call provider again.
     - Return final content.

### 8) CLI entrypoint
1. `src/cli/index.ts`
   - Parse `-m` / `--message`.
   - Instantiate:
     - `OpenAIProvider`
     - `ToolRegistry` + register `read_file`
     - `SessionManager`
     - `AgentLoop`
   - Send single message, print response.

### 9) E2E sanity check
1. Prepare a local file in workspace (e.g., `README.md`).
2. Run:
   - `npm run build`
   - `node dist/cli/index.js -m "Read README.md"`
3. Verify:
   - Tool call executed
   - Response includes file contents or summary
   - Session JSONL appended

---

## Acceptance Criteria
- `yana -m "..."` returns a response without crashes.
- Tool call for `read_file` works with policy gate enabled.
- Session JSONL is created and appended.
- Streaming adapter compiles and can be used (even if CLI uses non‑streaming initially).

