export type ProviderErrorCode =
  | "auth"
  | "rate_limit"
  | "timeout"
  | "network"
  | "server"
  | "bad_request"
  | "unknown";

export class ProviderError extends Error {
  provider: string;
  code: ProviderErrorCode;
  status?: number;
  retryable: boolean;

  constructor(options: {
    provider: string;
    code: ProviderErrorCode;
    message: string;
    status?: number;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "ProviderError";
    this.provider = options.provider;
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

type RetryOptions = {
  provider: string;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
};

type FetchWithRetryOptions = RetryOptions & {
  url: string;
  init: RequestInit;
  timeoutMs: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoffMs(
  attempt: number,
  retryBaseDelayMs: number,
  retryMaxDelayMs: number,
) {
  const exp = Math.min(retryMaxDelayMs, retryBaseDelayMs * 2 ** (attempt - 1));
  const jitter = Math.floor(exp * 0.2);
  return exp + jitter;
}

export function classifyHttpStatusError(
  provider: string,
  status: number,
  details?: string,
) {
  const suffix = details ? ` ${details}` : "";
  if (status === 401 || status === 403) {
    return new ProviderError({
      provider,
      code: "auth",
      status,
      retryable: false,
      message: `${provider} authentication failed (${status}).${suffix}`,
    });
  }
  if (status === 429) {
    return new ProviderError({
      provider,
      code: "rate_limit",
      status,
      retryable: true,
      message: `${provider} rate limited (${status}).${suffix}`,
    });
  }
  if (status >= 500) {
    return new ProviderError({
      provider,
      code: "server",
      status,
      retryable: true,
      message: `${provider} server error (${status}).${suffix}`,
    });
  }
  if (status >= 400) {
    return new ProviderError({
      provider,
      code: "bad_request",
      status,
      retryable: false,
      message: `${provider} request failed (${status}).${suffix}`,
    });
  }
  return new ProviderError({
    provider,
    code: "unknown",
    status,
    retryable: false,
    message: `${provider} request failed (${status}).${suffix}`,
  });
}

export function classifyProviderError(provider: string, err: unknown) {
  if (err instanceof ProviderError) return err;
  if (err instanceof DOMException && err.name === "AbortError") {
    return new ProviderError({
      provider,
      code: "timeout",
      retryable: true,
      message: `${provider} request timed out.`,
      cause: err,
    });
  }
  if (err instanceof TypeError) {
    return new ProviderError({
      provider,
      code: "network",
      retryable: true,
      message: `${provider} network error.`,
      cause: err,
    });
  }
  return new ProviderError({
    provider,
    code: "unknown",
    retryable: false,
    message: `${provider} request failed: ${err instanceof Error ? err.message : String(err)}`,
    cause: err,
  });
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const retryBaseDelayMs = options.retryBaseDelayMs ?? 200;
  const retryMaxDelayMs = options.retryMaxDelayMs ?? 2000;
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      return await operation();
    } catch (err) {
      const providerError = classifyProviderError(options.provider, err);
      if (!providerError.retryable || attempt > maxRetries + 1) {
        throw providerError;
      }
      const delayMs = computeBackoffMs(
        attempt,
        retryBaseDelayMs,
        retryMaxDelayMs,
      );
      await sleep(delayMs);
    }
  }
}

export async function fetchWithRetry({
  provider,
  url,
  init,
  timeoutMs,
  maxRetries,
  retryBaseDelayMs,
  retryMaxDelayMs,
}: FetchWithRetryOptions) {
  return withRetry(
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          ...init,
          signal: controller.signal,
        });
        if (!res.ok) {
          let details = "";
          try {
            details = (await res.text()).slice(0, 512);
          } catch {
            // ignore best-effort error body read
          }
          throw classifyHttpStatusError(provider, res.status, details);
        }
        return res;
      } finally {
        clearTimeout(timeout);
      }
    },
    {
      provider,
      maxRetries,
      retryBaseDelayMs,
      retryMaxDelayMs,
    },
  );
}
