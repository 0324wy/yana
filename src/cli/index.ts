#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { AgentLoop } from "../agent/loop";
import { SessionManager } from "../agent/session";
import { Policy } from "../agent/policy";
import { ToolRegistry } from "../agent/tools/registry";
import { ReadFileTool } from "../agent/tools/filesystem";
import { OpenAIProvider } from "../providers/adapters/openai";

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
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  if (!args.message) {
    console.error("Usage: yana -m \"your message\"");
    process.exit(1);
  }

  const provider = new OpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY,
    apiBase: process.env.OPENAI_API_BASE,
    model: process.env.OPENAI_MODEL,
  });

  const policy = new Policy({
    readAllowlist: [process.cwd()],
  });

  const tools = new ToolRegistry();
  tools.register(new ReadFileTool(policy));

  const sessions = new SessionManager();
  const loop = new AgentLoop(provider, tools, sessions);

  const content = await loop.runOnce("default", args.message);
  process.stdout.write(content + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
