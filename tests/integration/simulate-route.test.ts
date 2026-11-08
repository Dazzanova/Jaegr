import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Blockhash } from "@solana/kit";

vi.mock("@/server/solana/client", () => ({
  getSolanaClient: vi.fn()
}));

import { POST } from "@/app/api/solana/simulate/route";
import { getSolanaClient } from "@/server/solana/client";

const RECIPIENT = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const BLOCKHASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

const proposal = {
  actionId: "ACT-SIMULATE-TEST",
  actionType: "sol_transfer",
  description: "Simulate a transfer",
  parameters: { recipient: RECIPIENT, lamports: "1000" }
};

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/solana/simulate", {
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
      logs: ["success"],
      unitsConsumed: 150n
    }),
    ...overrides
  };
  vi.mocked(getSolanaClient).mockReturnValue(client as never);
  return client;
}

describe("POST /api/solana/simulate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
  });

  it("returns SUCCESS for a supported instruction", async () => {
    mockClient();
    const response = await POST(request({ proposal }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.simulation.status).toBe("SUCCESS");
    expect(body.simulation.unitsConsumed).toBe("150");
  });

  it("returns NOT_RUN for a malformed instruction without calling RPC", async () => {
    const response = await POST(request({
      proposal: { ...proposal, parameters: { recipient: undefined, lamports: undefined } }
    }));
    const body = await response.json();
    expect(body.simulation.status).toBe("NOT_RUN");
    expect(getSolanaClient).not.toHaveBeenCalled();
  });

  it("returns NOT_RUN for an unsupported program without calling RPC", async () => {
    const response = await POST(request({
      proposal: {
        actionId: "ACT-UNSUPPORTED",
        actionType: "program_interaction",
        description: "Rogue program",
        parameters: { programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" }
      }
    }));
    const body = await response.json();
    expect(body.simulation.status).toBe("NOT_RUN");
    expect(getSolanaClient).not.toHaveBeenCalled();
  });

  it("returns RPC_ERROR when the RPC call fails", async () => {
    mockClient({
      simulateWireTransaction: vi.fn().mockRejectedValue(new Error("rate limit exceeded"))
    });
    const response = await POST(request({ proposal }));
    const body = await response.json();
    expect(body.simulation.status).toBe("RPC_ERROR");
    expect(body.simulation.errorMessage).toMatch(/rate limit/);
  });

  it("rejects non-Devnet configuration", async () => {
    process.env.NEXT_PUBLIC_SOLANA_CLUSTER = "mainnet-beta";
    const response = await POST(request({ proposal }));
    expect(response.status).toBe(403);
    expect(getSolanaClient).not.toHaveBeenCalled();
    delete process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
  });
});
