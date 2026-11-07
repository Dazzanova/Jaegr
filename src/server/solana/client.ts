import {
  createSolanaRpc,
  address,
  type Blockhash,
  type Base64EncodedWireTransaction
} from "@solana/kit";
import { getSolanaNetworkConfig, SolanaNetworkConfig } from "./config";

export interface NetworkHealthStatus {
  status: "healthy" | "degraded" | "unreachable";
  cluster: string;
  rpcUrl: string;
  currentSlot: string | null;
  responseTimeMs: number;
  lastCheckedAt: string;
  error?: string;
}

export interface AccountDetails {
  address: string;
  lamports: string;
  executable: boolean;
  owner: string;
  dataLength: number;
}

export interface TransactionDetails {
  signature: string;
  slot: string;
  blockTime?: number | null;
  err: unknown;
  memo?: string | null;
  fee?: string;
}

export class SolanaClient {
  private rpc;
  private config: SolanaNetworkConfig;

  constructor(config?: Partial<SolanaNetworkConfig>) {
    this.config = { ...getSolanaNetworkConfig(), ...config };
    this.rpc = createSolanaRpc(this.config.rpcUrl);
  }

  getConfig(): SolanaNetworkConfig {
    return this.config;
  }

  /**
   * Health check and current slot lookup with response time measurement.
   */
  async checkHealth(): Promise<NetworkHealthStatus> {
    const start = performance.now();
    const lastCheckedAt = new Date().toISOString();

    try {
      // getSlot acts as the primary health and liveness indicator
      const slot = await Promise.race([
        this.rpc.getSlot().send(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("RPC request timed out after 8000ms")), 8000)
        )
      ]);

      const responseTimeMs = Math.round(performance.now() - start);

      return {
        status: "healthy",
        cluster: this.config.cluster,
        rpcUrl: this.config.rpcUrl,
        currentSlot: slot.toString(),
        responseTimeMs,
        lastCheckedAt
      };
    } catch (err: unknown) {
      const responseTimeMs = Math.round(performance.now() - start);
      const message = err instanceof Error ? err.message : String(err);

      return {
        status: "unreachable",
        cluster: this.config.cluster,
        rpcUrl: this.config.rpcUrl,
        currentSlot: null,
        responseTimeMs,
        lastCheckedAt,
        error: message
      };
    }
  }

  /**
   * Fetches native SOL balance in integer Lamports for a given Base58 address.
   */
  async getBalance(targetAddress: string): Promise<bigint> {
    const addr = address(targetAddress);
    const response = await this.rpc.getBalance(addr, {
      commitment: this.config.commitment
    }).send();

    return response.value;
  }

  /**
   * Fetches account details from Devnet.
   * Note: rentEpoch was removed from the Kit v8 account info response type.
   */
  async getAccountInfo(targetAddress: string): Promise<AccountDetails | null> {
    const addr = address(targetAddress);
    const response = await this.rpc.getAccountInfo(addr, {
      encoding: "base64",
      commitment: this.config.commitment
    }).send();

    if (!response.value) {
      return null;
    }

    const val = response.value;
    const dataLen = Array.isArray(val.data)
      ? Buffer.from(val.data[0], "base64").length
      : 0;

    return {
      address: targetAddress,
      lamports: val.lamports.toString(),
      executable: val.executable,
      owner: val.owner,
      dataLength: dataLen
    };
  }

  /**
   * Fetches current recent blockhash from Devnet.
   * Returns the properly branded Blockhash type for use in transaction building.
   */
  async getLatestBlockhash(): Promise<{ blockhash: Blockhash; lastValidBlockHeight: bigint }> {
    const response = await this.rpc.getLatestBlockhash({
      commitment: this.config.commitment
    }).send();

    return {
      blockhash: response.value.blockhash,
      lastValidBlockHeight: response.value.lastValidBlockHeight
    };
  }

  /**
   * Simulates an unsigned wire transaction against Devnet RPC.
   * Uses replaceRecentBlockhash and sigVerify:false so signatures are not checked.
   * This allows simulation of unsigned proposals.
   */
  async simulateWireTransaction(wireTransactionBase64: string) {
    const response = await this.rpc.simulateTransaction(
      wireTransactionBase64 as Base64EncodedWireTransaction,
      {
        encoding: "base64",
        commitment: this.config.commitment,
        replaceRecentBlockhash: true,
        sigVerify: false
      }
    ).send();

    return response.value;
  }

  /**
   * Submits a signed wire transaction to Devnet RPC.
   * Only call this after explicit user approval.
   */
  async sendWireTransaction(signedWireTransactionBase64: string): Promise<string> {
    const response = await this.rpc.sendTransaction(
      signedWireTransactionBase64 as Base64EncodedWireTransaction,
      {
        encoding: "base64",
        preflightCommitment: this.config.commitment,
        skipPreflight: false,
        maxRetries: 3n
      }
    ).send();

    return response;
  }

  /**
   * Fetches confirmed transaction details by signature.
   * blockTime is returned as a number (seconds since Unix epoch).
   */
  async getTransaction(signature: string): Promise<TransactionDetails | null> {
    try {
      const response = await this.rpc.getTransaction(
        signature as Parameters<typeof this.rpc.getTransaction>[0],
        {
          commitment: this.config.commitment,
          encoding: "json",
          maxSupportedTransactionVersion: 0
        }
      ).send();

      if (!response) {
        return null;
      }

      return {
        signature,
        slot: response.slot.toString(),
        // UnixTimestamp is a branded bigint; Number() is safe for timestamp values
        blockTime: response.blockTime !== null && response.blockTime !== undefined
          ? Number(response.blockTime)
          : null,
        err: response.meta?.err ?? null,
        fee: response.meta?.fee?.toString()
      };
    } catch {
      return null;
    }
  }
}

// Singleton client instance for server-side use
let globalClient: SolanaClient | null = null;

export function getSolanaClient(): SolanaClient {
  if (!globalClient) {
    globalClient = new SolanaClient();
  }
  return globalClient;
}
