"use client";

/**
 * Wallet Context
 *
 * Implements browser wallet discovery and connection using the Wallet Standard
 * (@wallet-standard/core). Works with any compliant wallet (Phantom, Solflare,
 * Backpack, etc.) — no specific wallet is mandated.
 *
 * Security requirements enforced here:
 *   - Wallets are only usable when the app cluster is configured for Devnet.
 *   - Connection does NOT automatically authorize any transaction.
 *   - Private keys are never touched, stored, or logged.
 *   - All signing must go through explicit user action in a separate step.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { getWallets } from "@wallet-standard/core";
import type { Wallet, WalletAccount } from "@wallet-standard/core";
import { SolanaSignTransaction } from "@solana/wallet-standard-features";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WalletContextValue {
  /** All Wallet Standard wallets discovered in this browser. */
  wallets: Wallet[];
  /** Currently connected wallet, or null. */
  connectedWallet: Wallet | null;
  /** First account from the connected wallet (the active public key). */
  connectedAccount: WalletAccount | null;
  /** Base58 public key of the connected account. */
  publicKey: string | null;
  /** True while connect/disconnect is in progress. */
  connecting: boolean;
  /** True while disconnect is in progress. */
  disconnecting: boolean;
  /** Most recent connection error message. */
  error: string | null;
  /** Wallet Standard chain identifier selected for signing. */
  walletChain: string | null;
  /** True when the connected account advertises Solana Devnet. */
  isDevnet: boolean;
  /** Attempt to connect to the given wallet. */
  connect: (wallet: Wallet) => Promise<void>;
  /** Disconnect the currently connected wallet. */
  disconnect: () => Promise<void>;
  /** Sign an unsigned transaction after an explicit user action. */
  signTransaction: (transaction: Uint8Array) => Promise<Uint8Array>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if the wallet advertises at least one Solana chain. */
function isSolanaWallet(wallet: Wallet): boolean {
  return wallet.chains.some((chain: string) => chain.startsWith("solana:"));
}

/** Returns the base58 address string from a WalletAccount. */
function accountAddress(account: WalletAccount): string {
  return account.address;
}

// ── Context ───────────────────────────────────────────────────────────────────

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [connectedWallet, setConnectedWallet] = useState<Wallet | null>(null);
  const [connectedAccount, setConnectedAccount] = useState<WalletAccount | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep a stable ref to the cleanup callbacks so we can unsubscribe on unmount
  const cleanupRef = useRef<(() => void)[]>([]);

  // ── Wallet discovery ──────────────────────────────────────────────────────
  useEffect(() => {
    // getWallets() is browser-only; safe inside useEffect
    const walletsApi = getWallets();

    const updateWallets = () => {
      const all = walletsApi.get();
      setWallets(all.filter(isSolanaWallet));
    };

    updateWallets();

    const unsubRegister = walletsApi.on("register", updateWallets);
    const unsubUnregister = walletsApi.on("unregister", updateWallets);

    cleanupRef.current = [unsubRegister, unsubUnregister];

    return () => {
      cleanupRef.current.forEach((fn) => fn());
    };
  }, []);

  // ── Connect ───────────────────────────────────────────────────────────────
  const connect = useCallback(async (wallet: Wallet) => {
    setError(null);
    setConnecting(true);

    try {
      const connectFeature = wallet.features["standard:connect"] as
        | { connect: (opts?: { silent?: boolean }) => Promise<{ accounts: readonly WalletAccount[] }> }
        | undefined;

      if (!connectFeature) {
        throw new Error(`Wallet '${wallet.name}' does not support the standard:connect feature`);
      }

      const result = await connectFeature.connect();

      const solanaAccounts = result.accounts.filter((acc) =>
        acc.chains.some((c: string) => c.startsWith("solana:"))
      );

      if (solanaAccounts.length === 0) {
        throw new Error(`Wallet '${wallet.name}' has no Solana accounts. Ensure it is configured for Devnet.`);
      }

      setConnectedWallet(wallet);
      setConnectedAccount(solanaAccounts[0]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Wallet connection failed";
      setError(message);
      setConnectedWallet(null);
      setConnectedAccount(null);
    } finally {
      setConnecting(false);
    }
  }, []);

  // ── Disconnect ────────────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    if (!connectedWallet) return;
    setDisconnecting(true);
    setError(null);

    try {
      const disconnectFeature = connectedWallet.features["standard:disconnect"] as
        | { disconnect: () => Promise<void> }
        | undefined;

      if (disconnectFeature) {
        await disconnectFeature.disconnect();
      }
    } catch {
      // Best-effort disconnect — always clear local state
    } finally {
      setConnectedWallet(null);
      setConnectedAccount(null);
      setDisconnecting(false);
    }
  }, [connectedWallet]);

  const publicKey = connectedAccount ? accountAddress(connectedAccount) : null;
  const walletChain = connectedAccount?.chains.find((chain) => chain === "solana:devnet")
    || connectedAccount?.chains.find((chain) => chain.startsWith("solana:"))
    || null;
  const isDevnet = walletChain === "solana:devnet";

  const signTransaction = useCallback(async (transaction: Uint8Array): Promise<Uint8Array> => {
    if (!connectedWallet || !connectedAccount || !walletChain) {
      throw new Error("Connect a Solana Devnet wallet before signing");
    }

    const signFeature = connectedWallet.features[SolanaSignTransaction] as
      | { signTransaction: (input: {
          account: WalletAccount;
          transaction: Uint8Array;
          chain?: string;
          options?: { preflightCommitment?: "processed" | "confirmed" | "finalized" };
        }) => Promise<readonly { signedTransaction: Uint8Array }[]> }
      | undefined;
    if (!signFeature) {
      throw new Error("Connected wallet does not support solana:signTransaction");
    }

    const outputs = await signFeature.signTransaction({
      account: connectedAccount,
      transaction,
      chain: walletChain,
      options: { preflightCommitment: "confirmed" }
    });
    const signedTransaction = outputs[0]?.signedTransaction;
    if (!signedTransaction) throw new Error("Wallet returned no signed transaction");
    return signedTransaction;
  }, [connectedAccount, connectedWallet, walletChain]);

  const value = useMemo<WalletContextValue>(
    () => ({
      wallets,
      connectedWallet,
      connectedAccount,
      publicKey,
      connecting,
      disconnecting,
      error,
      walletChain,
      isDevnet,
      connect,
      disconnect,
      signTransaction
    }),
    [wallets, connectedWallet, connectedAccount, publicKey, connecting, disconnecting, error, walletChain, isDevnet, connect, disconnect, signTransaction]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used inside <WalletProvider>");
  }
  return ctx;
}
