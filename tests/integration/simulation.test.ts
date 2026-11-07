import { describe, it, expect, vi, beforeEach } from "vitest";
import { SimulationService } from "@/server/solana/simulation/service";
import { DecodedInstruction } from "@/domain/actions/proposal";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

/**
 * Simulation Service Integration Tests
 *
 * These tests use mocked RPC responses to remain fully deterministic.
 * No live Devnet RPC calls are made.
 *
 * The live Devnet integration test suite is opt-in via:
 *   pnpm test:devnet (not part of default CI)
 */

// Mock the Solana client module
vi.mock("@/server/solana/client", () => ({
  getSolanaClient: vi.fn()
}));

import { getSolanaClient } from "@/server/solana/client";

const MOCK_BLOCKHASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const MOCK_LAST_VALID_BLOCK_HEIGHT = 300_000_000n;

// Use unknown-first cast to avoid partial-implementation type errors with SolanaClient mock
type PartialSolanaClient = Pick<import("@/server/solana/client").SolanaClient, "getLatestBlockhash" | "simulateWireTransaction">;

function makeMockClient(options: {
  blockhashError?: boolean;
  simulationError?: boolean;
  simulationExecError?: boolean;
}): PartialSolanaClient {
  return {
    getLatestBlockhash: options.blockhashError
      ? vi.fn().mockRejectedValue(new Error("RPC timeout: failed to fetch blockhash"))
      : vi.fn().mockResolvedValue({
          blockhash: MOCK_BLOCKHASH,
          lastValidBlockHeight: MOCK_LAST_VALID_BLOCK_HEIGHT
        }),
    simulateWireTransaction: options.simulationError
      ? vi.fn().mockRejectedValue(new Error("RPC error: rate limit exceeded"))
      : options.simulationExecError
      ? vi.fn().mockResolvedValue({
          err: { InstructionError: [0, { Custom: 1 }] },
          logs: ["Program 11111111111111111111111111111111 invoke [1]", "Transfer: insufficient lamports"],
          unitsConsumed: 450n
        })
      : vi.fn().mockResolvedValue({
          err: null,
          logs: [
            "Program 11111111111111111111111111111111 invoke [1]",
            "Program 11111111111111111111111111111111 success"
          ],
          unitsConsumed: 150n
        })
  };
}

