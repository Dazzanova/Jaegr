export interface SolanaNetworkConfig {
  cluster: "devnet" | "testnet" | "mainnet-beta" | "localnet";
  rpcUrl: string;
  wsUrl?: string;
  commitment: "confirmed" | "finalized" | "processed";
  explorerBaseUrl: string;
}

export function getSolanaNetworkConfig(): SolanaNetworkConfig {
  const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet") as SolanaNetworkConfig["cluster"];
  const rpcUrl = process.env.SOLANA_DEVNET_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

  return {
    cluster,
    rpcUrl,
    commitment: "confirmed",
    explorerBaseUrl: `https://explorer.solana.com`
  };
}

export function getSolanaExplorerUrl(signature: string, cluster = "devnet"): string {
  const clusterParam = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
  return `https://explorer.solana.com/tx/${signature}${clusterParam}`;
}

export function getSolanaAddressExplorerUrl(address: string, cluster = "devnet"): string {
  const clusterParam = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
  return `https://explorer.solana.com/address/${address}${clusterParam}`;
}
