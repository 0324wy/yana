# YANA Development Plan

## Overview

**Goal**: Build YANA — a local-only, ultra-lightweight personal AI assistant in TypeScript/Node.js.

**Tech Stack**:
- Runtime: Node.js v20+
- Language: TypeScript
- Package Manager: npm
- LLM: Custom wrapper (OpenAI, Anthropic, OpenRouter, vLLM)
- Tool Execution: `child_process` (built-in)

---

## Guiding Principles

- **Vertical slice first**: one full path from CLI → LLM → tool → response before building breadth.
- **Safe by default**: explicit permission gates for file writes and shell execution.
- **Streaming-first**: agent and tools emit events/deltas for responsive UIs.
- **Provider-agnostic**: normalize tool calls and streaming across providers.
- **Local-only**: no remote/cloud deployment; bind any services to loopback.

---

## Project Structure

```
yana/
├── src/
│   ├── agent/           # Core agent logic
│   │   ├── loop.ts      # Agent loop (ReAct pattern)
│   │   ├── context.ts   # System prompt builder
│   │   ├── events.ts    # Streaming/event types
│   │   ├── policy.ts    # Permissions + safety gates
│   │   ├── compaction.ts # Context summarization hooks
│   │   ├── tools/       # Tool implementations
│   │   │   ├── base.ts  # Tool abstract class
│   │   │   ├── registry.ts
│   │   │   ├── filesystem.ts
│   │   │   ├── exec.ts
│   │   │   ├── web.ts
│   │   │   ├── message.ts
│   │   │   └── spawn.ts
│   │   ├── session.ts   # Conversation persistence
│   │   ├── memory.ts    # Long-term memory
│   │   ├── skills.ts    # Skills loader
│   │   └── subagent.ts  # Background task execution
│   ├── bus/             # Message routing
│   │   └── queue.ts     # Async pub/sub
│   ├── providers/       # LLM providers
│   │   ├── llm.ts       # Provider interface + normalization
│   │   └── adapters/    # Concrete provider adapters
│   │       ├── openai.ts
│   │       ├── anthropic.ts
│   │       ├── openrouter.ts
│   │       └── vllm.ts
│   ├── channels/        # Chat integrations
│   │   ├── cli.ts       # Terminal interface
│   │   ├── telegram.ts  # Telegram bot
│   │   └── manager.ts   # Channel manager
│   ├── config/          # Configuration
│   │   └── index.ts     # Config loader
│   ├── cli/             # CLI commands
│   │   └── index.ts     # Node.js CLI entrypoint
│   ├── heartbeat/       # Proactive wake-up
│   │   └── service.ts
│   ├── cron/            # Scheduled tasks
│   │   └── service.ts
│   └── utils/           # Helpers
│       └── fs.ts
├── workspace/           # User workspace (bootstrap files)
│   ├── AGENTS.md
│   ├── SOUL.md
│   ├── USER.md
│   ├── TOOLS.md
│   ├── IDENTITY.md
│   ├── MEMORY.md
│   └── HEARTBEAT.md
├── tests/               # Unit tests
├── package.json
├── tsconfig.json
└── package-lock.json
```

---

## Dependencies

```json
{
  "dependencies": {
    "zod": "^3.22.0",
    "cron-parser": "^4.9.0",
    "date-fns": "^3.0.0",
    "pino": "^8.16.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "jest": "^29.7.0",
    "@types/node": "^20.10.0"
  }
}
```

---

## Phase 0: Vertical Slice (0.5-1 day)

Goal: prove the full path works end-to-end before scaling scope.

- [ ] `npm init -y`
- [ ] Minimal CLI: `yana -m "..."` single-turn response
- [ ] One provider adapter (OpenAI-compatible) with streaming output
- [ ] Tool registry with **one** tool (`read_file`) + policy gate
- [ ] Session save/load (JSONL, append-only)
- [ ] E2E sanity check: prompt → tool call → response

---

## Phase 1: Project Foundation (1 day)

### 1.1 Initialize Project
- [ ] Configure `tsconfig.json`
- [ ] Create `package-lock.json`

### 1.2 Configuration System
**File**: `src/config/index.ts`
- [ ] Define Zod schema for config
- [ ] Load config from `~/.yana/config.json`
- [ ] Support: providers, agents, channels, webSearch, mcpServers

