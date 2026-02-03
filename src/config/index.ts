import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

const ProviderSchema = z.object({
  openrouter: z
    .object({
      apiKey: z.string().optional(),
      apiBase: z.string().optional(),
    })
    .optional(),
  anthropic: z
    .object({
      apiKey: z.string().optional(),
    })
    .optional(),
  openai: z
    .object({
      apiKey: z.string().optional(),
    })
    .optional(),
  vllm: z
    .object({
      apiKey: z.string().optional(),
      apiBase: z.string().optional(),
    })
    .optional(),
});

const AgentsSchema = z.object({
  defaults: z.object({
    model: z.string(),
  }),
});

const ChannelsSchema = z.object({
  telegram: z
    .object({
      enabled: z.boolean(),
      token: z.string().optional(),
      allowedUsers: z.array(z.string()),
    })
    .optional(),
  whatsapp: z
    .object({
      enabled: z.boolean(),
    })
    .optional(),
});

const PolicySchema = z.object({
  readAllowlist: z.array(z.string()).optional(),
  writeAllowlist: z.array(z.string()).optional(),
  execAllowlist: z.array(z.string()).optional(),
  readOnly: z.boolean().optional(),
  confirmWrites: z.boolean().optional(),
  confirmExec: z.boolean().optional(),
});

const WebSearchSchema = z.object({
  apiKey: z.string().optional(),
});

const McpServersSchema = z.record(
  z.object({
    command: z.string(),
    args: z.array(z.string()),
    env: z.record(z.string()),
  }),
);

const ConfigSchema = z.object({
  providers: ProviderSchema.optional(),
  agents: AgentsSchema.optional(),
  channels: ChannelsSchema.optional(),
  policy: PolicySchema.optional(),
  webSearch: WebSearchSchema.optional(),
  mcpServers: McpServersSchema.optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function defaultConfig(): Config {
  return {
    providers: {},
    agents: {
      defaults: { model: "gpt-4o-mini" },
    },
    channels: {},
    policy: {
      readOnly: false,
      confirmWrites: true,
      confirmExec: true,
      readAllowlist: [],
      writeAllowlist: [],
      execAllowlist: [],
    },
    webSearch: {},
    mcpServers: {},
  };
}

function getConfigPath() {
  if (process.env.YANA_CONFIG_PATH) {
    return process.env.YANA_CONFIG_PATH;
  }
  return path.join(os.homedir(), ".yana", "config.json");
}

export function loadConfig(): Config {
  const filePath = getConfigPath();
  if (!fs.existsSync(filePath)) {
    return defaultConfig();
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    throw new Error(`Invalid config: ${issues}`);
  }

  const base = defaultConfig();
  const baseAgentDefaults = base.agents?.defaults ?? { model: "gpt-4o-mini" };
  return {
    ...base,
    ...result.data,
    providers: {
      ...base.providers,
      ...result.data.providers,
    },
    agents: {
      defaults: {
        ...baseAgentDefaults,
        ...result.data.agents?.defaults,
      },
    },
    channels: {
      ...base.channels,
      ...result.data.channels,
    },
    policy: {
      ...base.policy,
      ...result.data.policy,
    },
    webSearch: {
      ...base.webSearch,
      ...result.data.webSearch,
    },
    mcpServers: {
      ...base.mcpServers,
      ...result.data.mcpServers,
    },
  };
}
