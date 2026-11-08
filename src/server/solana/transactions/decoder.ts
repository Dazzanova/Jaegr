/**
 * Authoritative wire-transaction decoder.
 *
 * The decoder parses the actual compiled Solana transaction bytes and extracts
 * program IDs, account privileges, instruction data and decoded transfer
 * amounts. It never trusts a proposal's natural-language description.
 *
 * Supported programs:
 *   - System Program: transferSol
 *   - SPL Token Program: transfer, transferChecked
 *
 * Everything else fails closed as UNSUPPORTED. Versioned transactions that use
 * address lookup tables are rejected explicitly because their accounts cannot
 * be resolved without fetching on-chain lookup tables.
 */

import {
  assertIsInstructionWithAccounts,
  assertIsInstructionWithData,
  decompileTransactionMessage,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type AccountMeta,
  type Instruction,
  type InstructionWithAccounts,
  type InstructionWithData,
  type ReadonlyUint8Array
} from "@solana/kit";
import {
  SYSTEM_PROGRAM_ADDRESS,
  parseTransferSolInstruction
} from "@solana-program/system";
import {
  TOKEN_PROGRAM_ADDRESS,
  parseTransferCheckedInstruction,
  parseTransferInstruction
} from "@solana-program/token";
import {
  DecodedInstruction,
  DecodedInstructionType,
  InstructionAccount
} from "@/domain/actions/proposal";

export type WireHealth = "SUPPORTED" | "UNSUPPORTED";

export interface DecodedWireTransaction {
  version: "legacy" | 0;
  feePayer: string;
  instructions: DecodedInstruction[];
  totalLamports: bigint;
  health: WireHealth;
  transactionSizeBytes: number;
}

function roleName(role: number): InstructionAccount["role"] {
  switch (role) {
    case 3:
      return "writable_signer";
    case 2:
      return "signer";
    case 1:
      return "writable";
    default:
      return "readonly";
  }
}

function accountsOf(instruction: Instruction): InstructionAccount[] {
  return (instruction.accounts ?? []).map((account) => ({
    address: account.address,
    role: roleName(Number(account.role))
  }));
}

function ok(
  programAddress: string,
  instructionType: DecodedInstructionType,
  instruction: Instruction,
  fields: Partial<DecodedInstruction> = {}
): DecodedInstruction {
  return {
    programAddress,
    instructionType,
    accounts: accountsOf(instruction),
    raw: {
      programAddress: instruction.programAddress,
      accountCount: instruction.accounts?.length ?? 0,
      dataLength: instruction.data?.length ?? 0
    },
    ...fields
  };
}

function unsupported(
  programAddress: string,
  instruction: Instruction,
  reason: string
): DecodedInstruction {
  return ok(programAddress, "UNSUPPORTED", instruction, { decodingError: reason });
}

type ParsableInstruction = Instruction &
  InstructionWithAccounts<readonly AccountMeta[]> &
  InstructionWithData<ReadonlyUint8Array>;

function assertParsable(instruction: Instruction): ParsableInstruction | null {
  if (!instruction.accounts || !instruction.data) return null;
  assertIsInstructionWithAccounts<readonly AccountMeta[]>(instruction);
  assertIsInstructionWithData<ReadonlyUint8Array>(instruction);
  return instruction;
}

function decodeInstruction(instruction: Instruction): DecodedInstruction {
  const programAddress = instruction.programAddress;

  if (programAddress === SYSTEM_PROGRAM_ADDRESS) {
    const parsable = assertParsable(instruction);
    if (!parsable) {
      return unsupported(programAddress, instruction, "System Program instruction has no accounts or data");
    }
    try {
      const parsed = parseTransferSolInstruction(parsable);
      return ok(programAddress, "SYSTEM_TRANSFER", instruction, {
        source: parsed.accounts.source.address,
        recipient: parsed.accounts.destination.address,
        lamports: parsed.data.amount
      });
    } catch {
      return unsupported(
        programAddress,
        instruction,
        "System Program instruction is not a supported SOL transfer"
      );
    }
  }

  if (programAddress === TOKEN_PROGRAM_ADDRESS) {
    const parsable = assertParsable(instruction);
    if (!parsable) {
      return unsupported(programAddress, instruction, "SPL Token instruction has no accounts or data");
    }
    try {
      const parsed = parseTransferCheckedInstruction(parsable);
      return ok(programAddress, "TOKEN_TRANSFER_CHECKED", instruction, {
        source: parsed.accounts.source.address,
        recipient: parsed.accounts.destination.address,
        authority: parsed.accounts.authority.address,
        tokenMint: parsed.accounts.mint.address,
        tokenAmount: parsed.data.amount,
        tokenDecimals: parsed.data.decimals
      });
    } catch {
      // Fall through to unchecked transfer.
    }

    try {
      const parsed = parseTransferInstruction(parsable);
      return ok(programAddress, "TOKEN_TRANSFER", instruction, {
        source: parsed.accounts.source.address,
        recipient: parsed.accounts.destination.address,
        authority: parsed.accounts.authority.address,
        tokenAmount: parsed.data.amount
      });
    } catch {
      return unsupported(
        programAddress,
        instruction,
        "SPL Token instruction is not a supported transfer or transferChecked instruction"
      );
    }
  }

  return unsupported(
    programAddress,
    instruction,
    `Program '${programAddress}' is not an inspectable standard program`
  );
}