**Config Structure**:
```typescript
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

### 1.3 Logging & Utilities
- [ ] Set up pino logger
- [ ] Create `src/utils/fs.ts` for file operations

---

## Phase 2: Tool System (1-2 days)

### 2.1 Base Tool Class
**File**: `src/agent/tools/base.ts`
```typescript
export abstract class Tool {
  abstract name: string;
  abstract description: string;
  abstract parameters: Record<string, unknown>;
  abstract execute(params: Record<string, unknown>): Promise<string>;
  toSchema() {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}
```

### 2.2 Tool Registry
**File**: `src/agent/tools/registry.ts`
- [ ] `register(tool: Tool)`
- [ ] `unregister(name: string)`
- [ ] `get(name: string): Tool | undefined`
- [ ] `getDefinitions(): array`
- [ ] `execute(name: string, params: object): Promise<string>`

### 2.3 Built-in Tools
| Tool | File | Function |
|------|------|----------|
| `read_file` | filesystem.ts | Read file |
| `write_file` | filesystem.ts | Write file |
| `edit_file` | filesystem.ts | Edit file |
| `list_dir` | filesystem.ts | List directory |
| `exec` | exec.ts | Run shell command |
| `web_search` | web.ts | Web search (Brave API) |
| `web_fetch` | web.ts | Fetch web page |
| `message` | message.ts | Send message |
| `spawn` | spawn.ts | Launch subagent |

### 2.4 Safety & Permissions
- [ ] `policy.ts` with allowlists for paths and commands
- [ ] Read-only mode (deny writes/exec)
- [ ] Confirmation hooks for `exec` + writes
- [ ] Per-tool enable/disable in config

---

## Phase 3: LLM Provider (1 day)

### 3.1 Provider Abstraction
**File**: `src/providers/llm.ts`
```typescript
interface LLMResponse {
  content: string | null;
  toolCalls?: ToolCall[];
  finishReason: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMProvider {
  chat(messages: array, tools?: array, model?: string): Promise<LLMResponse>;
  stream?(messages: array, tools?: array, model?: string): AsyncIterable<LLMResponse>;
}
```

### 3.2 Implementation
- [ ] OpenAI API client (function calling)
- [ ] Anthropic API client (function calling)
- [ ] OpenRouter adapter
- [ ] vLLM/OpenAI-compatible adapter
- [ ] Normalize tool calls into a single internal format
- [ ] Normalize streaming events (text deltas + tool call deltas)

---

## Phase 4: Agent Loop (1-2 days)

### 4.1 Agent Loop Implementation
**File**: `src/agent/loop.ts`
```typescript
export class AgentLoop {
  constructor(
    private provider: LLMProvider,
    private tools: ToolRegistry,
    private workspace: string,
  ) {}
  
  async run(): Promise<void> {
    while (true) {
      const msg = await this.bus.consume();
      const response = await this.processMessage(msg);
      if (response) await this.bus.publish(response);
    }
  }
  
