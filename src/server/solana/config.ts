import { z } from "zod";

export const solanaClusterSchema = z.enum(["devnet", "testnet", "mainnet-beta", "localnet"]);

export type SolanaCluster = z.infer<typeof solanaClusterSchema>;

export interface SolanaNetworkConfig {
  cluster: SolanaCluster;
  rpcUrl: string;
  wsUrl?: string;
  commitment: "confirmed" | "finalized" | "processed";
  explorerBaseUrl: string;
}

const DEFAULT_DEVNET_RPC_URL = "https://api.devnet.solana.com";
const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * Returns the configured RPC request timeout in milliseconds.
 * Invalid or non-positive values fail back to the safe default.
 */
export function getSolanaRpcTimeoutMs(): number {
  const raw = process.env.SOLANA_RPC_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function validateRpcUrl(rpcUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rpcUrl);
  } catch {
    throw new Error(`Invalid Solana RPC URL: '${rpcUrl}' is not a valid absolute URL`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Invalid Solana RPC URL: protocol '${parsed.protocol}' is not supported`);
  }

  return rpcUrl;
}

/**
 * Resolves network configuration from environment variables.
 *
 * Fail-closed behaviour: an unrecognised cluster name or malformed RPC URL
 * throws instead of silently falling back to a network the operator did not
 * intend to use.
 */
export function getSolanaNetworkConfig(): SolanaNetworkConfig {
  const rawCluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  const clusterResult = solanaClusterSchema.safeParse(rawCluster);
  if (!clusterResult.success) {
    throw new Error(
      `Invalid NEXT_PUBLIC_SOLANA_CLUSTER '${rawCluster}'. Expected one of: ${solanaClusterSchema.options.join(", ")}`
    );
  }

  const rpcUrl = validateRpcUrl(
    process.env.SOLANA_DEVNET_RPC_URL ||
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      DEFAULT_DEVNET_RPC_URL
  );

  return {
    cluster: clusterResult.data,
    rpcUrl,
    commitment: "confirmed",
    explorerBaseUrl: "https://explorer.solana.com"
  };
}

/** Thrown when a transaction-related operation is attempted outside Devnet. */
export class NonDevnetOperationError extends Error {
  constructor(cluster: string) {
    super(`Transaction operations are Devnet-only. Active cluster: '${cluster}'.`);
    this.name = "NonDevnetOperationError";
  }
}

/** True when the environment is configured for Devnet. Never throws. */
export function isDevnetConfigured(): boolean {
  try {
    return getSolanaNetworkConfig().cluster === "devnet";
  } catch {
    return false;
  }
}

/** Asserts that the active cluster is Devnet before signing/simulating/submitting. */
export function assertDevnetCluster(): SolanaNetworkConfig {
  const config = getSolanaNetworkConfig();
  if (config.cluster !== "devnet") {
    throw new NonDevnetOperationError(config.cluster);
  }
  return config;
}

export function getSolanaExplorerUrl(signature: string, cluster = "devnet"): string {
  const clusterParam = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
  return `https://explorer.solana.com/tx/${signature}${clusterParam}`;
}

export function getSolanaAddressExplorerUrl(address: string, cluster = "devnet"): string {
  const clusterParam = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
  return `https://explorer.solana.com/address/${address}${clusterParam}`;
}
