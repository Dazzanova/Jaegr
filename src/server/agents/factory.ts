import { AgentAdapter } from "./types";
import { DeterministicDemoAdapter } from "./deterministic-adapter";
import { GeminiAgentAdapter } from "./gemini-adapter";

export function createAgentAdapter(preferredProvider: "gemini" | "deterministic-demo" = "deterministic-demo"): {
  adapter: AgentAdapter;
  provider: "gemini" | "deterministic-demo";
  warning?: string;
} {
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);

  if (preferredProvider === "gemini") {
    if (hasGeminiKey) {
      return {
        adapter: new GeminiAgentAdapter(),
        provider: "gemini"
      };
    } else {
      return {
        adapter: new DeterministicDemoAdapter(),
        provider: "deterministic-demo",
        warning: "GEMINI_API_KEY is not set. Automatically falling back to Deterministic Demo Mode."
      };
    }
  }

  return {
    adapter: new DeterministicDemoAdapter(),
    provider: "deterministic-demo"
  };
}
