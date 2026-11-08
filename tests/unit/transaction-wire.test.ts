import { describe, expect, it } from "vitest";
import {
  getBase64Decoder,
  getBase64Encoder,
  getTransactionDecoder,
  getTransactionEncoder,
  compileTransaction,
  appendTransactionMessageInstruction,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  getBase64EncodedWireTransaction,
  createNoopSigner,
  address,
  lamports,
  type Blockhash,
  type Instruction,
  type TransactionMessage,
  type TransactionMessageWithFeePayer,
  type TransactionMessageWithLifetime
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { buildTransactionForExecution } from "@/server/solana/transactions/builder";
import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  validateSignedWireTransaction
} from "@/server/solana/transactions/wire";

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

interface TestInstruction {
  programAddress: string;
  data: Uint8Array;
}

const COMPUTE_UNIT_LIMIT: TestInstruction = {
  programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS,
  data: new Uint8Array([2, 0x40, 0x42, 0x0f, 0x00])
};

const COMPUTE_UNIT_PRICE: TestInstruction = {
  programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS,
  data: new Uint8Array([3, 0xe8, 0x03, 0, 0, 0, 0, 0, 0])
};

function rawInstruction(instruction: TestInstruction): Instruction {
  return {
    programAddress: address(instruction.programAddress),
    accounts: [],
    data: instruction.data
  };
}

/**
 * Rebuilds the transfer and appends extra instructions, simulating a wallet
 * that injects priority-fee instructions (or malicious extra instructions).
 */
function makeAugmentedSignedWire(options: {
  amount?: bigint;
  extraInstructions?: TestInstruction[];
} = {}): string {
  const feePayerAddress = address(FEE_PAYER);
  const transfer = getTransferSolInstruction({
    source: createNoopSigner(feePayerAddress),
    destination: address(RECIPIENT),
    amount: lamports(options.amount ?? 1n)
  });
  let message: TransactionMessage &
    TransactionMessageWithFeePayer &
    TransactionMessageWithLifetime = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayer(feePayerAddress, tx),
    (tx) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: BLOCKHASH as Blockhash, lastValidBlockHeight: 1n },
        tx
      ),
    (tx) => appendTransactionMessageInstruction(transfer, tx)
  );

  for (const instruction of options.extraInstructions ?? []) {
    message = appendTransactionMessageInstruction(rawInstruction(instruction), message);
  }

  return signWithPlaceholder(getBase64EncodedWireTransaction(compileTransaction(message)));
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

  it("accepts wallet-injected ComputeBudget priority-fee instructions", () => {
    const unsignedWireTransaction = makeUnsignedWire();
    const signedWireTransaction = makeAugmentedSignedWire({
      extraInstructions: [COMPUTE_UNIT_LIMIT, COMPUTE_UNIT_PRICE]
    });

    const result = validateSignedWireTransaction({
      signedWireTransaction,
      unsignedWireTransaction,
      expectedFeePayer: FEE_PAYER
    });

    expect(result.feePayer).toBe(FEE_PAYER);
  });

  it("rejects an added instruction from any non-ComputeBudget program", () => {
    const unsignedWireTransaction = makeUnsignedWire();
    const signedWireTransaction = makeAugmentedSignedWire({
      extraInstructions: [
        COMPUTE_UNIT_LIMIT,
        { programAddress: "11111111111111111111111111111111", data: new Uint8Array([2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]) }
      ]
    });

    expect(() => validateSignedWireTransaction({
      signedWireTransaction,
      unsignedWireTransaction,
      expectedFeePayer: FEE_PAYER
    })).toThrow(/message differs/);
  });

  it("rejects a changed amount even when priority-fee instructions are present", () => {
    const unsignedWireTransaction = makeUnsignedWire();
    const signedWireTransaction = makeAugmentedSignedWire({
      amount: 2n,
      extraInstructions: [COMPUTE_UNIT_LIMIT, COMPUTE_UNIT_PRICE]
    });

    expect(() => validateSignedWireTransaction({
      signedWireTransaction,
      unsignedWireTransaction,
      expectedFeePayer: FEE_PAYER
    })).toThrow(/message differs/);
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