/**
 * Decodes a base64 wire transaction into independently inspected instructions.
 * Throws for malformed bytes or address-lookup-table transactions.
 */
export function decodeWireTransaction(wireTransactionBase64: string): DecodedWireTransaction {
  const transactionBytes = getBase64Encoder().encode(wireTransactionBase64);
  const transaction = getTransactionDecoder().decode(transactionBytes);
  const compiled = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);

  const lookups = "addressTableLookups" in compiled ? compiled.addressTableLookups : undefined;
  if (lookups && lookups.length > 0) {
    throw new Error(
      "Address lookup table transactions are not supported for inspection and are rejected"
    );
  }

  const message = decompileTransactionMessage(compiled);
  const instructions: DecodedInstruction[] = [];
  for (const candidate of message.instructions) {
    instructions.push(decodeInstruction(candidate));
  }

  const totalLamports = instructions.reduce(
    (total: bigint, instruction: DecodedInstruction) =>
      instruction.instructionType === "SYSTEM_TRANSFER" && instruction.lamports !== undefined
        ? total + instruction.lamports
        : total,
    0n
  );

  const version = compiled.version === "legacy" ? "legacy" : 0;

  return {
    version,
    feePayer: message.feePayer.address,
    instructions,
    totalLamports,
    health: instructions.some((instruction) => instruction.instructionType === "UNSUPPORTED")
      ? "UNSUPPORTED"
      : "SUPPORTED",
    transactionSizeBytes: transactionBytes.length
  };
}

/**
 * Verifies that the exact wire transaction to be signed/submitted matches the
 * instruction that was independently inspected and authorized.
 *
 * This prevents recipient, amount, program, or extra-instruction tampering
 * between preparation and submission.
 */
export function assertWireMatchesInspected(
  wireTransactionBase64: string,
  inspected: DecodedInstruction
): DecodedWireTransaction {
  const decoded = decodeWireTransaction(wireTransactionBase64);

  if (decoded.instructions.length !== 1) {
    throw new Error(
      `Wire transaction instruction count (${decoded.instructions.length}) does not match the inspected proposal (1)`
    );
  }

  if (decoded.health === "UNSUPPORTED") {
    throw new Error("Wire transaction contains an unsupported instruction");
  }

  const actual = decoded.instructions[0];

  if (actual.programAddress !== inspected.programAddress) {
    throw new Error(
      `Wire transaction program '${actual.programAddress}' does not match the inspected program '${inspected.programAddress}'`
    );
  }

  if (actual.instructionType !== inspected.instructionType) {
    throw new Error(
      `Wire transaction instruction type '${actual.instructionType}' does not match the inspected type '${inspected.instructionType}'`
    );
  }

  if (actual.source !== inspected.source) {
    throw new Error("Wire transaction source account does not match the inspected source");
  }

  if (actual.authority !== inspected.authority) {
    throw new Error("Wire transaction token authority does not match the inspected authority");
  }

  if (actual.recipient !== inspected.recipient) {
    throw new Error("Wire transaction recipient does not match the inspected recipient");
  }

  if (actual.lamports !== inspected.lamports) {
    throw new Error("Wire transaction amount does not match the inspected amount");
  }

  if (actual.tokenAmount !== inspected.tokenAmount) {
    throw new Error("Wire transaction token amount does not match the inspected token amount");
  }

  if (actual.tokenMint !== inspected.tokenMint) {
    throw new Error("Wire transaction token mint does not match the inspected token mint");
  }

  if (actual.tokenDecimals !== inspected.tokenDecimals) {
    throw new Error("Wire transaction token decimals do not match the inspected token decimals");
  }

  // A SOL transfer must spend from the authorized fee payer, never another account.
  if (actual.instructionType === "SYSTEM_TRANSFER" && actual.source !== decoded.feePayer) {
    throw new Error("Wire transaction SOL transfer source is not the fee payer");
  }

  return decoded;
}