  private async processMessage(msg: InboundMessage): Promise<OutboundMessage | null> {
    const session = this.sessions.getOrCreate(msg.sessionKey);
    const messages = this.buildMessages(session.getHistory(), msg.content);
    
    let iteration = 0;
    let finalContent: string | null = null;
    
    while (iteration < this.maxIterations) {
      iteration++;
      const response = await this.provider.chat(messages, this.tools.getDefinitions());
      
      if (response.toolCalls) {
        for (const toolCall of response.toolCalls) {
          const result = await this.tools.execute(toolCall.name, toolCall.arguments);
          messages.push({
            role: 'tool',
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: result,
          });
        }
      } else {
        finalContent = response.content;
        break;
      }
    }
    
    session.addMessage('user', msg.content);
    session.addMessage('assistant', finalContent);
    this.sessions.save(session);
    
    return new OutboundMessage(msg.channel, msg.chatId, finalContent);
  }
}
```

### 4.2 ReAct Pattern
- [ ] Build context (system prompt + history)
- [ ] Call LLM with tools
- [ ] Parse tool calls
- [ ] Execute tools and append results
- [ ] Repeat until no tool calls
- [ ] Emit streaming events (message/tool start, delta, end)
- [ ] Support steering + follow-up messages (queued)

---

## Phase 5: Context Builder (0.5 day)

**File**: `src/agent/context.ts`
- [ ] Build system prompt from:
  - Core identity ("You are agent...")
  - Bootstrap files (AGENTS.md, SOUL.md, USER.md, TOOLS.md, IDENTITY.md)
  - Memory context (MEMORY.md)
  - Skills summary
- [ ] Build message list: `[system] + [history] + [current]`
- [ ] Handle image attachments (base64)
- [ ] Inject compaction summaries when history grows

---

## Phase 6: Session Management (0.5 day)

**File**: `src/agent/session.ts`
- [ ] `Session` class: key, messages, createdAt, updatedAt
- [ ] `SessionManager`:
  - `getOrCreate(key)`: Load or create session
  - `save(session)`: Persist to JSONL
  - `getHistory(maxMessages)`: Retrieve history
- [ ] Store at `~/.yana/sessions/`
- [ ] Session tree with `id` + `parentId` (branching)
- [ ] Compaction metadata (summary nodes)

---

## Phase 7: Message Bus (0.5 day)

**File**: `src/bus/queue.ts`
- [ ] `MessageBus` class
- [ ] `publishInbound(msg)`: Channel → agent
- [ ] `consumeInbound()`: Agent receives
- [ ] `publishOutbound(msg)`: Agent → channel
- [ ] `consumeOutbound()`: Channel receives
- [ ] `subscribeOutbound(channel, callback)`
- [ ] Use `AsyncQueue` (or a minimal in-memory queue)
- [ ] Support priority queue for steering messages

---

## Phase 8: Channels (2 days)

### 8.1 CLI Channel
**File**: `src/channels/cli.ts`
- [ ] `yana -m "..."`: Single message
- [ ] Interactive mode (readline)
- [ ] Display responses
- [ ] Render policy confirmations (exec/write approvals)

### 8.2 Telegram Channel
**File**: `src/channels/telegram.ts`
- [ ] Use `grammY` or `node-telegram-bot-api`
- [ ] Webhook or polling
- [ ] Handle text messages

### 8.3 Channel Manager
**File**: `src/channels/manager.ts`
- [ ] Load enabled channels from config
- [ ] Start/stop all channels
- [ ] Route messages through bus

---

## Phase 9: Advanced Features (2 days)

### 9.1 Heartbeat Service
**File**: `src/heartbeat/service.ts`
- [ ] Run every 30 minutes (configurable)
- [ ] Read `HEARTBEAT.md`
- [ ] Wake agent for tasks

### 9.2 Cron Service
**File**: `src/cron/service.ts`
- [ ] Use `cron-parser`
- [ ] Commands: add, list, remove
- [ ] Send scheduled messages to agent

### 9.3 Subagent Manager
**File**: `src/agent/subagent.ts`
- [ ] Spawn background tasks
- [ ] Execute with limited iterations
- [ ] Announce results back to main agent

### 9.4 Skills System
**File**: `src/agent/skills.ts`
- [ ] Load markdown skills from `workspace/skills/`
- [ ] Build skills summary
- [ ] Load full skill on-demand

---

## Phase 10: CLI Interface (1 day)

**File**: `src/cli/index.ts`
- [ ] `onboard`: Initialize config and workspace
- [ ] `yana -m "..."`: Chat with agent
- [ ] `yana`: Interactive mode
- [ ] `daemon`: Start local message daemon (loopback only)
- [ ] `status`: Show system status
- [ ] `channels login/status`: WhatsApp/Telegram

**Workspace Templates**:
- [ ] Create AGENTS.md, SOUL.md, USER.md, TOOLS.md, IDENTITY.md
- [ ] Create MEMORY.md, HEARTBEAT.md

---

## Phase 11: Testing & Documentation (1 day)

- [ ] Unit tests for each component
- [ ] Integration tests for agent loop
- [ ] E2E test: CLI → tool → response
- [ ] README.md with quick start
- [ ] Architecture documentation

---

## Optional Low-Priority Features

| Feature | Description | When |
|---------|-------------|------|
| **Advanced Streaming** | Token accounting, backpressure, UI polish | Phase 12 |
| **MCP Client** | Connect to MCP servers | Phase 12 |
| **Sandboxing** | Docker/container isolation | Phase 12 |
| **Multi-user** | Authentication, rate limiting | Phase 12 |
| **Plan/Build Agents** | Read-only analysis vs full-access agent | Phase 12 |

---

## Estimated Timeline

| Phase | Duration |
|-------|----------|
| Phase 0: Vertical Slice | 0.5-1 day |
| Phase 1: Foundation | 1 day |
| Phase 2: Tools | 1-2 days |
| Phase 3: LLM Provider | 1 day |
| Phase 4: Agent Loop | 1-2 days |
| Phase 5: Context | 0.5 day |
| Phase 6: Session | 0.5 day |
| Phase 7: Message Bus | 0.5 day |
| Phase 8: Channels | 2 days |
| Phase 9: Advanced | 2 days |
| Phase 10: CLI | 1 day |
| Phase 11: Testing | 1 day |
| **Total** | **~13-15 days** |

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | Node.js | Stable, widely compatible |
| Framework | None (bare Node.js) | Ultra-lightweight, total control |
| LLM | Custom wrapper | Minimal deps, flexible |
| Tool Execution | child_process | Built-in, no Docker dep |
| Session Storage | JSONL (tree) | Simple, human-readable, supports branching |
| Message Bus | AsyncQueue | Decoupled, simple |
| Validation | Zod | Type-safe, lightweight |
| Permissions | Allowlist + confirm gates | Safe by default for local use |
| Streaming | Event-based | Responsive CLI + future UI support |
| Deployment | Local-only | No remote/cloud mode |

---

## Architecture Diagram

```
                          CLI / Channels                    
                    (Terminal, Telegram, WhatsApp)                    
                          │
                          ▼
                        Message Bus                    
                    (Async pub/sub queue)                    
                          │
                          ▼
                        Agent Loop                    
  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   
  │   Context   │  │    Tool     │  │  LLM Provider   │   
  │   Builder   │  │  Registry   │  │  (Custom)       │   
  └─────────────┘  └─────────────┘  └─────────────────┘   
         │               │                  │             
         ▼               ▼                  ▼             
  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   
  │   Session   │  │   Skills    │  │  LLM (Claude,   │   
  │   Manager   │  │   Loader    │  │  GPT-4, etc.)   │   
  └─────────────┘  └─────────────┘  └─────────────────┘   
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │Heartbeat │   │   Cron   │   │ Channels │
    │ Service  │   │ Service  │   │ Manager  │
    └──────────┘   └──────────┘   └──────────┘
```

---

## Security Note

**Local-only.** No remote/cloud deployment. Any services must bind to loopback.

**No sandboxing by default** — runs directly on host:
- `exec` tool runs shell commands
- File tools access user directory
- Suitable for personal use only
- Provide read-only mode + confirm gates for `exec` and writes

If sandboxing needed later:
- Docker subprocess wrapper
- bubblewrap (Linux)
- seccomp syscalls filter

---

## Files to Create (Summary)

```
src/
├── config/index.ts
├── agent/
│   ├── loop.ts
│   ├── context.ts
│   ├── events.ts
│   ├── policy.ts
│   ├── compaction.ts
│   ├── session.ts
│   ├── memory.ts
│   ├── skills.ts
│   ├── subagent.ts
│   └── tools/
│       ├── base.ts
│       ├── registry.ts
│       ├── filesystem.ts
│       ├── exec.ts
│       ├── web.ts
│       ├── message.ts
│       └── spawn.ts
├── bus/queue.ts
├── providers/llm.ts
├── providers/adapters/
│   ├── openai.ts
│   ├── anthropic.ts
│   ├── openrouter.ts
│   └── vllm.ts
├── channels/
│   ├── cli.ts
│   ├── telegram.ts
│   └── manager.ts
├── heartbeat/service.ts
├── cron/service.ts
├── cli/index.ts
└── utils/fs.ts
workspace/
├── AGENTS.md
├── SOUL.md
├── USER.md
├── TOOLS.md
├── IDENTITY.md
├── MEMORY.md
└── HEARTBEAT.md
```
