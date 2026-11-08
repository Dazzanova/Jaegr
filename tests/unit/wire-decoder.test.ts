import { describe, expect, it } from "vitest";
import {
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  compileTransaction,
  getBase64EncodedWireTransaction,
  createNoopSigner,
  address,
  lamports,
  type Blockhash,
  type Instruction
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS, getTransferSolInstruction } from "@solana-program/system";
import {
  TOKEN_PROGRAM_ADDRESS,
  getTransferCheckedInstruction,
  getTransferInstruction
} from "@solana-program/token";
import {
  decodeWireTransaction,
  assertWireMatchesInspected
} from "@/server/solana/transactions/decoder";

const FEE_PAYER = "83vSikV2eS2L54R8iH8Gv5vM2y9zH3R5xQv8vT3s8XqZ";
const RECIPIENT = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const TOKEN_ACCOUNT = "7UX2i7SucgLMQcfZ75s3VXmZZY4YRUyJN9X1RgfMoDUi";
const TOKEN_MINT = "So11111111111111111111111111111111111111112";
const BLOCKHASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

function encode(instructions: readonly Instruction[], feePayer = FEE_PAYER): string {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayer(address(feePayer), tx),
    (tx) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: BLOCKHASH as Blockhash, lastValidBlockHeight: 1n },
        tx
      ),
    (tx) => appendTransactionMessageInstructions(instructions, tx)
  );
  return getBase64EncodedWireTransaction(compileTransaction(message));
}

function systemTransferWire(amount: bigint, destination = RECIPIENT): string {
  return encode([
    getTransferSolInstruction({
      source: createNoopSigner(address(FEE_PAYER)),
      destination: address(destination),
      amount: lamports(amount)
    })
  ]);
}

