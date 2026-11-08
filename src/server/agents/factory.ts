import { AgentAdapter, AgentProviderId } from "./types";
import { DeterministicDemoAdapter } from "./deterministic-adapter";
import { GeminiAgentAdapter } from "./gemini-adapter";
import { GroqAgentAdapter } from "./groq-adapter";

function hasEnvKey(name: string): boolean {
  const value = process.env[name];
  return Boolean(value && value.trim().length > 0);
}

/**
 * Resolves the requested provider to a concrete adapter.
 *
 * The deterministic fallback only happens when the requested provider has no
 * API key. A live-call failure must never be silently replaced by fixtures:
 * it propagates as an AgentProviderError so the caller can report it.
 */
export function createAgentAdapter(preferredProvider: AgentProviderId = "deterministic-demo"): {
  adapter: AgentAdapter;
  provider: AgentProviderId;
  warning?: string;
} {
  if (preferredProvider === "groq") {
    if (hasEnvKey("GROQ_API_KEY")) {
      return {
        adapter: new GroqAgentAdapter(),
        provider: "groq"
      };
    }
    return {
      adapter: new DeterministicDemoAdapter(),
      provider: "deterministic-demo",
      warning: "GROQ_API_KEY is not set. Automatically falling back to Deterministic Demo Mode."
    };
  }

  if (preferredProvider === "gemini") {
    if (hasEnvKey("GEMINI_API_KEY")) {
      return {
        adapter: new GeminiAgentAdapter(),
        provider: "gemini"
      };
    }
    return {
      adapter: new DeterministicDemoAdapter(),
      provider: "deterministic-demo",
      warning: "GEMINI_API_KEY is not set. Automatically falling back to Deterministic Demo Mode."
    };
  }

  return {
    adapter: new DeterministicDemoAdapter(),
    provider: "deterministic-demo"
  };
}
