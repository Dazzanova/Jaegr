import { describe, expect, it } from "vitest";
import {
  getBase64Decoder,
  getBase64Encoder,
  getTransactionDecoder,
  getTransactionEncoder,
  type Blockhash
} from "@solana/kit";
import { buildTransactionForExecution } from "@/server/solana/transactions/builder";
import { validateSignedWireTransaction } from "@/server/solana/transactions/wire";

const FEE_PAYER = "83vSikV2eS2L54R8iH8Gv5vM2y9zH3R5xQv8vT3s8XqZ";
const RECIPIENT = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const BLOCKHASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

function makeUnsignedWire(): string {
  const wire = buildTransactionForExecution(
    {
      programAddress: "11111111111111111111111111111111",
      instructionType: "SYSTEM_TRANSFER",
      accounts: [],
      source: FEE_PAYER,
      recipient: RECIPIENT,
      lamports: 1n
    },
    { blockhash: BLOCKHASH as Blockhash, lastValidBlockHeight: 1n },
    FEE_PAYER
  );
  if (!wire) throw new Error("failed to build test transaction");
  return wire;
}

function signWithPlaceholder(unsignedWire: string): string {
  const decoder = getTransactionDecoder();
  const encoder = getTransactionEncoder();
  const transaction = decoder.decode(getBase64Encoder().encode(unsignedWire));
  const [feePayer] = Object.keys(transaction.signatures);
  const signed = {
    ...transaction,
    signatures: {
      ...transaction.signatures,
      [feePayer]: new Uint8Array(64).fill(7)
    }
  };
  return getBase64Decoder().decode(encoder.encode(signed));
}

describe("signed wire transaction validation", () => {
  it("accepts a wallet-signed transaction with the inspected message", () => {
    const unsignedWireTransaction = makeUnsignedWire();
    const signedWireTransaction = signWithPlaceholder(unsignedWireTransaction);
    const result = validateSignedWireTransaction({
      signedWireTransaction,
      unsignedWireTransaction,
      expectedFeePayer: FEE_PAYER
    });

    expect(result.feePayer).toBe(FEE_PAYER);
    expect(result.signature.length).toBeGreaterThanOrEqual(87);
    expect(result.signature.length).toBeLessThanOrEqual(88);
  });

  it("reports a modified transaction message", () => {
    const unsignedWireTransaction = makeUnsignedWire();
    const signedWireTransaction = signWithPlaceholder(unsignedWireTransaction);
    const modifiedBytes = Uint8Array.from(getBase64Encoder().encode(signedWireTransaction));
    modifiedBytes[modifiedBytes.length - 1] ^= 1;
    const modifiedWire = getBase64Decoder().decode(modifiedBytes);

    expect(() => validateSignedWireTransaction({
      signedWireTransaction: modifiedWire,
      unsignedWireTransaction,
      expectedFeePayer: FEE_PAYER
    })).toThrow(/expected v0\/\d+B, received v0\/\d+B, first difference at byte \d+/);
  });

  it("rejects an unsigned wallet response", () => {
    const unsignedWireTransaction = makeUnsignedWire();
    expect(() => validateSignedWireTransaction({
      signedWireTransaction: unsignedWireTransaction,
      unsignedWireTransaction,
      expectedFeePayer: FEE_PAYER
    })).toThrow(/missing its fee-payer signature/);
  });
});
