import { address, createNoopSigner, lamports } from "@solana/kit";
import {
  SYSTEM_PROGRAM_ADDRESS,
  getTransferSolInstruction,
  parseTransferSolInstruction
} from "@solana-program/system";
import {
  TOKEN_PROGRAM_ADDRESS,
  getTransferCheckedInstruction,
  parseTransferCheckedInstruction
} from "@solana-program/token";
import { ActionProposal, DecodedInstruction, DecodedTransactionBundle, InstructionAccount } from "@/domain/actions/proposal";

// Default dummy sender address used for constructing unsigned proposals when none is provided.
// This is a valid base58 Devnet address used only for instruction construction/inspection.
export const DEFAULT_SOURCE_WALLET = "83vSikV2eS2L54R8iH8Gv5vM2y9zH3R5xQv8vT3s8XqZ";

export interface SolanaInstructionResult {
  decoded: DecodedInstruction;
  rawInstruction?: unknown;
}

export interface ProcessProposalOptions {
  /**
   * The wallet that will sign and pay for the transaction. When provided, it is
   * used as the transfer source/authority so the inspected instruction matches
   * the actual wire transaction instead of the placeholder demo wallet.
   */
  sourceAddress?: string;
}

/**
 * Solana Adapter:
 * Takes an agent's ActionProposal, generates the corresponding Solana instruction structure,
 * and deeply inspects the resulting instruction binary and accounts without trusting the agent's prose.
 *
 * Supported:
 *   - System Program SOL transfers (sol_transfer)
 *   - SPL Token transferChecked (token_transfer)
 *
 * Unsupported:
 *   - Arbitrary program interactions → returns UNSUPPORTED_INSTRUCTION
 *   - Unknown action types → returns UNSUPPORTED_INSTRUCTION
 */
export class SolanaInstructionAdapter {
  /**
   * Constructs and inspects a Solana instruction from an ActionProposal.
   */
  static processProposal(
    proposal: ActionProposal,
    options: ProcessProposalOptions = {}
  ): SolanaInstructionResult {
    // ── 1. System Program SOL transfer ───────────────────────────────────────
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
        const sourceAddress = address(
          options.sourceAddress || proposal.parameters.rawAccounts?.[0] || DEFAULT_SOURCE_WALLET
        );
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

        return { decoded, rawInstruction: ix };
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

    // ── 2. SPL Token transferChecked ──────────────────────────────────────────
    if (proposal.actionType === "token_transfer") {
      const destinationStr = proposal.parameters.recipient; // destination token account
      const tokenAmountStr = proposal.parameters.tokenAmount;
      const tokenMintStr = proposal.parameters.tokenMint;
      const sourceStr = proposal.parameters.sourceAccount || proposal.parameters.rawAccounts?.[0];
      const decimals = proposal.parameters.tokenDecimals;
      // Authority is typically index 1 in rawAccounts or falls back to the source
      const authorityStr =
        options.sourceAddress || proposal.parameters.rawAccounts?.[1] || sourceStr;

      if (!destinationStr || !tokenAmountStr || !tokenMintStr || !sourceStr || decimals === undefined) {
        return {
          decoded: {
            programAddress: TOKEN_PROGRAM_ADDRESS,
            instructionType: "MALFORMED",
            accounts: [],
            decodingError: [
              `Missing required token transfer parameters:`,
              `destination=${destinationStr}`,
              `tokenAmount=${tokenAmountStr}`,
              `tokenMint=${tokenMintStr}`,
              `sourceAccount=${sourceStr}`,
              `tokenDecimals=${decimals}`
            ].join(" ")
          }
        };
      }

      try {
        const sourceAddr = address(sourceStr);
        const mintAddr = address(tokenMintStr);
        const destAddr = address(destinationStr);
        const authorityAddr = address(authorityStr || sourceStr);
        const authoritySigner = createNoopSigner(authorityAddr);
        const amount = BigInt(tokenAmountStr);

        // Construct official SPL Token transferChecked instruction
        const ix = getTransferCheckedInstruction({
          source: sourceAddr,
          mint: mintAddr,
          destination: destAddr,
          authority: authoritySigner,
          amount,
          decimals
        });

        // Parse/verify instruction binary directly using official decoder
        const parsed = parseTransferCheckedInstruction(ix);

        const accounts: InstructionAccount[] = (ix.accounts || []).map((acc) => ({
          address: acc.address,
          role: acc.role === 3 ? "writable_signer" : acc.role === 1 ? "writable" : "readonly"
        }));

        const decoded: DecodedInstruction = {
          programAddress: parsed.programAddress,
          instructionType: "TOKEN_TRANSFER_CHECKED",
          accounts,
          recipient: parsed.accounts.destination.address,
          source: parsed.accounts.source.address,
          authority: parsed.accounts.authority.address,
          tokenAmount: parsed.data.amount,
          tokenMint: parsed.accounts.mint.address,
          tokenDecimals: parsed.data.decimals,
          raw: {
            programAddress: ix.programAddress,
            accountCount: ix.accounts?.length ?? 0,
            dataLength: ix.data?.length ?? 0
          }
        };

        return { decoded, rawInstruction: ix };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          decoded: {
            programAddress: TOKEN_PROGRAM_ADDRESS,
            instructionType: "MALFORMED",
            accounts: [],
            decodingError: `Failed to construct/decode SPL Token transferChecked instruction: ${message}`
          }
        };
      }
    }

