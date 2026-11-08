/**
 * Transaction Builder
 *
 * Reconstructs a valid Solana transaction from a DecodedInstruction for the purpose
 * of Devnet simulation. The transaction is unsigned and uses NoopSigners — it is
 * never broadcast or committed.
 *
 * Supported instruction types:
 *   - SYSTEM_TRANSFER  → System Program SOL transfer
 *   - TOKEN_TRANSFER_CHECKED → SPL Token transferChecked
 *
 * All other instruction types return null (simulation is skipped).
 */

import {
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  compileTransaction,
  getBase64EncodedWireTransaction,
  createNoopSigner,
  address,
  lamports,
  type Blockhash
} from "@solana/kit";
import {
  SYSTEM_PROGRAM_ADDRESS,
  getTransferSolInstruction
} from "@solana-program/system";
import {
  getTransferCheckedInstruction
} from "@solana-program/token";
import { DecodedInstruction } from "@/domain/actions/proposal";

export interface BlockhashInfo {
  blockhash: Blockhash;
  lastValidBlockHeight: bigint;
}

/**
 * Builds a base64-encoded wire transaction suitable for `simulateTransaction`.
 *
 * @param decoded - The decoded instruction to build from.
 * @param blockhashInfo - A recent blockhash from the RPC.
 * @param feePayerOverride - Optional fee payer address. Defaults to the source account.
 * @returns Base64 wire transaction string, or null if the instruction type is not supported.
 */
export function buildTransactionForSimulation(
  decoded: DecodedInstruction,
  blockhashInfo: BlockhashInfo,
  feePayerOverride?: string
): string | null {
  try {
    if (decoded.instructionType === "SYSTEM_TRANSFER") {
      return buildSystemTransfer(decoded, blockhashInfo, feePayerOverride);
    }

    if (decoded.instructionType === "TOKEN_TRANSFER_CHECKED") {
      return buildTokenTransferChecked(decoded, blockhashInfo, feePayerOverride);
    }

    // MALFORMED, UNSUPPORTED, CUSTOM_PROGRAM, TOKEN_TRANSFER → not supported for simulation
    return null;
  } catch {
    return null;
  }
}

/**
 * Builds the executable transaction using the connected wallet as the signer
 * and fee payer. The proposal is still inspected independently before this step.
 */
export function buildTransactionForExecution(
  decoded: DecodedInstruction,
  blockhashInfo: BlockhashInfo,
  feePayer: string
): string | null {
  try {
    if (decoded.instructionType === "SYSTEM_TRANSFER") {
      if (!decoded.recipient || decoded.lamports === undefined) return null;
      const feePayerAddr = address(feePayer);
      const ix = getTransferSolInstruction({
        source: createNoopSigner(feePayerAddr),
        destination: address(decoded.recipient),
        amount: lamports(decoded.lamports)
      });
      const txMessage = pipe(
        createTransactionMessage({ version: 0 }),
        tx => setTransactionMessageFeePayer(feePayerAddr, tx),
        tx => setTransactionMessageLifetimeUsingBlockhash(blockhashInfo, tx),
        tx => appendTransactionMessageInstruction(ix, tx)
      );
      return getBase64EncodedWireTransaction(compileTransaction(txMessage));
    }

    if (
      decoded.instructionType === "TOKEN_TRANSFER_CHECKED" &&
      decoded.recipient &&
      decoded.tokenMint &&
      decoded.authority &&
      decoded.tokenAmount !== undefined &&
      decoded.tokenDecimals !== undefined &&
      decoded.authority === feePayer
    ) {
      const feePayerAddr = address(feePayer);
      const ix = getTransferCheckedInstruction({
        source: address(decoded.source || feePayer),
        mint: address(decoded.tokenMint),
        destination: address(decoded.recipient),
        authority: createNoopSigner(feePayerAddr),
        amount: decoded.tokenAmount,
        decimals: decoded.tokenDecimals
      });
      const txMessage = pipe(
        createTransactionMessage({ version: 0 }),
        tx => setTransactionMessageFeePayer(feePayerAddr, tx),
        tx => setTransactionMessageLifetimeUsingBlockhash(blockhashInfo, tx),
        tx => appendTransactionMessageInstruction(ix, tx)
      );
      return getBase64EncodedWireTransaction(compileTransaction(txMessage));
    }

    return null;
  } catch {
    return null;
  }
}

function buildSystemTransfer(
  decoded: DecodedInstruction,
  blockhashInfo: BlockhashInfo,
  feePayerOverride?: string
): string | null {
  if (!decoded.source || !decoded.recipient || decoded.lamports === undefined) {
    return null;
  }

  const sourceAddr = address(decoded.source);
  const destAddr = address(decoded.recipient);
  const feePayerAddr = address(feePayerOverride || decoded.source);
  const sourceSigner = createNoopSigner(sourceAddr);

  const ix = getTransferSolInstruction({
    source: sourceSigner,
    destination: destAddr,
    amount: lamports(decoded.lamports)
  });

  const txMessage = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayer(feePayerAddr, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(blockhashInfo, tx),
    tx => appendTransactionMessageInstruction(ix, tx)
  );

  const compiled = compileTransaction(txMessage);
  return getBase64EncodedWireTransaction(compiled);
}

function buildTokenTransferChecked(
  decoded: DecodedInstruction,
  blockhashInfo: BlockhashInfo,
  feePayerOverride?: string
): string | null {
  if (
    !decoded.source ||
    !decoded.recipient ||
    !decoded.tokenMint ||
    !decoded.authority ||
    decoded.tokenAmount === undefined ||
    decoded.tokenDecimals === undefined
  ) {
    return null;
  }

  const sourceAddr = address(decoded.source);
  const mintAddr = address(decoded.tokenMint);
  const destAddr = address(decoded.recipient);
  const authorityAddr = address(decoded.authority);
  const feePayerAddr = address(feePayerOverride || decoded.authority);
  const authoritySigner = createNoopSigner(authorityAddr);

  const ix = getTransferCheckedInstruction({
    source: sourceAddr,
    mint: mintAddr,
    destination: destAddr,
    authority: authoritySigner,
    amount: decoded.tokenAmount,
    decimals: decoded.tokenDecimals
  });

  const txMessage = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayer(feePayerAddr, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(blockhashInfo, tx),
    tx => appendTransactionMessageInstruction(ix, tx)
  );

  const compiled = compileTransaction(txMessage);
  return getBase64EncodedWireTransaction(compiled);
}

/**
 * Returns the SYSTEM_PROGRAM_ADDRESS constant for use in allowlist checks.
 */
export { SYSTEM_PROGRAM_ADDRESS };
