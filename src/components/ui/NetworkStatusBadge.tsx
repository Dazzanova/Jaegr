"use client";

import React, { useEffect, useState } from "react";

interface NetworkStatus {
  status: "healthy" | "degraded" | "unreachable" | "loading" | "unknown";
  cluster: string;
  currentSlot: string | null;
  responseTimeMs: number;
  error?: string;
}

/**
 * NetworkStatusBadge
 *
 * Fetches /api/solana/network on mount and periodically to show real Devnet
 * health status. Never displays fabricated data — if the RPC is unreachable,
 * it shows an error state clearly.
 */
export function NetworkStatusBadge() {
  const [status, setStatus] = useState<NetworkStatus>({
    status: "loading",
    cluster: "...",
    currentSlot: null,
    responseTimeMs: 0
  });

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/solana/network", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus({
        status: data.status ?? "unknown",
        cluster: data.cluster ?? "unknown",
        currentSlot: data.currentSlot ?? null,
        responseTimeMs: data.responseTimeMs ?? 0,
        error: data.error
      });
    } catch (err: unknown) {
      setStatus((prev) => ({
        ...prev,
        status: "unreachable",
        error: err instanceof Error ? err.message : "Failed to reach RPC"
      }));
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll every 30 seconds to keep slot updated
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, []);

  const dotColor =
    status.status === "healthy" ? "bg-emerald-400 animate-pulse" :
    status.status === "loading" ? "bg-slate-400 animate-pulse" :
    status.status === "degraded" ? "bg-amber-400" :
    "bg-rose-400";

  const textColor =
    status.status === "healthy" ? "text-emerald-400" :
    status.status === "loading" ? "text-slate-400" :
    status.status === "degraded" ? "text-amber-400" :
    "text-rose-400";

  const label =
    status.status === "loading" ? "Connecting..." :
    status.status === "unreachable" ? "RPC Unreachable" :
    status.cluster.charAt(0).toUpperCase() + status.cluster.slice(1);

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium border border-slate-700/60 bg-slate-800/80"
      title={
        status.status === "healthy"
          ? `Slot: ${status.currentSlot} · ${status.responseTimeMs}ms`
          : status.error || status.status
      }
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span className={textColor}>{label}</span>
    </div>
  );
}
