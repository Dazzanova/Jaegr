/**
 * Typed provider failure.
 *
 * LLM providers fail for reasons the user can act on (bad key, quota, timeout,
 * transient 5xx). Those must not be reported as an opaque 500 or silently
 * replaced by deterministic fixtures.
 */
export class AgentProviderError extends Error {
  readonly provider: string;
  readonly modelName: string;
  readonly retryable: boolean;

  constructor(input: {
    provider: string;
    modelName: string;
    retryable: boolean;
    message: string;
  }) {
    super(input.message);
    this.name = "AgentProviderError";
    this.provider = input.provider;
    this.modelName = input.modelName;
    this.retryable = input.retryable;
  }
}

/** Removes credentials that may appear in SDK error strings. */
export function sanitizeProviderMessage(error: unknown, maxLength = 800): string {
  const raw = error instanceof Error ? error.message : String(error);
  const cleaned = raw
    .replace(/key=[^&\s"']+/gi, "key=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}…` : cleaned;
}

function readStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if (!("status" in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") return status;
  if (typeof status === "string") {
    const parsed = Number(status);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function isRetryableProviderError(error: unknown): boolean {
  const status = readStatus(error);
  if (status !== undefined) {
    return status === 408 || status === 429 || status >= 500;
  }

  const message = sanitizeProviderMessage(error).toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("econnreset") ||
    message.includes("fetch failed") ||
    message.includes("rate limit")
  );
}
