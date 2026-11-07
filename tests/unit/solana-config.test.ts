import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getSolanaNetworkConfig,
  getSolanaExplorerUrl,
  getSolanaAddressExplorerUrl
} from "@/server/solana/config";

describe("Solana Network Configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("defaults to devnet cluster when no env vars are set", () => {
    delete process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
    delete process.env.SOLANA_DEVNET_RPC_URL;
    delete process.env.NEXT_PUBLIC_SOLANA_RPC_URL;

    const config = getSolanaNetworkConfig();
    expect(config.cluster).toBe("devnet");
    expect(config.rpcUrl).toBe("https://api.devnet.solana.com");
    expect(config.commitment).toBe("confirmed");
    expect(config.explorerBaseUrl).toBe("https://explorer.solana.com");
  });

  it("uses NEXT_PUBLIC_SOLANA_CLUSTER env var for cluster", () => {
    process.env.NEXT_PUBLIC_SOLANA_CLUSTER = "testnet";
    const config = getSolanaNetworkConfig();
    expect(config.cluster).toBe("testnet");
  });

  it("uses SOLANA_DEVNET_RPC_URL env var for RPC endpoint", () => {
    process.env.SOLANA_DEVNET_RPC_URL = "https://my-custom-rpc.example.com";
    const config = getSolanaNetworkConfig();
    expect(config.rpcUrl).toBe("https://my-custom-rpc.example.com");
  });

  it("falls back to NEXT_PUBLIC_SOLANA_RPC_URL if SOLANA_DEVNET_RPC_URL is not set", () => {
    delete process.env.SOLANA_DEVNET_RPC_URL;
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL = "https://public-rpc.example.com";
    const config = getSolanaNetworkConfig();
    expect(config.rpcUrl).toBe("https://public-rpc.example.com");
  });

  it("SOLANA_DEVNET_RPC_URL takes priority over NEXT_PUBLIC_SOLANA_RPC_URL", () => {
    process.env.SOLANA_DEVNET_RPC_URL = "https://primary-rpc.example.com";
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL = "https://secondary-rpc.example.com";
    const config = getSolanaNetworkConfig();
    expect(config.rpcUrl).toBe("https://primary-rpc.example.com");
  });
});

describe("Solana Explorer URL Generation", () => {
  it("generates correct Devnet transaction explorer URL", () => {
    const sig = "5KtPn3TXBMFXkNTGy5QkqriofhzFm4QjKtXhfZKrN8dqRYnMBqC1VnGV1SyvMJGNuNnFEt1oqBTFUX2LNjZeQCn";
    const url = getSolanaExplorerUrl(sig, "devnet");
    expect(url).toBe(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  });

  it("generates mainnet URL without cluster param", () => {
    const sig = "5KtPn3TXBMFXkNTGy5QkqriofhzFm4QjKtXhfZKrN8dqRYnMBqC1VnGV1SyvMJGNuNnFEt1oqBTFUX2LNjZeQCn";
    const url = getSolanaExplorerUrl(sig, "mainnet-beta");
    expect(url).toBe(`https://explorer.solana.com/tx/${sig}`);
  });

  it("generates correct Devnet address explorer URL", () => {
    const addr = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    const url = getSolanaAddressExplorerUrl(addr, "devnet");
    expect(url).toBe(`https://explorer.solana.com/address/${addr}?cluster=devnet`);
  });

  it("generates testnet address URL", () => {
    const addr = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    const url = getSolanaAddressExplorerUrl(addr, "testnet");
    expect(url).toBe(`https://explorer.solana.com/address/${addr}?cluster=testnet`);
  });
});
