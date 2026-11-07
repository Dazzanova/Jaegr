import { address, createNoopSigner, lamports } from "@solana/kit";
import {
  SYSTEM_PROGRAM_ADDRESS,
  getTransferSolInstruction,
  parseTransferSolInstruction
} from "@solana-program/system";
import { ActionProposal, DecodedInstruction, InstructionAccount } from "@/domain/actions/proposal";

// Default dummy sender address used for constructing unsigned proposals when none is provided
export const DEFAULT_SOURCE_WALLET = "83vSikV2eS2L54R8iH8Gv5vM2y9zH3R5xQv8vT3s8XqZ";

export interface SolanaInstructionResult {
  decoded: DecodedInstruction;
  rawInstruction?: unknown;
}

/**
 * Solana Adapter:
 * Takes an agent's ActionProposal, generates the corresponding Solana instruction structure,
 * and deeply inspects the resulting instruction binary and accounts without trusting the agent's prose.
 */
export class SolanaInstructionAdapter {
  /**
   * Constructs and inspects a Solana instruction from an ActionProposal.
   */
  static processProposal(proposal: ActionProposal): SolanaInstructionResult {
    // 1. If actionType is sol_transfer
    if (proposal.actionType === "sol_transfer") {
      const recipientStr = proposal.parameters.recipient;
      const lamportsStr = proposal.parameters.lamports;

      if (!recipientStr || !lamportsStr) {
        return {
          decoded: {
            programAddress: SYSTEM_PROGRAM_ADDRESS,
            instructionType: "MALFORMED",
            accounts: [],
            decodingError: `Missing required transfer parameters: recipient=${recipientStr}, lamports=${lamportsStr}`
          }
        };
      }

      try {
        const destAddress = address(recipientStr);
        const sourceAddress = address(proposal.parameters.rawAccounts?.[0] || DEFAULT_SOURCE_WALLET);
        const amountBigInt = BigInt(lamportsStr);
        const transferAmount = lamports(amountBigInt);

        const sourceSigner = createNoopSigner(sourceAddress);

        // Construct official System Program transfer instruction
        const ix = getTransferSolInstruction({
          source: sourceSigner,
          destination: destAddress,
          amount: transferAmount
        });

        // Parse/verify instruction binary directly using official decoder
        const parsed = parseTransferSolInstruction(ix);

        const accounts: InstructionAccount[] = (ix.accounts || []).map((acc) => ({
          address: acc.address,
          role: acc.role === 3 ? "writable_signer" : acc.role === 1 ? "writable" : "readonly"
        }));

        const decoded: DecodedInstruction = {
          programAddress: parsed.programAddress,
          instructionType: "SYSTEM_TRANSFER",
          accounts,
          recipient: parsed.accounts.destination.address,
          source: parsed.accounts.source.address,
          lamports: parsed.data.amount,
          raw: {
            programAddress: ix.programAddress,
            accountCount: ix.accounts?.length ?? 0,
            dataLength: ix.data?.length ?? 0
          }
        };

        return {
          decoded,
          rawInstruction: ix
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          decoded: {
            programAddress: SYSTEM_PROGRAM_ADDRESS,
            instructionType: "MALFORMED",
            accounts: [],
            decodingError: `Failed to construct/decode System transfer instruction: ${message}`
          }
        };
      }
    }

    // 2. If program_interaction or custom program
    if (proposal.actionType === "program_interaction" || proposal.parameters.programId) {
      const programIdStr = proposal.parameters.programId || "unknown";
      try {
        const progAddress = address(programIdStr);

        const accounts: InstructionAccount[] = (proposal.parameters.rawAccounts || []).map((addr) => ({
          address: addr,
          role: "readonly"
        }));

        // Explicitly return UNSUPPORTED because arbitrary programs cannot be safely verified as safe
        const decoded: DecodedInstruction = {
          programAddress: progAddress,
          instructionType: "UNSUPPORTED",
          accounts,
          dataBase64: proposal.parameters.data,
          decodingError: `Program '${progAddress}' is not an authorized inspectable standard program.`
        };

        return {
          decoded,
          rawInstruction: {
            programAddress: progAddress,
            data: proposal.parameters.data
          }
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          decoded: {
            programAddress: programIdStr,
            instructionType: "MALFORMED",
            accounts: [],
            decodingError: `Invalid program address or account structure: ${message}`
          }
        };
      }
    }

    // 3. Unknown or unsupported action type
    return {
      decoded: {
        programAddress: "Unknown",
        instructionType: "UNSUPPORTED",
        accounts: [],
        decodingError: `Unsupported action type: '${proposal.actionType}'`
      }
    };
  }
}
