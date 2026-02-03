# Phase 2 Detailed Plan (Tool System)

Goal: build a complete, safe tool system with base + registry, core tools, and permission gates.

## Deliverables
- Tool base + registry complete
- Filesystem tools: `read_file`, `write_file`, `edit_file`, `list_dir`
- `exec` tool (shell) behind policy gates
- Web tools: `web_search`, `web_fetch`
- Policy enforcement: allowlists + read-only + confirmations

---

## File List (Exact)
Create/Update:
- `src/agent/tools/base.ts` (already)
- `src/agent/tools/registry.ts` (already)
- `src/agent/tools/filesystem.ts` (extend)
- `src/agent/tools/exec.ts` (new)
- `src/agent/tools/web.ts` (new)
- `src/agent/tools/message.ts` (stub)
- `src/agent/tools/spawn.ts` (stub)
- `src/agent/policy.ts` (extend)
- `src/config/index.ts` (policy config already supported)

---

## Step 2.1 — Verify Base + Registry
- Ensure `Tool.toSchema()` matches OpenAI-style function tool schema.
- Ensure `ToolRegistry.execute()` throws if tool is missing.

---

## Step 2.2 — Filesystem Tools
Extend `filesystem.ts`:

### `read_file(path)`
- Already implemented.
- Keep policy gate.

### `list_dir(path)`
- Validate path, policy `canRead`.
- Return list of entries with type (`file`/`dir`).

### `write_file(path, content)`
- Policy `canWrite` + `readOnly` guard.
- Create parent directory if needed.

### `edit_file(path, content | patch)`
- Phase 2 MVP: accept full replacement content.
- Policy `canWrite` + `readOnly` guard.

---

## Step 2.3 — Exec Tool
**File**: `src/agent/tools/exec.ts`

- Accept params: `{ cmd: string }`
- Policy `canExec` + `readOnly` guard
- Return stdout + stderr + exit code
- Enforce a timeout (e.g., 30s)

---

## Step 2.4 — Web Tools
**File**: `src/agent/tools/web.ts`

### `web_search(query)`
- If `webSearch.apiKey` missing → return “not configured”.
- If configured: call Brave API (or stub)

### `web_fetch(url)`
- Fetch raw HTML or text
- Limit size to prevent huge responses

---

## Step 2.5 — Stub Tools
**File**: `src/agent/tools/message.ts`
- Return “not implemented” (placeholder)

**File**: `src/agent/tools/spawn.ts`
- Return “not implemented” (placeholder)

---

## Step 2.6 — Policy Enhancements
Extend `policy.ts`:
- `canWrite(path)` / `assertCanWrite`
- `canExec(cmd)` / `assertCanExec`
- `readOnly` guard
- `confirmWrites`, `confirmExec` hooks (optional callbacks)

---

## Acceptance Criteria
- Tools register and execute via `ToolRegistry`
- `read_file`, `list_dir`, `write_file` respect policy gates
- `exec` blocked when read-only or not in allowlist
- `web_search` / `web_fetch` return useful output or clear “not configured” message

