import { Config } from "../config";
import { AnthropicProvider } from "./adapters/anthropic";
import { OpenAIProvider } from "./adapters/openai";
import { OpenRouterProvider } from "./adapters/openrouter";
import { LLMProvider } from "./llm";

export type ProviderName = "openai" | "openrouter" | "anthropic";

function parseEnvNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeProviderName(name?: string): ProviderName | null {
  if (!name) return null;
  const normalized = name.toLowerCase().trim();
  if (normalized === "openai") return "openai";
  if (normalized === "openrouter") return "openrouter";
  if (normalized === "anthropic") return "anthropic";
  return null;
}

function resolveProviderName(config: Config, env: NodeJS.ProcessEnv): ProviderName {
  const fromConfig = normalizeProviderName(
    config.agents?.defaults?.provider ?? config.providers?.default,
  );
  if (fromConfig) return fromConfig;

  if (env.OPENAI_API_KEY || config.providers?.openai?.apiKey) return "openai";
  if (env.OPENROUTER_API_KEY || config.providers?.openrouter?.apiKey) {
    return "openrouter";
  }
  if (env.ANTHROPIC_API_KEY || config.providers?.anthropic?.apiKey) {
    return "anthropic";
  }

  throw new Error(
    "No provider configured. Set agents.defaults.provider or providers.default, or configure an API key.",
  );
}

export class ProviderFactory {
  static create(
    config: Config,
    env: NodeJS.ProcessEnv = process.env,
  ): { provider: LLMProvider; name: ProviderName } {
    const name = resolveProviderName(config, env);
    const maxRetries = parseEnvNumber(env.YANA_PROVIDER_MAX_RETRIES, 2);
    const retryBaseDelayMs = parseEnvNumber(
      env.YANA_PROVIDER_RETRY_BASE_MS,
      200,
    );
    const retryMaxDelayMs = parseEnvNumber(
      env.YANA_PROVIDER_RETRY_MAX_MS,
      2000,
    );

    if (name === "openai") {
      const apiKey = env.OPENAI_API_KEY ?? config.providers?.openai?.apiKey;
      if (!apiKey) {
        throw new Error("Missing OpenAI API key. Set OPENAI_API_KEY or providers.openai.apiKey.");
      }
      const apiBase = env.OPENAI_API_BASE ?? config.providers?.openai?.apiBase;
      const model = env.OPENAI_MODEL ?? config.agents?.defaults?.model;
      return {
        name,
        provider: new OpenAIProvider({
          apiKey,
          apiBase,
          model,
          maxRetries,
          retryBaseDelayMs,
          retryMaxDelayMs,
        }),
      };
    }

    if (name === "openrouter") {
      const apiKey = env.OPENROUTER_API_KEY ?? config.providers?.openrouter?.apiKey;
      if (!apiKey) {
        throw new Error(
          "Missing OpenRouter API key. Set OPENROUTER_API_KEY or providers.openrouter.apiKey.",
        );
      }
      const apiBase =
        env.OPENROUTER_API_BASE ?? config.providers?.openrouter?.apiBase;
      const model =
        env.OPENROUTER_MODEL ??
        env.OPENAI_MODEL ??
        config.agents?.defaults?.model;
      const referer =
        env.OPENROUTER_REFERER ?? config.providers?.openrouter?.referer;
      const title = env.OPENROUTER_TITLE ?? config.providers?.openrouter?.title;
      return {
        name,
        provider: new OpenRouterProvider({
          apiKey,
          apiBase,
          model,
          maxRetries,
          retryBaseDelayMs,
          retryMaxDelayMs,
          referer,
          title,
        }),
      };
    }

    const apiKey = env.ANTHROPIC_API_KEY ?? config.providers?.anthropic?.apiKey;
    if (!apiKey) {
      throw new Error(
        "Missing Anthropic API key. Set ANTHROPIC_API_KEY or providers.anthropic.apiKey.",
      );
    }
    const apiBase = env.ANTHROPIC_API_BASE ?? config.providers?.anthropic?.apiBase;
    const model = env.ANTHROPIC_MODEL ?? config.agents?.defaults?.model;
    return {
      name,
      provider: new AnthropicProvider({
        apiKey,
        apiBase,
        model,
        maxRetries,
        retryBaseDelayMs,
        retryMaxDelayMs,
      }),
    };
  }
}
