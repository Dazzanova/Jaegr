import { NextResponse } from "next/server";
import { AGENT_PROFILES } from "@/server/agents/types";
import { DEFAULT_GROQ_MODEL } from "@/server/agents/groq-adapter";

function hasEnvKey(name: string): boolean {
  const value = process.env[name];
  return Boolean(value && value.trim().length > 0);
}

export async function GET() {
  const hasGroqKey = hasEnvKey("GROQ_API_KEY");
  const hasGeminiKey = hasEnvKey("GEMINI_API_KEY");
  const groqModel = process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;

  return NextResponse.json({
    profiles: AGENT_PROFILES,
    providers: [
      {
        id: "deterministic-demo",
        name: "Deterministic Simulation (Offline/Demo Mode)",
        available: true,
        description: "Zero external network calls or credentials. Reliable reproducible security evaluation."
      },
      {
        id: "groq",
        name: `Groq (${groqModel})`,
        available: hasGroqKey,
        description: hasGroqKey
          ? "Live AI model integration via Groq's OpenAI-compatible API. Generous free-tier per-minute limits."
          : "Unavailable: GROQ_API_KEY is not configured in environment variables."
      },
      {
        id: "gemini",
        name: "Google Gemini (gemini-3.6-flash)",
        available: hasGeminiKey,
        description: hasGeminiKey
          ? "Live AI model integration using official Google GenAI SDK. Free tier limited to 20 requests/day."
          : "Unavailable: GEMINI_API_KEY is not configured in environment variables."
      }
    ],
    groqConfigured: hasGroqKey,
    groqModel,
    geminiConfigured: hasGeminiKey
  });
}
