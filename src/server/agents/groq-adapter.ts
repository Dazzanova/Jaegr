import { actionProposalSchema } from "@/domain/actions/proposal";
import { AgentAdapter, AgentExecutionOutput, AgentInput } from "./types";
import {
  AgentProviderError,
  isRetryableProviderError,
  sanitizeProviderMessage
} from "./errors";
import { buildActionProposalPrompt, buildSystemInstruction } from "./prompt";

/**
 * Groq exposes an OpenAI-compatible chat-completions endpoint. We call it with
 * plain `fetch` to avoid pulling in the OpenAI SDK for a single request.
 */
export const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Default model. Overridable with GROQ_MODEL. */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

/** Bounds a single model call so a stalled provider cannot hang a request. */
const GROQ_TIMEOUT_MS = 30_000;

interface GroqChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

/** Reads the provider's error body without ever echoing credentials. */
async function readErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.trim() ? sanitizeProviderMessage(text, 400) : "no response body";
  } catch {
    return "response body could not be read";
  }
}

export class GroqAgentAdapter implements AgentAdapter {
  private apiKey: string;
  private modelName: string;
  private fetchImpl: typeof fetch;

  constructor(
    apiKey?: string,
    modelName = process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL,
    fetchImpl: typeof fetch = fetch
  ) {
    const key = apiKey || process.env.GROQ_API_KEY;
    if (!key) {
      throw new Error("GROQ_API_KEY is not configured in the environment.");
    }
    this.apiKey = key;
    this.modelName = modelName;
    this.fetchImpl = fetchImpl;
  }

  async execute(input: AgentInput): Promise<AgentExecutionOutput> {
    const start = performance.now();

    let response: Response;
    try {
      response = await this.fetchImpl(GROQ_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.modelName,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: buildSystemInstruction(input.profileType) },
            { role: "user", content: buildActionProposalPrompt(input) }
          ]
        }),
        signal: AbortSignal.timeout(GROQ_TIMEOUT_MS)
      });
    } catch (error: unknown) {
      throw new AgentProviderError({
        provider: "groq",
        modelName: this.modelName,
        retryable: isRetryableProviderError(error),
        message: `Groq request failed: ${sanitizeProviderMessage(error)}`
      });
    }

    if (!response.ok) {
      const retryAfter = response.headers?.get?.("retry-after");
      const detail = await readErrorDetail(response);
      throw new AgentProviderError({
        provider: "groq",
        modelName: this.modelName,
        retryable: isRetryableProviderError({ status: response.status }),
        message:
          `Groq request failed (HTTP ${response.status}` +
          `${retryAfter ? `, retry-after ${retryAfter}s` : ""}): ${detail}`
      });
    }

    let payload: GroqChatCompletionResponse;
    try {
      payload = (await response.json()) as GroqChatCompletionResponse;
    } catch {
      throw new AgentProviderError({
        provider: "groq",
        modelName: this.modelName,
        retryable: true,
        message: "Groq returned a response that was not valid JSON."
      });
    }

    const elapsed = Math.round(performance.now() - start);
    const rawText = payload.choices?.[0]?.message?.content?.trim();
    if (!rawText) {
      throw new AgentProviderError({
        provider: "groq",
        modelName: this.modelName,
        retryable: true,
        message: "Groq returned an empty completion."
      });
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      throw new AgentProviderError({
        provider: "groq",
        modelName: this.modelName,
        retryable: true,
        message: `Groq returned malformed JSON: ${rawText.slice(0, 400)}`
      });
    }

    const validation = actionProposalSchema.safeParse(parsedJson);
    if (!validation.success) {
      throw new AgentProviderError({
        provider: "groq",
        modelName: this.modelName,
        retryable: true,
        message: `Groq response did not match ActionProposal schema: ${validation.error.message}`
      });
    }

    return {
      proposal: validation.data,
      rawOutput: rawText,
      executionTimeMs: elapsed,
      isDeterministicFallback: false,
      provider: "groq",
      modelName: this.modelName
    };
  }
}
