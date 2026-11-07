"use client";

import React, { useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Clock
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StoredTestRun } from "@/server/persistence/repository";
import { lamportsToSolString } from "@/domain/mandates/mandate";

interface ResultCardProps {
  run: StoredTestRun;
  defaultExpanded?: boolean;
}

export function ResultCard({ run, defaultExpanded = false }: ResultCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState<"findings" | "instruction" | "proposal" | "timeline" | "remediation">("findings");

  const isResisted = run.agentResistanceVerdict === "RESISTED";
  const isBlocked = run.policyEnforcementVerdict === "BLOCKED";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-lg transition-all">
      {/* Header bar */}
      <div className="p-5 border-b border-slate-800/80 bg-slate-950/40">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-mono text-purple-400 font-semibold px-2 py-0.5 rounded bg-purple-950/80 border border-purple-800/50">
                {run.scenarioCategory}
              </span>
              <h3 className="font-semibold text-lg text-white">{run.scenarioName}</h3>
              {run.isDeterministicFallback && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/60">
                  Deterministic Demo
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
              <span>Profile: <span className="text-slate-200">{run.agentProfileType}</span></span>
              <span>•</span>
              <span>Model: <span className="text-slate-200">{run.modelName}</span></span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                {run.durationMs}ms
              </span>
            </div>
          </div>

          {/* Core Verdicts: Distinguishing Agent Resistance vs Policy Enforcement */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Metric 1: Agent Resistance */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-lg px-3.5 py-2 flex items-center gap-2.5">
              <div className="text-right">
                <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                  Agent Resistance
                </span>
                <span
                  className={`text-xs font-bold font-mono ${
                    isResisted ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {run.agentResistanceVerdict}
                </span>
              </div>
              {isResisted ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-400" />
              )}
            </div>

            {/* Metric 2: Policy Enforcement */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-lg px-3.5 py-2 flex items-center gap-2.5">
              <div className="text-right">
                <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                  Mandate Policy
                </span>
                <span
                  className={`text-xs font-bold font-mono ${
                    isBlocked ? "text-emerald-400" : "text-sky-400"
                  }`}
                >
                  {run.policyEnforcementVerdict}
                </span>
              </div>
              {isBlocked ? (
                <ShieldAlert className="w-5 h-5 text-emerald-400" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-sky-400" />
              )}
            </div>

            <button
              onClick={() => setExpanded(!expanded)}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <span>{expanded ? "Collapse" : "Inspect"}</span>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Short verdicts summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 text-xs font-mono">
          <div
            className={`p-2.5 rounded-lg border ${
              isResisted
                ? "bg-emerald-950/20 border-emerald-900/40 text-emerald-300/90"
                : "bg-rose-950/20 border-rose-900/40 text-rose-300/90"
            }`}
          >
            <span className="font-semibold block mb-0.5 font-sans">Agent Behavior:</span>
            {run.agentResistanceExplanation}
          </div>

          <div
            className={`p-2.5 rounded-lg border ${
              isBlocked
                ? "bg-emerald-950/20 border-emerald-900/40 text-emerald-300/90"
                : "bg-slate-900 border-slate-800 text-slate-300"
            }`}
          >
            <span className="font-semibold block mb-0.5 font-sans">Enforcement Result:</span>
            {run.policyEnforcementExplanation}
          </div>
        </div>
      </div>

      {/* Expanded deep-inspection view */}
      {expanded && (
        <div className="p-5 space-y-4">
          {/* Sub-tabs */}
          <div className="flex items-center gap-1 border-b border-slate-800 pb-2">
            <button
              onClick={() => setActiveTab("findings")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "findings"
                  ? "bg-purple-950 text-purple-300 border border-purple-800/60"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Policy Findings ({run.findings.length})
            </button>
            <button
              onClick={() => setActiveTab("instruction")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "instruction"
                  ? "bg-purple-950 text-purple-300 border border-purple-800/60"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Decoded Solana Instruction
            </button>
            <button
              onClick={() => setActiveTab("proposal")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "proposal"
                  ? "bg-purple-950 text-purple-300 border border-purple-800/60"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Raw Agent Proposal
            </button>
            <button
              onClick={() => setActiveTab("timeline")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "timeline"
                  ? "bg-purple-950 text-purple-300 border border-purple-800/60"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Execution Timeline ({run.timeline.length})
            </button>
            <button
              onClick={() => setActiveTab("remediation")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "remediation"
                  ? "bg-purple-950 text-purple-300 border border-purple-800/60"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Remediation Guidance
            </button>
          </div>

          {/* Tab 1: Policy Findings */}
          {activeTab === "findings" && (
            <div className="space-y-3">
              {run.findings.length === 0 ? (
                <div className="p-4 rounded-lg bg-emerald-950/20 border border-emerald-900/40 text-emerald-400 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>No policy violations detected. The instruction strictly adhered to the mandate.</span>
                </div>
              ) : (
                run.findings.map((finding) => (
                  <div
                    key={finding.findingId}
                    className="p-4 rounded-lg bg-slate-950 border border-rose-900/50 space-y-3 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="danger">{finding.severity}</Badge>
                        <span className="font-mono font-bold text-rose-400 text-sm">
                          {finding.ruleViolated}
                        </span>
                      </div>
                      <span className="font-mono text-slate-500">{finding.findingId}</span>
                    </div>

                    <p className="text-slate-300 leading-relaxed">{finding.explanation}</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono bg-slate-900/80 p-3 rounded border border-slate-800">
                      <div>
                        <span className="text-slate-500 block text-[11px]">Expected Value:</span>
                        <span className="text-emerald-400 break-all">{finding.expectedValue}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Actual Value Proposed:</span>
                        <span className="text-rose-400 break-all">{finding.actualValue}</span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded bg-amber-950/30 border border-amber-900/40 text-amber-300/90">
                      <span className="font-semibold block mb-0.5 font-sans">Recommended Remediation:</span>
                      {finding.remediation}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 2: Decoded Solana Instruction */}
          {activeTab === "instruction" && (
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Target Program Address:</span>
                  <span className="text-purple-300 font-semibold">{run.decodedInstruction.programAddress}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Instruction Type:</span>
                  <Badge variant={run.decodedInstruction.instructionType === "SYSTEM_TRANSFER" ? "success" : "danger"}>
                    {run.decodedInstruction.instructionType}
                  </Badge>
                </div>
                {run.decodedInstruction.recipient && (
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400">Extracted Recipient:</span>
                    <span className="text-slate-200">{run.decodedInstruction.recipient}</span>
                  </div>
                )}
                {run.decodedInstruction.lamports !== undefined && (
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400">Amount (Lamports):</span>
                    <span className="text-emerald-400 font-semibold">
                      {run.decodedInstruction.lamports.toString()} lamports (
                      {lamportsToSolString(BigInt(run.decodedInstruction.lamports))} SOL)
                    </span>
                  </div>
                )}
                {run.decodedInstruction.accounts && run.decodedInstruction.accounts.length > 0 && (
                  <div>
                    <span className="text-slate-400 block mb-1">Instruction Accounts ({run.decodedInstruction.accounts.length}):</span>
                    <div className="space-y-1">
                      {run.decodedInstruction.accounts.map((acc, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800 text-[11px]">
                          <span className="text-slate-300">{acc.address}</span>
                          <span className="text-purple-400">{acc.role}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 3: Raw Agent Proposal */}
          {activeTab === "proposal" && (
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs overflow-x-auto">
              <pre className="text-slate-300">{JSON.stringify(run.proposal, null, 2)}</pre>
            </div>
          )}

          {/* Tab 4: Execution Timeline */}
          {activeTab === "timeline" && (
            <div className="space-y-2">
              {run.timeline.map((evt, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800/80 text-xs font-mono"
                >
                  <span className="text-slate-500 shrink-0">{evt.step}</span>
                  <div className="flex-1">
                    <p className="text-slate-300">{evt.description}</p>
                    <span className="text-[10px] text-slate-500">{evt.timestamp}</span>
                  </div>
                  <Badge
                    variant={
                      evt.status === "success"
                        ? "success"
                        : evt.status === "error"
                        ? "danger"
                        : evt.status === "warning"
                        ? "warning"
                        : "neutral"
                    }
                  >
                    {evt.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {/* Tab 5: Remediation */}
          {activeTab === "remediation" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <span className="font-semibold text-purple-400 font-sans block">Prompt Hardening</span>
                <p className="text-slate-300 leading-relaxed">{run.remediation.promptHardening}</p>
              </div>
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <span className="font-semibold text-emerald-400 font-sans block">Mandate Configuration</span>
                <p className="text-slate-300 leading-relaxed">{run.remediation.mandateConfiguration}</p>
              </div>
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <span className="font-semibold text-sky-400 font-sans block">Solana Guardrail</span>
                <p className="text-slate-300 leading-relaxed">{run.remediation.solanaGuardrail}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
