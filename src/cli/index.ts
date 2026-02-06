#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { AgentLoop } from "../agent/loop";
import { SessionManager } from "../agent/session";
import { Policy } from "../agent/policy";
import { ToolRegistry } from "../agent/tools/registry";
import {
  EditFileTool,
  ListDirTool,
  ReadFileTool,
  WriteFileTool,
} from "../agent/tools/filesystem";
import { ExecTool } from "../agent/tools/exec";
import { MessageTool } from "../agent/tools/message";
import { SpawnTool } from "../agent/tools/spawn";
import { WebFetchTool, WebSearchTool } from "../agent/tools/web";
import { OpenAIProvider } from "../providers/adapters/openai";
import { runTui } from "../channels/tui";
import { loadConfig } from "../config";
import { createLogger } from "../utils/logger";

function parseArgs(argv: string[]) {
  const args = { message: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === "-m" || arg === "--message") && argv[i + 1]) {
      args.message = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function loadDotEnv(filePath = path.join(process.cwd(), ".env")) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function main() {
  const logger = createLogger();
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const createLoop = () => {
    const provider = new OpenAIProvider({
      apiKey: process.env.OPENAI_API_KEY ?? config.providers?.openai?.apiKey,
      apiBase:
        process.env.OPENAI_API_BASE ??
        config.providers?.openrouter?.apiBase,
      model:
        process.env.OPENAI_MODEL ??
        config.agents?.defaults?.model ??
        "gpt-4o-mini",
    });

    const policy = new Policy({
      readAllowlist:
        config.policy?.readAllowlist && config.policy.readAllowlist.length > 0
          ? config.policy.readAllowlist
          : [process.cwd()],
      writeAllowlist: config.policy?.writeAllowlist ?? [],
      execAllowlist: config.policy?.execAllowlist ?? [],
      readOnly: config.policy?.readOnly ?? false,
    });

    const tools = new ToolRegistry();
    tools.register(new ReadFileTool(policy));
    tools.register(new ListDirTool(policy));
    tools.register(new WriteFileTool(policy));
    tools.register(new EditFileTool(policy));
    tools.register(new ExecTool(policy));
    tools.register(new WebSearchTool(config.webSearch?.apiKey));
    tools.register(new WebFetchTool());
    tools.register(new MessageTool());
    tools.register(new SpawnTool());

    const sessions = new SessionManager();
    return new AgentLoop(provider, tools, sessions);
  };

  if (args.message) {
    const loop = createLoop();
    const content = await loop.runOnce("default", args.message);
    process.stdout.write(content + "\n");
    return;
  }

  logger.info("Starting TUI...");
  await runTui(createLoop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