describe("SimulationService — deterministic mocked tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── NOT_RUN cases ──────────────────────────────────────────────────────────

  it("returns NOT_RUN for MALFORMED instruction", async () => {
    const decoded: DecodedInstruction = {
      programAddress: SYSTEM_PROGRAM_ADDRESS,
      instructionType: "MALFORMED",
      accounts: [],
      decodingError: "Missing required fields"
    };

    const result = await SimulationService.simulate(decoded);
    expect(result.status).toBe("NOT_RUN");
    expect(result.errorMessage).toContain("MALFORMED");
    expect(result.durationMs).toBe(0);
  });

  it("returns NOT_RUN for UNSUPPORTED instruction", async () => {
    const decoded: DecodedInstruction = {
      programAddress: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
      instructionType: "UNSUPPORTED",
      accounts: []
    };

    const result = await SimulationService.simulate(decoded);
    expect(result.status).toBe("NOT_RUN");
    expect(result.errorMessage).toContain("UNSUPPORTED");
  });

  it("returns NOT_RUN for CUSTOM_PROGRAM instruction", async () => {
    const decoded: DecodedInstruction = {
      programAddress: "CustomProgramXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      instructionType: "CUSTOM_PROGRAM",
      accounts: []
    };

    const result = await SimulationService.simulate(decoded);
    expect(result.status).toBe("NOT_RUN");
  });

  // ── RPC_ERROR cases ────────────────────────────────────────────────────────

  it("returns RPC_ERROR when blockhash fetch fails", async () => {
    vi.mocked(getSolanaClient).mockReturnValue(makeMockClient({ blockhashError: true }) as unknown as ReturnType<typeof getSolanaClient>);

    const decoded: DecodedInstruction = {
      programAddress: SYSTEM_PROGRAM_ADDRESS,
      instructionType: "SYSTEM_TRANSFER",
      accounts: [],
      source: "83vSikV2eS2L54R8iH8Gv5vM2y9zH3R5xQv8vT3s8XqZ",
      recipient: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      lamports: 1_000_000n
    };

    const result = await SimulationService.simulate(decoded);
    expect(result.status).toBe("RPC_ERROR");
    expect(result.errorMessage).toContain("blockhash");
  });

  it("returns RPC_ERROR when simulateTransaction RPC call fails", async () => {
    vi.mocked(getSolanaClient).mockReturnValue(makeMockClient({ simulationError: true }) as unknown as ReturnType<typeof getSolanaClient>);

    const decoded: DecodedInstruction = {
      programAddress: SYSTEM_PROGRAM_ADDRESS,
      instructionType: "SYSTEM_TRANSFER",
      accounts: [],
      source: "83vSikV2eS2L54R8iH8Gv5vM2y9zH3R5xQv8vT3s8XqZ",
      recipient: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      lamports: 1_000_000n
    };

    const result = await SimulationService.simulate(decoded);
    expect(result.status).toBe("RPC_ERROR");
    expect(result.errorMessage).toContain("rate limit");
  });

  // ── SUCCESS cases ──────────────────────────────────────────────────────────

  it("returns SUCCESS for a valid SYSTEM_TRANSFER simulation", async () => {
    vi.mocked(getSolanaClient).mockReturnValue(makeMockClient({}) as unknown as ReturnType<typeof getSolanaClient>);

    const decoded: DecodedInstruction = {
      programAddress: SYSTEM_PROGRAM_ADDRESS,
      instructionType: "SYSTEM_TRANSFER",
      accounts: [],
      source: "83vSikV2eS2L54R8iH8Gv5vM2y9zH3R5xQv8vT3s8XqZ",
      recipient: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      lamports: 50_000_000n
    };

    const result = await SimulationService.simulate(decoded);
    expect(result.status).toBe("SUCCESS");
    expect(result.logs).toBeDefined();
    expect(result.logs!.length).toBeGreaterThan(0);
    expect(result.unitsConsumed).toBe("150");
    expect(result.err).toBeNull();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toBeTruthy();
  });

  it("returns SUCCESS for TOKEN_TRANSFER_CHECKED simulation", async () => {
    vi.mocked(getSolanaClient).mockReturnValue(makeMockClient({}) as unknown as ReturnType<typeof getSolanaClient>);

    // Use addresses that are valid 32-byte public keys and are NOT program addresses.
    // The Token Program address cannot be used as a token account destination —
    // Kit's compileTransaction correctly rejects that (address is both program and writable).
    const decoded: DecodedInstruction = {
      programAddress: TOKEN_PROGRAM_ADDRESS,
      instructionType: "TOKEN_TRANSFER_CHECKED",
      accounts: [],
      source: "7UX2i7SucgLMQcfZ75s3VXmZZY4YRUyJN9X1RgfMoDUi",
      // Destination: use a non-program wallet address
      recipient: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      tokenMint: "So11111111111111111111111111111111111111112",
      authority: "83vSikV2eS2L54R8iH8Gv5vM2y9zH3R5xQv8vT3s8XqZ",
      tokenAmount: 100_000_000n,
      tokenDecimals: 9
    };

    const result = await SimulationService.simulate(decoded);
    expect(result.status).toBe("SUCCESS");
  });

  // ── EXECUTION_FAILED cases ─────────────────────────────────────────────────

  it("returns EXECUTION_FAILED when program returns an error during simulation", async () => {
    vi.mocked(getSolanaClient).mockReturnValue(makeMockClient({ simulationExecError: true }) as unknown as ReturnType<typeof getSolanaClient>);

    const decoded: DecodedInstruction = {
      programAddress: SYSTEM_PROGRAM_ADDRESS,
      instructionType: "SYSTEM_TRANSFER",
      accounts: [],
      source: "83vSikV2eS2L54R8iH8Gv5vM2y9zH3R5xQv8vT3s8XqZ",
      recipient: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      lamports: 999_999_999_999n // Amount higher than any real balance
    };

    const result = await SimulationService.simulate(decoded);
    expect(result.status).toBe("EXECUTION_FAILED");
    expect(result.err).toBeDefined();
    expect(result.err).not.toBeNull();
    expect(result.logs).toBeDefined();
    expect(result.errorMessage).toContain("simulation");
  });

  // ── Separation of concerns assertion ─────────────────────────────────────

  it("confirms: simulation SUCCESS and authorization are independent (a blocked tx may simulate successfully)", async () => {
    vi.mocked(getSolanaClient).mockReturnValue(makeMockClient({}) as unknown as ReturnType<typeof getSolanaClient>);

    // This decoded instruction simulates successfully
    const decoded: DecodedInstruction = {
      programAddress: SYSTEM_PROGRAM_ADDRESS,
      instructionType: "SYSTEM_TRANSFER",
      accounts: [],
      source: "83vSikV2eS2L54R8iH8Gv5vM2y9zH3R5xQv8vT3s8XqZ",
      // Recipient is ATTACKER — policy would block this
      recipient: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      lamports: 50_000_000n
    };

    const simResult = await SimulationService.simulate(decoded);
    // Simulation is infrastructure-level only, not a security check
    expect(simResult.status).toBe("SUCCESS");

    // Policy must block it independently
    const { evaluateTransactionPolicy } = await import("@/domain/evaluation/evaluator");
    const { authorizationMandateSchema } = await import("@/domain/mandates/mandate");
    const mandate = authorizationMandateSchema.parse({
      id: "m1",
      name: "Test",
      maxLamportsPerAction: "100000000",
      allowedRecipients: ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"],
      allowedPrograms: [SYSTEM_PROGRAM_ADDRESS],
      permittedActionTypes: ["sol_transfer"]
    });
    const proposal = {
      actionId: "test-indep",
      actionType: "sol_transfer",
      description: "Send to attacker",
      parameters: { recipient: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", lamports: "50000000" }
    };
    const policyReport = evaluateTransactionPolicy(mandate, proposal, decoded);
    expect(policyReport.allowed).toBe(false);
    expect(policyReport.findings.some(f => f.ruleViolated === "RECIPIENT_NOT_ALLOWLISTED")).toBe(true);
  });
});
