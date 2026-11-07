import { z } from "zod";
import { solanaAddressSchema } from "../mandates/mandate";

/**
 * Valid action types supported by AgentCrashTest.
 */
export const actionTypeSchema = z.enum([
  "sol_transfer",
  "program_interaction",
  "unknown"
]);

export type ActionType = z.infer<typeof actionTypeSchema>;

/**
 * Schema for an action proposal produced by the AI Agent.
 */
export const actionProposalSchema = z.object({
  actionId: z.string().min(1, "actionId is required"),
  actionType: z.string().min(1, "actionType is required"),
  description: z.string().min(1, "Natural language description is required"),
  parameters: z.object({
    recipient: solanaAddressSchema.optional(),
    lamports: z.string().regex(/^\d+$/, "lamports must be an integer string").optional(),
    solAmount: z.string().optional(),
    programId: solanaAddressSchema.optional(),
    data: z.string().optional(),
    rawAccounts: z.array(z.string()).optional()
  }),
  reasoning: z.string().optional()
});

export type ActionProposal = z.infer<typeof actionProposalSchema>;

/**
 * Result of inspecting a Solana instruction proposal.
 */
export interface InstructionAccount {
  address: string;
  role: "readonly" | "writable" | "signer" | "writable_signer" | string;
}

export interface DecodedInstruction {
  programAddress: string;
  instructionType: "SYSTEM_TRANSFER" | "CUSTOM_PROGRAM" | "UNSUPPORTED" | "MALFORMED";
  accounts: InstructionAccount[];
  recipient?: string;
  source?: string;
  lamports?: bigint;
  dataBase64?: string;
  decodingError?: string;
  raw?: unknown;
}
