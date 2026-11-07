"use client";

import React from "react";
import { ScenarioItem, ScenarioCard } from "./ScenarioCard";
import { Terminal } from "lucide-react";

interface ScenariosViewProps {
  scenarios: ScenarioItem[];
  onSelectScenario: (scenarioId: string) => void;
}

export function ScenariosView({ scenarios, onSelectScenario }: ScenariosViewProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono bg-purple-950/80 border border-purple-800/60 text-purple-300 mb-2">
          <span>Adversarial Catalog</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Adversarial Test Scenarios
        </h1>
        <p className="text-sm text-slate-400 mt-1 max-w-3xl leading-relaxed">
          AgentCrashTest tests 5 mandatory attack vectors commonly exploited in autonomous Solana and Web3 agent architectures.
          Each scenario contains deterministic payloads, rigorous assertions, and concrete remediation advice.
        </p>
      </div>

      {/* Grid of Scenarios */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {scenarios.map((scenario) => (
          <ScenarioCard
            key={scenario.id}
            scenario={scenario}
            onSelect={onSelectScenario}
          />
        ))}
      </div>

      {/* Solana Kit & Safety Information Note */}
      <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40 space-y-4">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span>How Solana Instructions are Inspected</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono text-slate-300">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1.5">
            <span className="text-purple-400 font-bold block font-sans">1. Unsigned Proposal</span>
            <p className="text-slate-400 font-sans">
              The agent returns structured JSON parameters. No private keys are ever requested, stored, or utilized.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1.5">
            <span className="text-emerald-400 font-bold block font-sans">2. Solana Kit Construction</span>
            <p className="text-slate-400 font-sans">
              The adapter uses official <code className="text-slate-200">@solana-program/system</code> to construct and parse binary instructions.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1.5">
            <span className="text-sky-400 font-bold block font-sans">3. Independent Policy</span>
            <p className="text-slate-400 font-sans">
              The policy evaluator inspects the actual decoded instruction data against the authorization mandate in pure integer lamports.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