describe("wire transaction decoder", () => {
  it("decodes a System Program SOL transfer from actual wire bytes", () => {
    const decoded = decodeWireTransaction(systemTransferWire(50_000_000n));

    expect(decoded.version).toBe(0);
    expect(decoded.feePayer).toBe(FEE_PAYER);
    expect(decoded.health).toBe("SUPPORTED");
    expect(decoded.instructions).toHaveLength(1);
    expect(decoded.instructions[0]).toMatchObject({
      programAddress: SYSTEM_PROGRAM_ADDRESS,
      instructionType: "SYSTEM_TRANSFER",
      source: FEE_PAYER,
      recipient: RECIPIENT,
      lamports: 50_000_000n
    });
    expect(decoded.totalLamports).toBe(50_000_000n);
  });

  it("decodes SPL Token transferChecked from actual wire bytes", () => {
    const wire = encode([
      getTransferCheckedInstruction({
        source: address(TOKEN_ACCOUNT),
        mint: address(TOKEN_MINT),
        destination: address(RECIPIENT),
        authority: createNoopSigner(address(FEE_PAYER)),
        amount: 250_000_000n,
        decimals: 6
      })
    ]);

    const decoded = decodeWireTransaction(wire);
    expect(decoded.instructions[0]).toMatchObject({
      programAddress: TOKEN_PROGRAM_ADDRESS,
      instructionType: "TOKEN_TRANSFER_CHECKED",
      source: TOKEN_ACCOUNT,
      recipient: RECIPIENT,
      tokenMint: TOKEN_MINT,
      tokenAmount: 250_000_000n,
      tokenDecimals: 6
    });
  });

  it("decodes unchecked SPL Token transfer from actual wire bytes", () => {
    const wire = encode([
      getTransferInstruction({
        source: address(TOKEN_ACCOUNT),
        destination: address(RECIPIENT),
        authority: createNoopSigner(address(FEE_PAYER)),
        amount: 42n
      })
    ]);

    const decoded = decodeWireTransaction(wire);
    expect(decoded.instructions[0]).toMatchObject({
      programAddress: TOKEN_PROGRAM_ADDRESS,
      instructionType: "TOKEN_TRANSFER",
      source: TOKEN_ACCOUNT,
      recipient: RECIPIENT,
      tokenAmount: 42n
    });
  });

  it("fails closed with UNSUPPORTED for an unknown program", () => {
    const wire = encode([
      {
        programAddress: address(MEMO_PROGRAM),
        accounts: [],
        data: new Uint8Array([1, 2, 3])
      }
    ]);

    const decoded = decodeWireTransaction(wire);
    expect(decoded.health).toBe("UNSUPPORTED");
    expect(decoded.instructions[0].instructionType).toBe("UNSUPPORTED");
    expect(decoded.instructions[0].programAddress).toBe(MEMO_PROGRAM);
  });

  it("rejects malformed transaction bytes", () => {
    expect(() => decodeWireTransaction("not-base64")).toThrow();
  });

  it("asserts the wire matches the independently inspected instruction", () => {
    const wire = systemTransferWire(50_000_000n);
    const inspected = {
      programAddress: SYSTEM_PROGRAM_ADDRESS,
      instructionType: "SYSTEM_TRANSFER" as const,
      accounts: [],
      source: FEE_PAYER,
      recipient: RECIPIENT,
      lamports: 50_000_000n
    };

    expect(() => assertWireMatchesInspected(wire, inspected)).not.toThrow();
  });

  it("rejects a wire transaction whose amount was changed after inspection", () => {
    const wire = systemTransferWire(50_000_001n);
    const inspected = {
      programAddress: SYSTEM_PROGRAM_ADDRESS,
      instructionType: "SYSTEM_TRANSFER" as const,
      accounts: [],
      source: FEE_PAYER,
      recipient: RECIPIENT,
      lamports: 50_000_000n
    };

    expect(() => assertWireMatchesInspected(wire, inspected)).toThrow(/amount/);
  });

  it("rejects a wire transaction whose recipient was changed after inspection", () => {
    const wire = systemTransferWire(50_000_000n, TOKEN_ACCOUNT);
    const inspected = {
      programAddress: SYSTEM_PROGRAM_ADDRESS,
      instructionType: "SYSTEM_TRANSFER" as const,
      accounts: [],
      source: FEE_PAYER,
      recipient: RECIPIENT,
      lamports: 50_000_000n
    };

    expect(() => assertWireMatchesInspected(wire, inspected)).toThrow(/recipient/);
  });

  it("rejects a wire transaction whose source account was replaced", () => {
    const wire = encode(
      [
        getTransferSolInstruction({
          source: createNoopSigner(address(TOKEN_ACCOUNT)),
          destination: address(RECIPIENT),
          amount: lamports(50_000_000n)
        })
      ],
      TOKEN_ACCOUNT
    );
    const inspected = {
      programAddress: SYSTEM_PROGRAM_ADDRESS,
      instructionType: "SYSTEM_TRANSFER" as const,
      accounts: [],
      source: FEE_PAYER,
      recipient: RECIPIENT,
      lamports: 50_000_000n
    };

    expect(() => assertWireMatchesInspected(wire, inspected)).toThrow(/source/);
  });

  it("rejects a wire transaction whose token authority was replaced", () => {
    const wire = encode(
      [
        getTransferInstruction({
          source: address(TOKEN_ACCOUNT),
          destination: address(RECIPIENT),
          authority: createNoopSigner(address(TOKEN_ACCOUNT)),
          amount: 5n
        })
      ],
      TOKEN_ACCOUNT
    );
    const inspected = {
      programAddress: TOKEN_PROGRAM_ADDRESS,
      instructionType: "TOKEN_TRANSFER" as const,
      accounts: [],
      source: TOKEN_ACCOUNT,
      recipient: RECIPIENT,
      authority: FEE_PAYER,
      tokenAmount: 5n
    };

    expect(() => assertWireMatchesInspected(wire, inspected)).toThrow(/authority/);
  });

  it("rejects a wire transaction with extra instructions", () => {
    const wire = encode([
      getTransferSolInstruction({
        source: createNoopSigner(address(FEE_PAYER)),
        destination: address(RECIPIENT),
        amount: lamports(1n)
      }),
      {
        programAddress: address(MEMO_PROGRAM),
        accounts: [],
        data: new Uint8Array([1])
      }
    ]);
    const inspected = {
      programAddress: SYSTEM_PROGRAM_ADDRESS,
      instructionType: "SYSTEM_TRANSFER" as const,
      accounts: [],
      source: FEE_PAYER,
      recipient: RECIPIENT,
      lamports: 1n
    };

    expect(() => assertWireMatchesInspected(wire, inspected)).toThrow(/instruction count/);
  });
});
