import { OpenAIProvider, OpenAIProviderOptions } from "./openai";

export type OpenRouterProviderOptions = OpenAIProviderOptions & {
  referer?: string;
  title?: string;
};

export class OpenRouterProvider extends OpenAIProvider {
  constructor(options: OpenRouterProviderOptions) {
    const extraHeaders: Record<string, string> = { ...(options.extraHeaders ?? {}) };
    if (options.referer) extraHeaders["HTTP-Referer"] = options.referer;
    if (options.title) extraHeaders["X-Title"] = options.title;
    super({
      ...options,
      apiBase: options.apiBase ?? "https://openrouter.ai/api/v1",
      extraHeaders,
    });
  }
}