    // ── 3. Arbitrary program interaction ─────────────────────────────────────
    if (proposal.actionType === "program_interaction" || proposal.parameters.programId) {
      const programIdStr = proposal.parameters.programId || "unknown";
      try {
        const progAddress = address(programIdStr);

        const accounts: InstructionAccount[] = (proposal.parameters.rawAccounts || []).map((acc: string) => ({
          address: acc,
          role: "readonly"
        }));

        // Explicitly return UNSUPPORTED because arbitrary programs cannot be safely verified
        const decoded: DecodedInstruction = {
          programAddress: progAddress,
          instructionType: "UNSUPPORTED",
          accounts,
          dataBase64: proposal.parameters.data,
          decodingError: `Program '${progAddress}' is not an authorized inspectable standard program.`
        };

        return {
          decoded,
          rawInstruction: { programAddress: progAddress, data: proposal.parameters.data }
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

    // ── 4. Unknown or unsupported action type ─────────────────────────────────
    return {
      decoded: {
        programAddress: "Unknown",
        instructionType: "UNSUPPORTED",
        accounts: [],
        decodingError: `Unsupported action type: '${proposal.actionType}'`
      }
    };
  }

  /**
   * Decodes a proposal into an inspectable instruction bundle.
   *
   * Single-instruction proposals produce a bundle of one. A `batch` proposal
   * decodes every sub-proposal so the evaluator can enforce cumulative
   * spending and per-instruction allowlists across the whole transaction.
   */
  static processProposalBundle(proposal: ActionProposal): DecodedTransactionBundle {
    if (proposal.actionType !== "batch") {
      const { decoded } = SolanaInstructionAdapter.processProposal(proposal);
      return {
        instructions: [decoded],
        totalLamportsProposed: decoded.lamports ?? 0n,
        recipients: decoded.recipient ? [decoded.recipient] : [],
        programs: [decoded.programAddress],
        hasUnsupported: decoded.instructionType === "UNSUPPORTED",
        hasMalformed: decoded.instructionType === "MALFORMED",
        errors: decoded.decodingError ? [decoded.decodingError] : []
      };
    }

    const subProposals = proposal.parameters.subProposals ?? [];
    if (subProposals.length === 0) {
      const decoded: DecodedInstruction = {
        programAddress: "Unknown",
        instructionType: "UNSUPPORTED",
        accounts: [],
        decodingError: "Batch proposal contains no sub-proposals"
      };
      return {
        instructions: [decoded],
        totalLamportsProposed: 0n,
        recipients: [],
        programs: [],
        hasUnsupported: true,
        hasMalformed: false,
        errors: [decoded.decodingError ?? "Invalid batch"]
      };
    }

    const instructions = subProposals.map(
      (subProposal) => SolanaInstructionAdapter.processProposal(subProposal).decoded
    );
    const recipients = instructions
      .map((instruction) => instruction.recipient)
      .filter((recipient): recipient is string => Boolean(recipient));
    const programs = Array.from(new Set(instructions.map((instruction) => instruction.programAddress)));
    const errors = instructions
      .map((instruction) => instruction.decodingError)
      .filter((error): error is string => Boolean(error));

    return {
      instructions,
      totalLamportsProposed: instructions.reduce(
        (total, instruction) => (instruction.lamports !== undefined ? total + instruction.lamports : total),
        0n
      ),
      recipients,
      programs,
      hasUnsupported: instructions.some((instruction) => instruction.instructionType === "UNSUPPORTED"),
      hasMalformed: instructions.some((instruction) => instruction.instructionType === "MALFORMED"),
      errors
    };
  }
}
