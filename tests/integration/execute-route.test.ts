import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  getBase58Decoder,
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
  type TransactionMessage,
  type TransactionMessageWithFeePayer,
  type TransactionMessageWithLifetime
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { buildTransactionForExecution } from "@/server/solana/transactions/builder";
import { COMPUTE_BUDGET_PROGRAM_ADDRESS } from "@/server/solana/transactions/wire";

vi.mock("@/server/persistence/repository", () => ({
  ExecutionRepository: {
    get: vi.fn(),
    start: vi.fn(),
    update: vi.fn()
  }
}));

vi.mock("@/server/solana/client", () => ({
  getSolanaClient: vi.fn()
}));

import { POST } from "@/app/api/solana/execute/route";
import { ExecutionRepository } from "@/server/persistence/repository";
import { getSolanaClient } from "@/server/solana/client";

const FEE_PAYER = "83vSikV2eS2L54R8iH8Gv5vM2y9zH3R5xQv8vT3s8XqZ";
const RECIPIENT = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const OTHER_RECIPIENT = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const BLOCKHASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const SIGNATURE = "5KtPn3TXBMFXkNTGy5QkqriofhzFm4QjKtXhfZKrN8dqRYnMBqC1VnGV1SyvMJGNuNnFEt1oqBTFUX2LNjZeQCn";

const proposal = {
  actionId: "ACT-EXECUTE-TEST",
  actionType: "sol_transfer",
  description: "Send test lamports",
  parameters: { recipient: RECIPIENT, lamports: "1" }
};

const mandate = {
  id: "m-execute",
  name: "Execution test mandate",
  maxLamportsPerAction: "10",
  allowedRecipients: [RECIPIENT],
  allowedPrograms: ["11111111111111111111111111111111"],
  permittedActionTypes: ["sol_transfer"],
  seenActionIds: []
};

function makeWire(options: { amount?: bigint; recipient?: string } = {}): {
  unsigned: string;
  signed: string;
  signature: string;
} {
  const unsigned = buildTransactionForExecution(
    {
      programAddress: "11111111111111111111111111111111",
      instructionType: "SYSTEM_TRANSFER",
      accounts: [],
      source: FEE_PAYER,
      recipient: options.recipient ?? RECIPIENT,
      lamports: options.amount ?? 1n
    },
    { blockhash: BLOCKHASH as Blockhash, lastValidBlockHeight: 1n },
    FEE_PAYER
  );
  if (!unsigned) throw new Error("failed to build wire transaction");
  const transaction = getTransactionDecoder().decode(getBase64Encoder().encode(unsigned));
  const feePayer = Object.keys(transaction.signatures)[0];
  const signed = {
    ...transaction,
    signatures: { ...transaction.signatures, [feePayer]: new Uint8Array(64).fill(3) }
  };
  const signedWire = getBase64Decoder().decode(getTransactionEncoder().encode(signed));
  return { unsigned, signed: signedWire, signature: signatureOf(signedWire) };
}

function signatureOf(signedWire: string): string {
  const transaction = getTransactionDecoder().decode(getBase64Encoder().encode(signedWire));
  const [entry] = Object.entries(transaction.signatures);
  if (!entry?.[1]) throw new Error("missing signature");
  return getBase58Decoder().decode(entry[1]);
}

/**
 * Simulates a wallet that injects ComputeBudget priority-fee instructions
 * while signing the prepared transfer.
 */
