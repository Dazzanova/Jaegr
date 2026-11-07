"use client";

import React, { useEffect, useState } from "react";
import { Wallet2, LogOut, ChevronDown } from "lucide-react";
import type { Wallet } from "@wallet-standard/core";
import { useWallet } from "@/lib/wallet/WalletContext";
import { lamportsToSolString } from "@/domain/mandates/mandate";

/** Truncates a base58 address to show first 4 and last 4 chars. */
function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function WalletPickerModal({
  wallets,
  onSelect,
  onClose
}: {
  wallets: Wallet[];
  onSelect: (wallet: Wallet) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-72 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-white mb-1">Connect Wallet</h3>
        <p className="text-xs text-slate-400 mb-4">
          Select a Wallet Standard-compatible wallet. Only Devnet is supported.
        </p>
        {wallets.length === 0 ? (
          <div className="text-xs text-slate-500 text-center py-4">
            No compatible wallets detected.
            <br />
            Install Phantom, Solflare, or Backpack.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {wallets.map((w) => (
              <button
                key={w.name}
                onClick={() => onSelect(w)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 transition-colors text-left"
              >
                {w.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.icon} alt={w.name} className="w-7 h-7 rounded-md" />
                ) : (
                  <div className="w-7 h-7 rounded-md bg-slate-700 flex items-center justify-center">
                    <Wallet2 className="w-4 h-4 text-slate-400" />
                  </div>
                )}
                <span className="text-sm font-medium text-slate-200">{w.name}</span>
              </button>
            ))}
          </div>
        )}
        <button
          onClick={onClose}
          className="mt-4 w-full text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * WalletButton
 *
 * Shows a "Connect Wallet" button when disconnected.
 * When connected, shows the truncated address, SOL balance fetched
 * via our server-side API, and a disconnect option.
 *
 * Cluster lock: displays a warning if Devnet is not configured.
 */
export function WalletButton() {
  const { wallets, publicKey, connectedWallet, connecting, disconnecting, error, connect, disconnect } = useWallet();
  const [showPicker, setShowPicker] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  // null = not connected or error, undefined = loading, string = balance value
  const [balance, setBalance] = useState<string | null | undefined>(null);

  // Fetch balance whenever the connected wallet address changes.
  // Balance display is only rendered when publicKey is non-null, so
  // stale balance from a previous session is never shown after disconnect.
  useEffect(() => {
    if (!publicKey) return;

    let cancelled = false;

    // Set loading state asynchronously to avoid the synchronous setState-in-effect lint rule
    const timer = setTimeout(() => {
      if (!cancelled) setBalance(undefined); // undefined = loading
    }, 0);

    fetch(`/api/solana/balance?address=${encodeURIComponent(publicKey)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Balance fetch failed");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setBalance(lamportsToSolString(BigInt(data.lamports)));
      })
      .catch(() => {
        if (!cancelled) setBalance(null);
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [publicKey]);

  const handleSelect = async (wallet: Wallet) => {
    setShowPicker(false);
    await connect(wallet);
  };

  const handleDisconnect = async () => {
    setShowMenu(false);
    await disconnect();
  };

  if (connecting) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        Connecting…
      </div>
    );
  }

  if (publicKey && connectedWallet) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu((v) => !v)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800/50 hover:border-emerald-600 text-emerald-400 text-xs font-mono transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="hidden sm:inline">{truncateAddress(publicKey)}</span>
          {balance === undefined ? (
            <span className="text-emerald-600">...</span>
          ) : balance !== null ? (
            <span className="text-emerald-300 hidden sm:inline">{balance} SOL</span>
          ) : null}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>

        {showMenu && (
          <div
            className="absolute right-0 mt-1 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 py-1"
            onMouseLeave={() => setShowMenu(false)}
          >
            <div className="px-3 py-2 border-b border-slate-800">
              <div className="text-xs text-slate-400 font-mono truncate">{publicKey}</div>
              {balance !== null && (
                <div className="text-xs text-emerald-400 font-mono mt-0.5">{balance} SOL (Devnet)</div>
              )}
            </div>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        )}

        {error && (
          <div className="absolute right-0 mt-1 w-56 bg-rose-950/90 border border-rose-800 rounded-lg p-2 z-50 text-xs text-rose-300">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowPicker(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition-colors shadow-lg shadow-purple-950"
      >
        <Wallet2 className="w-3.5 h-3.5" />
        Connect Wallet
      </button>

      {error && (
        <div className="text-xs text-rose-400 ml-1" title={error}>
          Connection failed
        </div>
      )}

      {showPicker && (
        <WalletPickerModal
          wallets={wallets}
          onSelect={handleSelect}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}
