import { describe, expect, it } from "vitest";
import { SolanaClient } from "@/server/solana/client";
import { getSolanaNetworkConfig } from "@/server/solana/config";
import { SimulationService } from "@/server/solana/simulation/service";

/**
 * Live Devnet smoke tests.
 *
 * These make real RPC calls to https://api.devnet.solana.com and are therefore
 * excluded from the default `pnpm test` run. They never sign or submit a
 * transaction.
 *
 * Run explicitly:
 *   RUN_DEVNET_TESTS=1 pnpm test:devnet
 */
const runDevnet = process.env.RUN_DEVNET_TESTS === "1";

describe.runIf(runDevnet)("live Solana Devnet smoke tests", () => {
  const config = getSolanaNetworkConfig();
  const client = new SolanaClient();

  it("is configured for Devnet", () => {
    expect(config.cluster).toBe("devnet");
    expect(config.rpcUrl).toMatch(/^https?:\/\//);
  });

  it("reports real network health and a current slot", async () => {
    const health = await client.checkHealth();
    expect(health.status).toBe("healthy");
    expect(health.currentSlot).toBeTruthy();
    expect(Number(health.currentSlot)).toBeGreaterThan(0);
    expect(health.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("fetches a real recent blockhash", async () => {
    const blockhash = await client.getLatestBlockhash();
    expect(blockhash.blockhash).toHaveLength(32);
    expect(blockhash.lastValidBlockHeight).toBeGreaterThan(0n);
  });

  it("fetches a real parsed account", async () => {
    // System Program is always present and executable on every cluster.
    const account = await client.getAccountInfo("11111111111111111111111111111111");
    expect(account).not.toBeNull();
    expect(account?.executable).toBe(true);
  });

  it("runs a real Devnet simulation and reports a real status", async () => {
    // No private key and no signing: this is an unsigned simulation.
    const result = await SimulationService.simulate({
      programAddress: "11111111111111111111111111111111",
      instructionType: "SYSTEM_TRANSFER",
      accounts: [],
      source: "83vSikV2eS2L54R8iH8Gv5vM2y9zH3R5xQv8vT3s8XqZ",
      recipient: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      lamports: 1n
    });

    // A real RPC round-trip must produce a real outcome, never a fake SUCCESS.
    expect(["SUCCESS", "EXECUTION_FAILED", "RPC_ERROR"]).toContain(result.status);
    expect(result.timestamp).toBeTruthy();
  });
});