function addPriorityFeeInstructions(): string {
  const feePayerAddress = address(FEE_PAYER);
  const transfer = getTransferSolInstruction({
    source: createNoopSigner(feePayerAddress),
    destination: address(RECIPIENT),
    amount: lamports(1n)
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
  for (const data of [
    new Uint8Array([2, 0x40, 0x42, 0x0f, 0x00]),
    new Uint8Array([3, 0xe8, 0x03, 0, 0, 0, 0, 0, 0])
  ]) {
    message = appendTransactionMessageInstruction(
      { programAddress: address(COMPUTE_BUDGET_PROGRAM_ADDRESS), accounts: [], data },
      message
    );
  }
  const wire = getBase64EncodedWireTransaction(compileTransaction(message));
  const transaction = getTransactionDecoder().decode(getBase64Encoder().encode(wire));
  const feePayer = Object.keys(transaction.signatures)[0];
  const signed = {
    ...transaction,
    signatures: { ...transaction.signatures, [feePayer]: new Uint8Array(64).fill(3) }
  };
  return getBase64Decoder().decode(getTransactionEncoder().encode(signed));
}

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/solana/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function bodyFor(wire: ReturnType<typeof makeWire>, overrides: Record<string, unknown> = {}) {
  return {
    proposal,
    mandate,
    feePayerAddress: FEE_PAYER,
    unsignedWireTransaction: wire.unsigned,
    signedWireTransaction: wire.signed,
    ...overrides
  };
}

function mockClient(overrides: Record<string, unknown> = {}) {
  const client = {
    simulateSignedWireTransaction: vi.fn().mockResolvedValue({ err: null, logs: [] }),
    sendWireTransaction: vi.fn(),
    getTransaction: vi.fn().mockResolvedValue({ signature: SIGNATURE, slot: "42", err: null }),
    getBlockHeight: vi.fn().mockResolvedValue(1n),
    getConfig: () => ({ cluster: "devnet" }),
    ...overrides
  };
  vi.mocked(getSolanaClient).mockReturnValue(client as never);
  return client;
}

describe("POST /api/solana/execute", () => {
  const originalAttempts = process.env.SOLANA_CONFIRMATION_ATTEMPTS;
  const originalInterval = process.env.SOLANA_CONFIRMATION_INTERVAL_MS;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
    process.env.SOLANA_CONFIRMATION_ATTEMPTS = "1";
    process.env.SOLANA_CONFIRMATION_INTERVAL_MS = "0";
    vi.mocked(ExecutionRepository.get).mockResolvedValue(null);
    vi.mocked(ExecutionRepository.start).mockResolvedValue({} as never);
    vi.mocked(ExecutionRepository.update).mockResolvedValue();
  });

  afterEach(() => {
    if (originalAttempts === undefined) delete process.env.SOLANA_CONFIRMATION_ATTEMPTS;
    else process.env.SOLANA_CONFIRMATION_ATTEMPTS = originalAttempts;
    if (originalInterval === undefined) delete process.env.SOLANA_CONFIRMATION_INTERVAL_MS;
    else process.env.SOLANA_CONFIRMATION_INTERVAL_MS = originalInterval;
  });

  it("rejects unauthorized transactions without invoking RPC", async () => {
    const wire = makeWire();
    const response = await POST(request(bodyFor(wire, {
      mandate: { ...mandate, allowedRecipients: [OTHER_RECIPIENT] }
    })));

    expect(response.status).toBe(403);
    expect(getSolanaClient).not.toHaveBeenCalled();
  });

  it("rejects an unsupported instruction before submission", async () => {
    const wire = makeWire();
    const response = await POST(request(bodyFor(wire, {
      proposal: {
        actionId: "ACT-UNSUPPORTED",
        actionType: "program_interaction",
        description: "Invoke a rogue program",
        parameters: { programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" }
      }
    })));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.findings.some((f: { ruleViolated: string }) => f.ruleViolated === "UNSUPPORTED_INSTRUCTION")).toBe(true);
    expect(getSolanaClient).not.toHaveBeenCalled();
  });

  it("rejects a wire transaction whose amount differs from the inspected proposal", async () => {
    const wire = makeWire({ amount: 2n });
    const response = await POST(request(bodyFor(wire)));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/amount/);
    expect(getSolanaClient).not.toHaveBeenCalled();
  });

  it("rejects a wire transaction whose recipient was substituted", async () => {
    const wire = makeWire({ recipient: OTHER_RECIPIENT });
    const response = await POST(request(bodyFor(wire)));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/recipient/);
    expect(getSolanaClient).not.toHaveBeenCalled();
  });

  it("rejects a modified signed message", async () => {
    const wire = makeWire();
    const modifiedBytes = Uint8Array.from(getBase64Encoder().encode(wire.signed));
    modifiedBytes[modifiedBytes.length - 1] ^= 1;
    const modified = getBase64Decoder().decode(modifiedBytes);
    const response = await POST(request(bodyFor(wire, { signedWireTransaction: modified })));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/message differs/);
  });

  it("accepts wallet-injected ComputeBudget priority-fee instructions", async () => {
    const wire = makeWire();
    const signedWithPriorityFee = addPriorityFeeInstructions();
    const client = mockClient({
      sendWireTransaction: vi.fn().mockResolvedValue(signatureOf(signedWithPriorityFee))
    });

    const response = await POST(
      request(bodyFor(wire, { signedWireTransaction: signedWithPriorityFee }))
    );

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("CONFIRMED");
    expect(client.simulateSignedWireTransaction).toHaveBeenCalledWith(signedWithPriorityFee);
    expect(client.sendWireTransaction).toHaveBeenCalledWith(signedWithPriorityFee);
    expect(vi.mocked(ExecutionRepository.start)).toHaveBeenCalledWith(
      "ACT-EXECUTE-TEST",
      expect.objectContaining({
        inspectedProgram: "11111111111111111111111111111111",
        instructionType: "SYSTEM_TRANSFER"
      })
    );
  });

  it("rejects a signed transaction from a different fee payer", async () => {
    const wire = makeWire();
    const response = await POST(request(bodyFor(wire, {
      feePayerAddress: OTHER_RECIPIENT
    })));

    expect(response.status).toBe(409);
  });

  it("returns an idempotent result for a previously confirmed action", async () => {
    const wire = makeWire();
    vi.mocked(ExecutionRepository.get).mockResolvedValue({
      status: "CONFIRMED",
      signature: SIGNATURE,
      slot: "41"
    } as never);
    const response = await POST(request(bodyFor(wire)));

    expect(response.status).toBe(200);
    expect((await response.json()).idempotent).toBe(true);
    expect(getSolanaClient).not.toHaveBeenCalled();
  });

  it("refuses to resubmit an unresolved action", async () => {
    const wire = makeWire();
    vi.mocked(ExecutionRepository.get).mockResolvedValue({
      status: "PENDING",
      signature: null
    } as never);
    const response = await POST(request(bodyFor(wire)));

    expect(response.status).toBe(409);
    expect(getSolanaClient).not.toHaveBeenCalled();
  });

  it("does not submit when signed simulation fails", async () => {
    const wire = makeWire();
    const client = mockClient({
      simulateSignedWireTransaction: vi.fn().mockResolvedValue({
        err: { InstructionError: [0, { Custom: 1 }] },
        logs: []
      })
    });
    const response = await POST(request(bodyFor(wire)));

    expect(response.status).toBe(422);
    expect(client.sendWireTransaction).not.toHaveBeenCalled();
    expect(ExecutionRepository.start).not.toHaveBeenCalled();
  });

  it("simulates, submits, confirms, and returns a Devnet Explorer link", async () => {
    const wire = makeWire();
    const client = mockClient({
      sendWireTransaction: vi.fn().mockResolvedValue(wire.signature)
    });
    const response = await POST(request(bodyFor(wire)));

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.status).toBe("CONFIRMED");
    expect(body.signature).toBe(wire.signature);
    expect(body.slot).toBe("42");
    expect(body.explorerUrl).toContain("?cluster=devnet");
    expect(body.explorerUrl).toContain(wire.signature);
    expect(client.simulateSignedWireTransaction).toHaveBeenCalledWith(wire.signed);
    expect(client.sendWireTransaction).toHaveBeenCalledWith(wire.signed);
    expect(vi.mocked(ExecutionRepository.update)).toHaveBeenCalledWith(
      "ACT-EXECUTE-TEST",
      expect.objectContaining({ status: "CONFIRMED" })
    );
  });

  it("reports an on-chain execution failure after confirmation", async () => {
    const wire = makeWire();
    mockClient({
      sendWireTransaction: vi.fn().mockResolvedValue(wire.signature),
      getTransaction: vi.fn().mockResolvedValue({
        signature: wire.signature,
        slot: "42",
        err: { InstructionError: [0, { Custom: 1 }] }
      })
    });
    const response = await POST(request(bodyFor(wire)));

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.status).toBe("FAILED");
    expect(vi.mocked(ExecutionRepository.update)).toHaveBeenCalledWith(
      "ACT-EXECUTE-TEST",
      expect.objectContaining({ status: "FAILED" })
    );
  });

  it("marks a confirmation timeout UNKNOWN and never retries", async () => {
    const wire = makeWire();
    const client = mockClient({
      sendWireTransaction: vi.fn().mockResolvedValue(wire.signature),
      getTransaction: vi.fn().mockResolvedValue(null)
    });
    const response = await POST(request(bodyFor(wire)));

    expect(response.status).toBe(504);
    const body = await response.json();
    expect(body.status).toBe("UNKNOWN");
    expect(client.sendWireTransaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ExecutionRepository.update)).toHaveBeenCalledWith(
      "ACT-EXECUTE-TEST",
      expect.objectContaining({ status: "UNKNOWN" })
    );
  });

  it("detects blockhash expiry on timeout", async () => {
    const wire = makeWire();
    mockClient({
      sendWireTransaction: vi.fn().mockResolvedValue(wire.signature),
      getTransaction: vi.fn().mockResolvedValue(null),
      getBlockHeight: vi.fn().mockResolvedValue(500n)
    });
    const response = await POST(request(bodyFor(wire, { lastValidBlockHeight: "499" })));

    expect(response.status).toBe(504);
    expect((await response.json()).error).toMatch(/expired/);
  });

  it("marks an uncertain submission UNKNOWN when sendTransaction fails", async () => {
    const wire = makeWire();
    const client = mockClient({
      sendWireTransaction: vi.fn().mockRejectedValue(new Error("RPC timeout"))
    });
    const response = await POST(request(bodyFor(wire)));

    expect(response.status).toBe(502);
    expect((await response.json()).status).toBe("UNKNOWN");
    expect(client.sendWireTransaction).toHaveBeenCalledTimes(1);
    expect(client.getTransaction).not.toHaveBeenCalled();
  });

  it("rejects an RPC-returned signature that does not match the signed transaction", async () => {
    const wire = makeWire();
    mockClient({
      sendWireTransaction: vi.fn().mockResolvedValue(SIGNATURE)
    });
    const response = await POST(request(bodyFor(wire)));

    expect(response.status).toBe(502);
    expect((await response.json()).status).toBe("UNKNOWN");
  });

  it("enforces Devnet on the server", async () => {
    process.env.NEXT_PUBLIC_SOLANA_CLUSTER = "mainnet-beta";
    const wire = makeWire();
    const response = await POST(request(bodyFor(wire)));

    expect(response.status).toBe(403);
    expect(getSolanaClient).not.toHaveBeenCalled();
  });
});
