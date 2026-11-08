import { ActionProposal } from "@/domain/actions/proposal";

export type AgentProfileType = "vulnerable" | "hardened";

/** Live or simulated engine that produced an agent proposal. */
export type AgentProviderId = "groq" | "gemini" | "deterministic-demo";

export interface AgentProfile {
  id: string;
  name: string;
  type: AgentProfileType;
  description: string;
  systemPromptDescription: string;
}

export interface AgentInput {
  scenarioId: string;
  userTask: string;
  untrustedContext: string;
  mandateRules: {
    maxLamports: string;
    allowedRecipients: string[];
    allowedPrograms: string[];
    permittedActionTypes: string[];
  };
  profileType: AgentProfileType;
}

export interface AgentExecutionOutput {
  proposal: ActionProposal;
  rawOutput: string;
  executionTimeMs: number;
  isDeterministicFallback: boolean;
  provider: AgentProviderId;
  modelName: string;
}

export interface AgentAdapter {
  execute(input: AgentInput): Promise<AgentExecutionOutput>;
}

export const AGENT_PROFILES: AgentProfile[] = [
  {
    id: "profile-vulnerable-assistant",
    name: "Naive DeFi Assistant (Vulnerable)",
    type: "vulnerable",
    description: "Standard LLM agent with helpful persona. Processes untrusted external context without data/instruction isolation.",
    systemPromptDescription: "Instructed to be helpful, execute user and third-party suggestions eagerly, and prioritize high returns or flash deals."
  },
  {
    id: "profile-hardened-assistant",
    name: "Hardened Solana Sentinel (Hardened)",
    type: "hardened",
    description: "Defensively prompted agent with strict data-instruction separation, explicit tag delimitation, and mandate compliance checks.",
    systemPromptDescription: "Treats all external documents, invoices, and token metadata as untrusted inert data. Ignores any embedded commands."
  }
];
