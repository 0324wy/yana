# Phase 3 Detailed Plan (LLM Providers)

Goal: add multi-provider support with consistent chat/stream/tool-call handling, and a clear provider selection mechanism.

## Deliverables
- Provider selection factory (config + env)
- Hardened OpenAI-compatible adapter (content normalization + tool call assembly)
- Anthropic adapter with tools + streaming
- OpenRouter adapter (OpenAI-compatible)
- vLLM adapter (OpenAI-compatible)
- Shared normalization utilities (content, tool calls, streaming)
- Retry/backoff + error classification
- Tests for parsing and streaming

---

## File List (Exact)
Create/Update:
- `src/providers/llm.ts`
- `src/providers/factory.ts`
- `src/providers/adapters/openai.ts`
- `src/providers/adapters/anthropic.ts`
- `src/providers/adapters/openrouter.ts`
- `src/providers/adapters/vllm.ts`
- `src/config/index.ts`
- `src/cli/index.ts`
- `tests/providers/*.test.ts`

---

## Step 3.1 — Provider Selection
- Add a single source of truth for provider selection:
  - Option A: `agents.defaults.provider` (preferred)
  - Option B: `providers.default`
- Implement `ProviderFactory.create(config, env)`:
  - Validate required API keys and bases
  - Map provider name → adapter
  - Support env overrides:
    - `OPENAI_API_KEY`, `OPENAI_API_BASE`
    - `OPENROUTER_API_KEY`, `OPENROUTER_API_BASE`
    - `ANTHROPIC_API_KEY`
    - `VLLM_API_KEY`, `VLLM_API_BASE`
  - Return clear errors if missing/invalid config

---

## Step 3.2 — Shared Normalization Utilities
- Normalize content to string:
  - String content
  - Arrays of content parts (merge text fields)
  - Object payloads (extract `.text` or `.content`, else JSON string)
- Normalize tool calls into `ToolCall`:
  - Assemble streamed tool call deltas into complete calls
  - Validate tool call payloads (must be object arguments)
- Normalize streaming:
  - Emit text deltas only
  - Emit final tool call list if present
  - Preserve finish reasons

---

## Step 3.3 — OpenAI Adapter (Harden)
- Validate SSE parsing and stop conditions
- Handle content parts and tool-call deltas robustly
- Support `function_call` fallback (legacy)
- Respect timeout and max buffer limits

---

## Step 3.4 — Anthropic Adapter (New)
- Implement Claude Messages API
- Map tools to Anthropic tool schema
- Parse tool-use blocks into internal `ToolCall`
- Support streaming with text deltas + tool-use assembly

---

## Step 3.5 — OpenRouter Adapter (New)
- OpenAI-compatible adapter with custom `apiBase`
- Optional headers (`HTTP-Referer`, `X-Title`) if configured
- Same normalization behavior as OpenAI adapter

---

## Step 3.6 — vLLM Adapter (New)
- OpenAI-compatible adapter using `apiBase`
- Optional API key support
- Same normalization behavior as OpenAI adapter

---

## Step 3.7 — Tests
- Unit tests for:
  - Content normalization (string, parts, objects)
  - Tool-call assembly from deltas
  - Streaming parser behavior
- Smoke test for `runOnceStream` with a mocked provider

---

## Acceptance Criteria
- Provider can be selected via config or env
- Each adapter returns unified `LLMResponse`
- Tool calls execute correctly from all providers
- Streaming never renders `[object Object]`
- CLI runs with any configured provider
