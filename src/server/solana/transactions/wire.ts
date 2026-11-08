import {
  bytesEqual,
  getBase64Encoder,
  getBase58Decoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type Base64EncodedWireTransaction
} from "@solana/kit";

export interface DecodedWireTransaction {
  messageBytes: Uint8Array;
  feePayer: string;
  signature: string;
  signatureCount: number;
}

function decodeWireTransaction(wireTransactionBase64: string, requireSignature: boolean): DecodedWireTransaction {
  const bytes = getBase64Encoder().encode(wireTransactionBase64);
  const transaction = getTransactionDecoder().decode(bytes);
  const entries = Object.entries(transaction.signatures);
  const [feePayerEntry] = entries;

  if (!feePayerEntry) {
    throw new Error("Transaction is missing its fee-payer account");
  }
  if (requireSignature && !feePayerEntry[1]) {
    throw new Error("Signed transaction is missing its fee-payer signature");
  }

  return {
    messageBytes: Uint8Array.from(transaction.messageBytes),
    feePayer: feePayerEntry[0],
    signature: feePayerEntry[1] ? getBase58Decoder().decode(feePayerEntry[1]) : "",
    signatureCount: entries.length
  };
}

function describeMessage(messageBytes: Uint8Array): string {
  const versionByte = messageBytes[0] ?? 0;
  const version = (versionByte & 0x80) !== 0 ? `v${versionByte & 0x7f}` : "legacy";
  return `${version}/${messageBytes.length}B`;
}

function firstDifference(a: Uint8Array, b: Uint8Array): number {
  const limit = Math.min(a.length, b.length);
  for (let i = 0; i < limit; i += 1) {
    if (a[i] !== b[i]) return i;
  }
  return a.length === b.length ? -1 : limit;
}

type InstructionLike = {
  programAddressIndex: number;
  accountIndices?: readonly number[];
  data?: Uint8Array | readonly number[];
};

function instructionSignature(instruction: InstructionLike | undefined): string {
  if (!instruction) return "none";
  return `${instruction.programAddressIndex}:${(instruction.accountIndices ?? []).join(",")}:${Buffer.from(instruction.data ?? new Uint8Array()).toString("base64")}`;
}

/**
 * Explains which part of the message changed. Never returns the whole message;
 * only public fields (version, blockhash, account list, instruction summary).
 */
function describeMessageDifference(expectedBytes: Uint8Array, signedBytes: Uint8Array): string {
  try {
    const expected = getCompiledTransactionMessageDecoder().decode(expectedBytes);
    const signed = getCompiledTransactionMessageDecoder().decode(signedBytes);
    const changes: string[] = [];

    if (expected.version !== signed.version) {
      changes.push(`version ${expected.version} -> ${signed.version}`);
    }
    if (String(expected.lifetimeToken) !== String(signed.lifetimeToken)) {
      changes.push("recent blockhash changed");
    }
    if (expected.staticAccounts.join(",") !== signed.staticAccounts.join(",")) {
      changes.push("account list changed");
    }
    const expectedInstructions = "instructions" in expected ? expected.instructions : [];
    const signedInstructions = "instructions" in signed ? signed.instructions : [];
    if (
      instructionSignature(
        expectedInstructions[0] as InstructionLike | undefined
      ) !==
      instructionSignature(
        signedInstructions[0] as InstructionLike | undefined
      )
    ) {
      changes.push("instruction changed");
    }
    if (expectedInstructions.length !== signedInstructions.length) {
      changes.push(`instruction count ${expectedInstructions.length} -> ${signedInstructions.length}`);
    }
    const addressLookups = (message: typeof expected) =>
      "addressTableLookups" in message ? JSON.stringify(message.addressTableLookups) : "none";
    if (addressLookups(expected) !== addressLookups(signed)) {
      changes.push("address lookup tables changed");
    }

    return changes.length > 0
      ? changes.join(", ")
      : "message content is semantically identical (possible re-encoding)";
  } catch {
    return "message could not be decoded for a detailed comparison";
  }
}

export function validateSignedWireTransaction(input: {
  signedWireTransaction: string;
  unsignedWireTransaction: string;
  expectedFeePayer: string;
}): DecodedWireTransaction {
  const expected = decodeWireTransaction(input.unsignedWireTransaction, false);
  const signed = decodeWireTransaction(input.signedWireTransaction, true);

  if (expected.feePayer !== input.expectedFeePayer || signed.feePayer !== input.expectedFeePayer) {
    throw new Error("Signed transaction fee payer does not match the connected wallet");
  }

  if (!bytesEqual(expected.messageBytes, signed.messageBytes)) {
    const diffAt = firstDifference(expected.messageBytes, signed.messageBytes);
    // Diagnostics only: versions, lengths, and byte offsets are public data.
    // They reveal whether the wallet re-encoded the message (e.g. v0 -> legacy)
    // or changed its content (blockhash, accounts, instruction data).
    throw new Error(
      `Signed transaction message differs from the inspected proposal ` +
        `(expected ${describeMessage(expected.messageBytes)}, ` +
        `received ${describeMessage(signed.messageBytes)}, first difference at byte ${diffAt}: ` +
        `${describeMessageDifference(expected.messageBytes, signed.messageBytes)})`
    );
  }

  return signed;
}

export function asBase64EncodedWireTransaction(value: string): Base64EncodedWireTransaction {
  return value as Base64EncodedWireTransaction;
}
