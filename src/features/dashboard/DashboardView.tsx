"use client";

import React from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Zap,
  Play,
  ArrowRight,
  Layers,
  Bug,
  Lock
} from "lucide-react";
import { StoredTestRun, SummaryStats } from "@/server/persistence/repository";
import { ScenarioItem } from "../scenarios/ScenarioCard";
import { ResultCard } from "../test-runs/ResultCard";

interface DashboardViewProps {
  stats: SummaryStats;
  recentRuns: StoredTestRun[];
  scenarios: ScenarioItem[];
  onStartRun: (options?: { scenarioId?: string; profileType?: "vulnerable" | "hardened" }) => void;
  onNavigateToWorkbench: () => void;
  onNavigateToScenarios: () => void;
}

export function DashboardView({
  stats,
  recentRuns,
  scenarios,
  onStartRun,
  onNavigateToWorkbench,
  onNavigateToScenarios
}: DashboardViewProps) {
  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-purple-950/40 p-6 sm:p-8">
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-medium bg-purple-950/80 border border-purple-800/60 text-purple-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Solana AI Security Workbench MVP
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Red-team your Solana AI agent <br />
            <span className="bg-gradient-to-r from-purple-400 via-emerald-400 to-sky-400 bg-clip-text text-transparent">
              before it touches funds.
            </span>
          </h1>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Can your autonomous AI agent be manipulated into proposing an unauthorized Solana transaction?
            AgentCrashTest captures proposed Solana actions, inspects real instruction binaries using{" "}
            <code className="text-purple-300 bg-purple-950/60 px-1 py-0.5 rounded">@solana/kit</code>,
            and independently evaluates them against a strict user mandate.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => onStartRun({ profileType: "vulnerable" })}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm flex items-center gap-2 shadow-lg shadow-purple-950/60 transition-all hover:scale-[1.02]"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Run 5-Scenario Red Team Suite</span>
            </button>

            <button
              onClick={onNavigateToWorkbench}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm border border-slate-700 flex items-center gap-2 transition-colors"
            >
              <Zap className="w-4 h-4 text-purple-400" />
              <span>Custom Workbench</span>
            </button>

            <button
              onClick={onNavigateToScenarios}
              className="px-4 py-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 font-medium text-sm border border-slate-800 flex items-center gap-2 transition-colors"
            >
              <span>Explore {scenarios.length || 5} Scenarios</span>
              <ArrowRight className="w-3.5 h-3.5 text-purple-400" />
            </button>
          </div>
        </div>

        {/* Subtle decorative background grid */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-900/20 via-transparent to-transparent pointer-events-none" />
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium uppercase tracking-wider">Total Test Runs</span>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-white">{stats.totalRuns}</p>
          <span className="text-[11px] text-slate-500 font-mono">
            {stats.distinctScenariosTested} / 5 scenarios tested
          </span>
        </div>

        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium uppercase tracking-wider">Agents Compromised</span>
            <Bug className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-rose-400">{stats.totalCompromised}</p>
          <span className="text-[11px] text-slate-500 font-mono">
            Vulnerable agent compliance rate
          </span>
        </div>

        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium uppercase tracking-wider">Agents Resisted</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-400">{stats.totalResisted}</p>
          <span className="text-[11px] text-slate-500 font-mono">
            Hardened agent resistance rate
          </span>
        </div>

        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium uppercase tracking-wider">Blocked by Mandate</span>
            <Lock className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-400">{stats.totalBlockedByPolicy}</p>
          <span className="text-[11px] text-slate-500 font-mono">
            100% independent deterministic policy
          </span>
        </div>
      </div>

      {/* Two Core Distinction Explainer Banner */}
      <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-mono">
        <div className="space-y-1">
          <span className="font-sans font-bold text-slate-200 uppercase tracking-wide">
            Core Architectural Invariant: Two Distinct Outcomes
          </span>
          <p className="text-slate-400 font-sans">
            1. <strong className="text-purple-300">Agent Resistance:</strong> Did the LLM resist adversarial prompts? &nbsp;|&nbsp;
            2. <strong className="text-emerald-300">Authorization Enforcement:</strong> Did the independent Solana policy evaluator block unauthorized funds movement?
          </p>
        </div>
        <div className="shrink-0 text-slate-500 text-[11px]">
          No ambiguous single score. Zero floating-point math.
        </div>
      </div>

      {/* Recent Runs Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white tracking-tight">Recent Security Runs</h2>
          <button
            onClick={onNavigateToWorkbench}
            className="text-xs text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1"
          >
            <span>Open Workbench</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentRuns.length === 0 ? (
          <div className="p-12 text-center rounded-xl border border-slate-800 bg-slate-900/20 space-y-4">
            <div className="w-12 h-12 rounded-full bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-slate-200">No test runs recorded yet</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Launch the 5-scenario security crash test to red-team the reference Solana agent and view policy enforcement findings.
              </p>
            </div>
            <button
              onClick={() => onStartRun({ profileType: "vulnerable" })}
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Run First Security Test Suite</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {recentRuns.slice(0, 5).map((run) => (
              <ResultCard key={run.runId} run={run} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
