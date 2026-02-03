# Phase 1 Detailed Plan (Project Foundation)

Goal: establish configuration, logging, and core utilities that the rest of the system relies on.

## Deliverables
- `tsconfig.json` configured for Node 20+ (already done)
- `package-lock.json` created (already done)
- Config system with validation + loading from `~/.yana/config.json`
- Logger setup via `pino`
- File utility helpers in `src/utils/fs.ts`

---

## File List (Exact)
Create:
- `src/config/index.ts`
- `src/utils/fs.ts`
- `src/utils/logger.ts` (optional but recommended to centralize pino)

Update:
- `package.json` (scripts if needed)
- `src/cli/index.ts` (wire config + logger if desired)

---

## 1.1 Initialize Project (verify)
- [x] `tsconfig.json` exists with Node 20 settings
- [x] `package-lock.json` exists

---

## 1.2 Configuration System
**File**: `src/config/index.ts`

### Schema (Zod)
- Create a Zod schema that matches the plan:

```ts
{
  providers: {
    openrouter?: { apiKey?: string; apiBase?: string },
    anthropic?: { apiKey?: string },
    openai?: { apiKey?: string },
    vllm?: { apiKey?: string; apiBase?: string },
  },
  agents: { defaults: { model: string } },
  channels: {
    telegram?: { enabled: boolean; token?: string; allowedUsers: string[] },
    whatsapp?: { enabled: boolean },
  },
  policy: {
    readAllowlist?: string[];
    writeAllowlist?: string[];
    execAllowlist?: string[];
    readOnly?: boolean;
    confirmWrites?: boolean;
    confirmExec?: boolean;
  },
  webSearch: { apiKey?: string },
  mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }>,
}
```

### Loader
- Load JSON from `~/.yana/config.json` if it exists.
- Support `YANA_CONFIG_PATH` to override location.
- Merge with defaults (safe defaults for missing sections).
- Return typed config object.

### Exports
- `type Config`
- `loadConfig(): Config`
- `defaultConfig(): Config` (optional helper)

---

## 1.3 Logging & Utilities

### Logger (pino)
**File**: `src/utils/logger.ts`
- Create a `createLogger()` that returns a configured pino instance.
- Basic config: pretty printing in dev (optional), `info` level by default.
- Option: read `YANA_LOG_LEVEL` env var.

### File Utilities
**File**: `src/utils/fs.ts`
- `readText(filePath: string): Promise<string>`
- `writeText(filePath: string, content: string): Promise<void>`
- `exists(filePath: string): Promise<boolean>`
- `ensureDir(dirPath: string): Promise<void>`

---

## Integration (Optional for Phase 1)
- Use `loadConfig()` in CLI startup to initialize providers/policy defaults.
- Use logger in CLI and agent loop (not required for MVP but recommended).

---

## Acceptance Criteria
- Config file can be loaded/validated from `~/.yana/config.json`.
- Missing config sections fall back to defaults without crashing.
- Logger can be imported and used by CLI/agent.
- `src/utils/fs.ts` provides basic file helpers.

