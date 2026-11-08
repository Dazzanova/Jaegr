import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Blockhash } from "@solana/kit";

vi.mock("@/server/solana/client", () => ({
  getSolanaClient: vi.fn()
}));

import { POST } from "@/app/api/solana/prepare/route";
import { getSolanaClient } from "@/server/solana/client";
import { decodeWireTransaction } from "@/server/solana/transactions/decoder";

const FEE_PAYER = "83vSikV2eS2L54R8iH8Gv5vM2y9zH3R5xQv8vT3s8XqZ";
const RECIPIENT = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const OTHER_RECIPIENT = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const BLOCKHASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

const proposal = {
  actionId: "ACT-PREPARE-TEST",
  actionType: "sol_transfer",
  description: "Prepare a 0.000000001 SOL transfer",
  parameters: { recipient: RECIPIENT, lamports: "1" }
};

const mandate = {
  id: "m-prepare",
  name: "Preparation test mandate",
  maxLamportsPerAction: "10",
  allowedRecipients: [RECIPIENT],
  allowedPrograms: ["11111111111111111111111111111111"],
  permittedActionTypes: ["sol_transfer"],
  seenActionIds: []
};

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/solana/prepare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function mockClient(overrides: Record<string, unknown> = {}) {
  const client = {
    getLatestBlockhash: vi.fn().mockResolvedValue({
      blockhash: BLOCKHASH as Blockhash,
      lastValidBlockHeight: 900n
    }),
    simulateWireTransaction: vi.fn().mockResolvedValue({
      err: null,
      logs: ["Program 11111111111111111111111111111111 success"],
      unitsConsumed: 150n
    }),
    ...overrides
  };
  vi.mocked(getSolanaClient).mockReturnValue(client as never);
  return client;
}

describe("POST /api/solana/prepare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
  });

  it("refuses to prepare an unauthorized transaction without RPC access", async () => {
    const response = await POST(request({
      proposal,
      mandate: { ...mandate, allowedRecipients: [OTHER_RECIPIENT] },
      feePayerAddress: FEE_PAYER
    }));

    expect(response.status).toBe(403);
    expect(getSolanaClient).not.toHaveBeenCalled();
  });

  it("is Devnet-only on the server", async () => {
    process.env.NEXT_PUBLIC_SOLANA_CLUSTER = "mainnet-beta";
    const response = await POST(request({ proposal, mandate, feePayerAddress: FEE_PAYER }));

    expect(response.status).toBe(403);
    expect(getSolanaClient).not.toHaveBeenCalled();
    delete process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
  });

  it("builds an unsigned wire transaction that decodes to the inspected instruction", async () => {
    mockClient();
    const response = await POST(request({ proposal, mandate, feePayerAddress: FEE_PAYER }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.authorization.allowed).toBe(true);
    expect(body.simulation.status).toBe("SUCCESS");
    expect(body.simulation.unitsConsumed).toBe("150");
    expect(body.lastValidBlockHeight).toBe("900");

    const decoded = decodeWireTransaction(body.unsignedWireTransaction);
    expect(decoded.feePayer).toBe(FEE_PAYER);
    expect(decoded.instructions).toHaveLength(1);
    expect(decoded.instructions[0]).toMatchObject({
      instructionType: "SYSTEM_TRANSFER",
      recipient: RECIPIENT,
      source: FEE_PAYER,
      lamports: 1n
    });
  });

  it("returns an explicit simulation RPC_ERROR without claiming success", async () => {
    mockClient({
      simulateWireTransaction: vi.fn().mockRejectedValue(new Error("RPC timeout"))
    });
    const response = await POST(request({ proposal, mandate, feePayerAddress: FEE_PAYER }));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.simulation.status).toBe("RPC_ERROR");
    expect(body.simulation.errorMessage).toMatch(/RPC timeout/);
    expect(body.authorization.allowed).toBe(true);
  });

  it("returns 502 when the blockhash RPC call fails", async () => {
    mockClient({
      getLatestBlockhash: vi.fn().mockRejectedValue(new Error("getLatestBlockhash timed out"))
    });
    const response = await POST(request({ proposal, mandate, feePayerAddress: FEE_PAYER }));

    expect(response.status).toBe(502);
    expect(getSolanaClient).toHaveBeenCalled();
  });

  it("rejects malformed request bodies", async () => {
    const response = await POST(request({ proposal, mandate }));
    expect(response.status).toBe(400);
  });
});
