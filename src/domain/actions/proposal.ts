import { z } from "zod";
import { solanaAddressSchema } from "../mandates/mandate";

/**
 * Valid action types supported by AgentCrashTest.
 */
export const actionTypeSchema = z.enum([
  "sol_transfer",
  "token_transfer",
  "program_interaction",
  "batch",
  "unknown"
]);

export type ActionType = z.infer<typeof actionTypeSchema>;

/**
 * Explicit ActionProposal type defined before the schema to break the circular
 * type inference that z.lazy() causes in strict TypeScript.
 */
export type ActionProposal = {
  actionId: string;
  actionType: string;
  description: string;
  parameters: {
    recipient?: string;
    lamports?: string;
    solAmount?: string;
    tokenMint?: string;
    tokenAmount?: string;
    tokenDecimals?: number;
    sourceAccount?: string;
    programId?: string;
    data?: string;
    rawAccounts?: string[];
    subProposals?: ActionProposal[];
  };
  reasoning?: string;
};

/**
 * Schema for an action proposal produced by the AI Agent.
 * The explicit ZodType annotation is required to satisfy TypeScript's circular
 * reference check introduced by z.lazy(() => actionProposalSchema).
 */
export const actionProposalSchema: z.ZodType<ActionProposal> = z.object({
  actionId: z.string().min(1, "actionId is required"),
  actionType: z.string().min(1, "actionType is required"),
  description: z.string().min(1, "Natural language description is required"),
  parameters: z.object({
    recipient: solanaAddressSchema.optional(),
    lamports: z.string().regex(/^\d+$/, "lamports must be an integer string").optional(),
    solAmount: z.string().optional(),
    tokenMint: solanaAddressSchema.optional(),
    tokenAmount: z.string().regex(/^\d+$/, "tokenAmount must be an integer string").optional(),
    tokenDecimals: z.number().int().min(0).max(18).optional(),
    sourceAccount: solanaAddressSchema.optional(),
    programId: solanaAddressSchema.optional(),
    data: z.string().optional(),
    rawAccounts: z.array(z.string()).optional(),
    subProposals: z.array(z.lazy(() => actionProposalSchema)).optional()
  }),
  reasoning: z.string().optional()
});

/**
 * Result of inspecting a Solana instruction account.
 */
export interface InstructionAccount {
  address: string;
  role: "readonly" | "writable" | "signer" | "writable_signer" | string;
}

export type DecodedInstructionType =
  | "SYSTEM_TRANSFER"
  | "TOKEN_TRANSFER"
  | "TOKEN_TRANSFER_CHECKED"
  | "CUSTOM_PROGRAM"
  | "UNSUPPORTED"
  | "MALFORMED";

export interface DecodedInstruction {
  programAddress: string;
  instructionType: DecodedInstructionType;
  accounts: InstructionAccount[];
  recipient?: string;
  source?: string;
  authority?: string;
  lamports?: bigint;
  tokenAmount?: bigint;
  tokenMint?: string;
  tokenDecimals?: number;
  dataBase64?: string;
  decodingError?: string;
  raw?: unknown;
}

export interface DecodedTransactionBundle {
  instructions: DecodedInstruction[];
  totalLamportsProposed: bigint;
  recipients: string[];
  programs: string[];
  hasUnsupported: boolean;
  hasMalformed: boolean;
  errors: string[];
}
