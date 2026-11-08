import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  assertDevnetCluster,
  getSolanaNetworkConfig,
  getSolanaRpcTimeoutMs,
  getSolanaExplorerUrl,
  getSolanaAddressExplorerUrl,
  isDevnetConfigured,
  NonDevnetOperationError
} from "@/server/solana/config";
import { withTimeout } from "@/server/solana/client";

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

  it("rejects an unrecognised cluster name instead of silently switching networks", () => {
    process.env.NEXT_PUBLIC_SOLANA_CLUSTER = "mainnet";
    expect(() => getSolanaNetworkConfig()).toThrow(/Invalid NEXT_PUBLIC_SOLANA_CLUSTER/);
  });

  it("rejects a malformed RPC URL", () => {
    process.env.SOLANA_DEVNET_RPC_URL = "not a url";
    expect(() => getSolanaNetworkConfig()).toThrow(/Invalid Solana RPC URL/);
  });

  it("rejects unsupported RPC protocols", () => {
    process.env.SOLANA_DEVNET_RPC_URL = "ftp://rpc.example.com";
    expect(() => getSolanaNetworkConfig()).toThrow(/protocol/);
  });

  it("uses a safe default RPC timeout", () => {
    delete process.env.SOLANA_RPC_TIMEOUT_MS;
    expect(getSolanaRpcTimeoutMs()).toBe(8_000);

    process.env.SOLANA_RPC_TIMEOUT_MS = "2500";
    expect(getSolanaRpcTimeoutMs()).toBe(2_500);

    process.env.SOLANA_RPC_TIMEOUT_MS = "-1";
    expect(getSolanaRpcTimeoutMs()).toBe(8_000);

    process.env.SOLANA_RPC_TIMEOUT_MS = "banana";
    expect(getSolanaRpcTimeoutMs()).toBe(8_000);
  });

  it("asserts Devnet before transaction operations", () => {
    delete process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
    expect(assertDevnetCluster().cluster).toBe("devnet");
    expect(isDevnetConfigured()).toBe(true);

    process.env.NEXT_PUBLIC_SOLANA_CLUSTER = "testnet";
    expect(() => assertDevnetCluster()).toThrow(NonDevnetOperationError);
    expect(isDevnetConfigured()).toBe(false);

    process.env.NEXT_PUBLIC_SOLANA_CLUSTER = "invalid";
    expect(isDevnetConfigured()).toBe(false);
  });
});

describe("RPC timeout helper", () => {
  it("resolves when the promise settles before the timeout", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 100, "test")).resolves.toBe("ok");
  });

  it("rejects with a labelled timeout", async () => {
    const never = new Promise<string>(() => undefined);
    await expect(withTimeout(never, 5, "getBalance")).rejects.toThrow(
      /getBalance timed out after 5ms/
    );
  });

  it("propagates the original rejection", async () => {
    await expect(withTimeout(Promise.reject(new Error("rate limited")), 100, "test")).rejects.toThrow(
      /rate limited/
    );
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
