import { GoogleGenAI } from "@google/genai";
import type { GoogleGenAIInteraction } from "@google/genai";
import { actionProposalSchema } from "@/domain/actions/proposal";
import { AgentAdapter, AgentInput, AgentExecutionOutput } from "./types";
import {
  AgentProviderError,
  isRetryableProviderError,
  sanitizeProviderMessage
} from "./errors";
import { buildActionProposalPrompt, buildSystemInstruction } from "./prompt";

/** Bounds a single model call so a stalled provider cannot hang a request. */
const GEMINI_TIMEOUT_MS = 45_000;

export class GeminiAgentAdapter implements AgentAdapter {
  private apiKey: string;
  private modelName: string;

  constructor(apiKey?: string, modelName = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash") {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY is not configured in the environment.");
    }
    this.apiKey = key;
    this.modelName = modelName;
  }

  async execute(input: AgentInput): Promise<AgentExecutionOutput> {
    // The Interactions API requires v1beta for JSON response formatting.
    const ai = new GoogleGenAI({
      apiKey: this.apiKey,
      httpOptions: { apiVersion: "v1beta" }
    });
    const start = performance.now();

    const systemInstruction = buildSystemInstruction(input.profileType);
    const prompt = buildActionProposalPrompt(input);

    // Gemini 3.x models (including gemini-3.6-flash) are served through the
    // Interactions API. `generateContent` is deprecated for these models.
    let response: GoogleGenAIInteraction;
    try {
      response = await ai.interactions.create(
        {
          model: this.modelName,
          input: prompt,
          system_instruction: systemInstruction,
          response_format: { type: "text", mime_type: "application/json" },
          // Do not retain untrusted prompt content server-side.
          store: false
        },
        { timeout_ms: GEMINI_TIMEOUT_MS }
      );
    } catch (error: unknown) {
      throw new AgentProviderError({
        provider: "gemini",
        modelName: this.modelName,
        retryable: isRetryableProviderError(error),
        message: `Gemini request failed: ${sanitizeProviderMessage(error)}`
      });
    }

    const elapsed = Math.round(performance.now() - start);
    const rawText = response.output_text || "{}";

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      throw new AgentProviderError({
        provider: "gemini",
        modelName: this.modelName,
        retryable: true,
        message: `Gemini returned malformed JSON: ${rawText.slice(0, 400)}`
      });
    }

    const validation = actionProposalSchema.safeParse(parsedJson);
    if (!validation.success) {
      throw new AgentProviderError({
        provider: "gemini",
        modelName: this.modelName,
        retryable: true,
        message: `Gemini response did not match ActionProposal schema: ${validation.error.message}`
      });
    }

    return {
      proposal: validation.data,
      rawOutput: rawText,
      executionTimeMs: elapsed,
      isDeterministicFallback: false,
      provider: "gemini",
      modelName: this.modelName
    };
  }
}
