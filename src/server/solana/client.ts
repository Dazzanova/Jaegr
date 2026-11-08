import {
  createSolanaRpc,
  address,
  type Blockhash,
  type Base64EncodedWireTransaction
} from "@solana/kit";
import { getSolanaNetworkConfig, getSolanaRpcTimeoutMs, SolanaNetworkConfig } from "./config";

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

/**
 * Races an RPC promise against a timeout. RPC calls must never hang a request
 * handler indefinitely; a timeout is surfaced as a normal RPC error.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs
    );

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function assertNonNegativeBigInt(value: unknown, label: string): bigint {
  if (typeof value !== "bigint" || value < 0n) {
    throw new Error(`Malformed ${label} response from RPC`);
  }
  return value;
}

export class SolanaClient {
  private rpc;
  private config: SolanaNetworkConfig;
  private timeoutMs: number;

  constructor(config?: Partial<SolanaNetworkConfig>) {
    this.config = { ...getSolanaNetworkConfig(), ...config };
    this.rpc = createSolanaRpc(this.config.rpcUrl);
    this.timeoutMs = getSolanaRpcTimeoutMs();
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
      const slot = await withTimeout(this.rpc.getSlot().send(), this.timeoutMs, "getSlot");
      const responseTimeMs = Math.round(performance.now() - start);

      if (slot === undefined || slot === null) {
        throw new Error("Malformed getSlot response from RPC");
      }

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
    const response = await withTimeout(
      this.rpc.getBalance(addr, { commitment: this.config.commitment }).send(),
      this.timeoutMs,
      "getBalance"
    );

    return assertNonNegativeBigInt(response?.value, "getBalance");
  }

  /**
   * Fetches account details from Devnet.
   * Note: rentEpoch was removed from the Kit v8 account info response type.
   */
  async getAccountInfo(targetAddress: string): Promise<AccountDetails | null> {
    const addr = address(targetAddress);
    const response = await withTimeout(
      this.rpc.getAccountInfo(addr, {
        encoding: "base64",
        commitment: this.config.commitment
      }).send(),
      this.timeoutMs,
      "getAccountInfo"
    );

    if (!response || response.value === null || response.value === undefined) {
      return null;
    }

    const val = response.value;
    if (typeof val.lamports !== "bigint" || typeof val.owner !== "string") {
      throw new Error("Malformed getAccountInfo response from RPC");
    }

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
    const response = await withTimeout(
      this.rpc.getLatestBlockhash({ commitment: this.config.commitment }).send(),
      this.timeoutMs,
      "getLatestBlockhash"
    );

    if (!response?.value?.blockhash || typeof response.value.lastValidBlockHeight !== "bigint") {
      throw new Error("Malformed getLatestBlockhash response from RPC");
    }

    return {
      blockhash: response.value.blockhash,
      lastValidBlockHeight: response.value.lastValidBlockHeight
    };
  }

  /** Fetches the current confirmed block height, used to detect blockhash expiry. */
  async getBlockHeight(): Promise<bigint> {
    const response = await withTimeout(
      this.rpc.getBlockHeight({ commitment: this.config.commitment }).send(),
      this.timeoutMs,
      "getBlockHeight"
    );

    return assertNonNegativeBigInt(response, "getBlockHeight");
  }

  /**
   * Simulates an unsigned wire transaction against Devnet RPC.
   * Uses replaceRecentBlockhash and sigVerify:false so signatures are not checked.
   * This allows simulation of unsigned proposals. It never broadcasts.
   */
  async simulateWireTransaction(wireTransactionBase64: string) {
    const response = await withTimeout(
      this.rpc.simulateTransaction(
        wireTransactionBase64 as Base64EncodedWireTransaction,
        {
          encoding: "base64",
          commitment: this.config.commitment,
          replaceRecentBlockhash: true,
          sigVerify: false
        }
      ).send(),
      this.timeoutMs,
      "simulateTransaction"
    );

    if (!response || response.value === undefined || response.value === null) {
      throw new Error("Malformed simulateTransaction response from RPC");
    }

    return response.value;
  }

  /**
   * Simulates the exact wallet-signed wire transaction with signature checks enabled.
   * Never broadcasts.
   */
  async simulateSignedWireTransaction(signedWireTransactionBase64: string) {
    const response = await withTimeout(
      this.rpc.simulateTransaction(
        signedWireTransactionBase64 as Base64EncodedWireTransaction,
        {
          encoding: "base64",
          commitment: this.config.commitment,
          replaceRecentBlockhash: false,
          sigVerify: true
        }
      ).send(),
      this.timeoutMs,
      "simulateTransaction(signed)"
    );

    if (!response || response.value === undefined || response.value === null) {
      throw new Error("Malformed simulateTransaction response from RPC");
    }

    return response.value;
  }

  /**
   * Submits a signed wire transaction to Devnet RPC.
   * Only call this after explicit user approval and server-side re-validation.
   */
  async sendWireTransaction(signedWireTransactionBase64: string): Promise<string> {
    const response = await withTimeout(
      this.rpc.sendTransaction(
        signedWireTransactionBase64 as Base64EncodedWireTransaction,
        {
          encoding: "base64",
          preflightCommitment: this.config.commitment,
          skipPreflight: false,
          maxRetries: 3n
        }
      ).send(),
      this.timeoutMs,
      "sendTransaction"
    );

    if (typeof response !== "string" || response.length === 0) {
      throw new Error("Malformed sendTransaction response from RPC");
    }

    return response;
  }

  /**
   * Fetches confirmed transaction details by signature.
   * Returns null when the transaction is not yet visible at the configured
   * commitment. RPC failures are propagated so callers can distinguish
   * "not found yet" from "RPC unavailable".
   */
  async getTransaction(signature: string): Promise<TransactionDetails | null> {
    const response = await withTimeout(
      this.rpc.getTransaction(
        signature as Parameters<typeof this.rpc.getTransaction>[0],
        {
          commitment: this.config.commitment,
          encoding: "json",
          maxSupportedTransactionVersion: 0
        }
      ).send(),
      this.timeoutMs,
      "getTransaction"
    );

    if (!response) {
      return null;
    }

    if (response.slot === undefined || response.slot === null) {
      throw new Error("Malformed getTransaction response from RPC");
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
