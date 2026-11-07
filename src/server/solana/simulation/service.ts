/**
 * Simulation Service
 *
 * Implements the core Devnet simulation flow for AgentCrashTest:
 *   1. Validate and decode the instruction (via adapter, done by caller)
 *   2. Build a valid unsigned transaction
 *   3. Obtain a recent blockhash from Devnet
 *   4. Simulate the transaction using simulateTransaction RPC
 *   5. Return structured SimulationResult
 *
 * Important separation of concerns:
 *   - SimulationStatus is INDEPENDENT of AuthorizationResult.
 *   - A transaction may PASS simulation and still be UNAUTHORIZED.
 *   - A transaction may be AUTHORIZED and still FAIL simulation.
 *
 * This service never broadcasts or commits transactions.
 */

import { getSolanaClient } from "../client";
import { buildTransactionForSimulation } from "../transactions/builder";
import { DecodedInstruction } from "@/domain/actions/proposal";

/**
 * Four-state simulation outcome — never collapse into a single boolean.
 *
 * SUCCESS         - The simulation executed without error.
 * EXECUTION_FAILED - The transaction was simulated but the program returned an error.
 * RPC_ERROR       - The RPC call itself failed (network, timeout, rate limit, etc.).
 * NOT_RUN         - Simulation was not attempted (unsupported/malformed instruction, etc.).
 */
export type SimulationStatus = "SUCCESS" | "EXECUTION_FAILED" | "RPC_ERROR" | "NOT_RUN";

export interface SimulationResult {
  status: SimulationStatus;
  /** RPC slot at which simulation was evaluated. */
  slot?: string;
  /** Compute units consumed during simulation. */
  unitsConsumed?: string;
  /** Program log output from simulation. */
  logs?: string[];
  /** Raw execution error from the simulated transaction, if any. */
  err?: unknown;
  /** ISO timestamp when simulation was run. */
  timestamp: string;
  /** Wall-clock time for the simulation call in ms. */
  durationMs: number;
  /** Human-readable explanation if NOT_RUN or RPC_ERROR. */
  errorMessage?: string;
}

export class SimulationService {
  /**
   * Simulates a decoded Solana instruction against Devnet.
   *
   * @param decoded - The fully decoded instruction from SolanaInstructionAdapter.
   * @param feePayerOverride - Optional explicit fee payer address (e.g. connected wallet).
   */
  static async simulate(
    decoded: DecodedInstruction,
    feePayerOverride?: string
  ): Promise<SimulationResult> {
    const timestamp = new Date().toISOString();
    const start = performance.now();

    // ── Guard: skip unsimulatable instruction types ───────────────────────────
    if (decoded.instructionType === "MALFORMED") {
      return {
        status: "NOT_RUN",
        timestamp,
        durationMs: 0,
        errorMessage: `Simulation not run: instruction is MALFORMED — ${decoded.decodingError || "unknown decoding error"}`
      };
    }

    if (decoded.instructionType === "UNSUPPORTED" || decoded.instructionType === "CUSTOM_PROGRAM") {
      return {
        status: "NOT_RUN",
        timestamp,
        durationMs: 0,
        errorMessage: `Simulation not run: instruction type '${decoded.instructionType}' is not supported for simulation. Program: ${decoded.programAddress}`
      };
    }

    // ── Build wire transaction ────────────────────────────────────────────────
    const client = getSolanaClient();

    let blockhashInfo: { blockhash: Parameters<typeof buildTransactionForSimulation>[1]["blockhash"]; lastValidBlockHeight: bigint };

    try {
      blockhashInfo = await client.getLatestBlockhash();
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - start);
      return {
        status: "RPC_ERROR",
        timestamp,
        durationMs,
        errorMessage: `Failed to fetch blockhash from Devnet: ${err instanceof Error ? err.message : String(err)}`
      };
    }

    const wireTransaction = buildTransactionForSimulation(decoded, blockhashInfo, feePayerOverride);

    if (!wireTransaction) {
      const durationMs = Math.round(performance.now() - start);
      return {
        status: "NOT_RUN",
        timestamp,
        durationMs,
        errorMessage: `Could not construct transaction for instruction type '${decoded.instructionType}': missing required accounts or amounts`
      };
    }

    // ── Simulate against Devnet ───────────────────────────────────────────────
    try {
      const simResult = await client.simulateWireTransaction(wireTransaction);
      const durationMs = Math.round(performance.now() - start);

      if (simResult.err) {
        return {
          status: "EXECUTION_FAILED",
          slot: simResult.unitsConsumed?.toString(),
          unitsConsumed: simResult.unitsConsumed?.toString(),
          logs: simResult.logs ?? [],
          err: simResult.err,
          timestamp,
          durationMs,
          errorMessage: `Transaction execution failed during simulation: ${JSON.stringify(simResult.err)}`
        };
      }

      return {
        status: "SUCCESS",
        unitsConsumed: simResult.unitsConsumed?.toString(),
        logs: simResult.logs ?? [],
        err: null,
        timestamp,
        durationMs
      };
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - start);
      const message = err instanceof Error ? err.message : String(err);

      return {
        status: "RPC_ERROR",
        timestamp,
        durationMs,
        errorMessage: `Devnet simulation RPC call failed: ${message}`
      };
    }
  }
}
