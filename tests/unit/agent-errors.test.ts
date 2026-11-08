import { describe, expect, it } from "vitest";
import {
  AgentProviderError,
  isRetryableProviderError,
  sanitizeProviderMessage
} from "@/server/agents/errors";

describe("provider error helpers", () => {
  it("redacts API keys and bearer tokens from provider messages", () => {
    const message = sanitizeProviderMessage(
      new Error('request failed: https://api.example.com?key=abc123&x=1 Authorization: Bearer secretToken')
    );
    expect(message).not.toContain("abc123");
    expect(message).not.toContain("secretToken");
    expect(message).toContain("key=[redacted]");
  });

  it("classifies rate limits and 5xx as retryable", () => {
    expect(isRetryableProviderError(Object.assign(new Error("quota"), { status: 429 }))).toBe(true);
    expect(isRetryableProviderError(Object.assign(new Error("boom"), { status: 503 }))).toBe(true);
    expect(isRetryableProviderError(new Error("fetch failed"))).toBe(true);
    expect(isRetryableProviderError(Object.assign(new Error("bad request"), { status: 400 }))).toBe(false);
  });

  it("keeps provider identity on the typed error", () => {
    const error = new AgentProviderError({
      provider: "gemini",
      modelName: "gemini-3.6-flash",
      retryable: true,
      message: "Gemini request failed: timeout"
    });
    expect(error.name).toBe("AgentProviderError");
    expect(error.provider).toBe("gemini");
    expect(error.modelName).toBe("gemini-3.6-flash");
    expect(error.retryable).toBe(true);
  });
});
