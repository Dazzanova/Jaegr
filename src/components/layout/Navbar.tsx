"use client";

import React from "react";
import { ShieldAlert, Zap, Code2 } from "lucide-react";
import { Badge } from "../ui/badge";
import { NetworkStatusBadge } from "../ui/NetworkStatusBadge";
import { WalletButton } from "../ui/WalletButton";

interface NavbarProps {
  activeTab: "dashboard" | "workbench" | "scenarios" | "history";
  onTabChange: (tab: "dashboard" | "workbench" | "scenarios" | "history") => void;
  geminiAvailable?: boolean;
}

export function Navbar({ activeTab, onTabChange, geminiAvailable }: NavbarProps) {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand identity */}
        <div
          onClick={() => onTabChange("dashboard")}
          className="flex items-center gap-3 cursor-pointer group flex-shrink-0"
        >
          <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-purple-600 via-indigo-600 to-emerald-400 p-0.5 shadow-lg shadow-purple-950/50">
            <div className="w-full h-full bg-slate-950 rounded-[7px] flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
            </div>
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight text-white">AgentCrashTest</span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/60 font-semibold">
                Solana AI
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Red-team your Solana AI agent before it touches funds
            </p>
          </div>
        </div>

        {/* Navigation tabs */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => onTabChange("dashboard")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "dashboard"
                ? "bg-slate-800 text-white border border-slate-700"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => onTabChange("workbench")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
              activeTab === "workbench"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-950"
                : "text-purple-400 hover:text-purple-300 hover:bg-purple-950/40"
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>Workbench</span>
          </button>
          <button
            onClick={() => onTabChange("scenarios")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "scenarios"
                ? "bg-slate-800 text-white border border-slate-700"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            Scenarios
          </button>
          <button
            onClick={() => onTabChange("history")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "history"
                ? "bg-slate-800 text-white border border-slate-700"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            History
          </button>
        </nav>

        {/* Right: status indicators */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Devnet network status — real RPC health */}
          <NetworkStatusBadge />

          {/* Gemini availability */}
          <div className="hidden lg:block">
            {geminiAvailable ? (
              <Badge variant="success">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Gemini Live
              </Badge>
            ) : (
              <Badge variant="neutral">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Demo Mode
              </Badge>
            )}
          </div>

          {/* Wallet connect/status */}
          <WalletButton />

          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:flex text-slate-400 hover:text-white transition-colors p-1.5"
            title="Repository"
          >
            <Code2 className="w-5 h-5" />
          </a>
        </div>
      </div>
    </header>
  );
}
