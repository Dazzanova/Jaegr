import { NextResponse } from "next/server";
import { AGENT_PROFILES } from "@/server/agents/types";

export async function GET() {
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);

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
        id: "gemini",
        name: "Google Gemini (gemini-3.8-flash)",
        available: hasGeminiKey,
        description: hasGeminiKey
          ? "Live AI model integration using official Google GenAI SDK."
          : "Unavailable: GEMINI_API_KEY is not configured in environment variables."
      }
    ],
    geminiConfigured: hasGeminiKey
  });
}
