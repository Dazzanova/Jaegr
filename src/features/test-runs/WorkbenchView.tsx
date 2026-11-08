"use client";

import React, { useState } from "react";
import {
  Play,
  RotateCcw,
  Shield,
  Zap,
  Sliders,
  AlertCircle,
  Download
} from "lucide-react";
import { ScenarioItem } from "../scenarios/ScenarioCard";
import { StoredTestRun } from "@/server/persistence/repository";
import { ResultCard } from "./ResultCard";
import { Badge } from "@/components/ui/badge";
import { solToLamports } from "@/domain/mandates/mandate";
import { useWallet } from "@/lib/wallet/WalletContext";

interface WorkbenchViewProps {
  scenarios: ScenarioItem[];
  geminiAvailable: boolean;
  onRunComplete?: () => void;
}

export function WorkbenchView({ scenarios, geminiAvailable, onRunComplete }: WorkbenchViewProps) {
  const { publicKey, connectedWallet, isDevnet, signTransaction } = useWallet();
  // Config state
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("ALL");
  const [profileType, setProfileType] = useState<"vulnerable" | "hardened">("vulnerable");
  const [provider, setProvider] = useState<"deterministic-demo" | "gemini">("deterministic-demo");
  const [compareMode, setCompareMode] = useState<boolean>(false);

  // Mandate configuration state
  const [maxSol, setMaxSol] = useState<string>("0.1");
  const [recipient, setRecipient] = useState<string>("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const [programId, setProgramId] = useState<string>("11111111111111111111111111111111");

  // Execution state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [results, setResults] = useState<StoredTestRun[]>([]);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedExecutionRunId, setSelectedExecutionRunId] = useState<string>("");
  const [preparedExecution, setPreparedExecution] = useState<{
    unsignedWireTransaction: string;
    lastValidBlockHeight: string;
    preparedAt: string;
    simulation: {
      status: string;
      logs?: string[];
      unitsConsumed?: string;
      err?: unknown;
      errorMessage?: string;
      timestamp?: string;
    };
    authorization: { allowed: boolean; findings: Array<{ ruleViolated: string; explanation: string }> };
    inspected: {
      programAddress: string;
      instructionType: string;
      recipient?: string;
      source?: string;
      lamports?: string;
      tokenAmount?: string;
      tokenMint?: string;
      tokenDecimals?: number;
      accounts: Array<{ address: string; role: string }>;
    };
    feePayerAddress: string;
    mandate: Record<string, unknown>;
    proposal: StoredTestRun["proposal"];
    inputKey: string;
  } | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [executionStatus, setExecutionStatus] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<{
    status?: string;
    signature?: string;
    slot?: string;
    explorerUrl?: string;
    error?: string;
  } | null>(null);

  const handleResetMandate = () => {
    setMaxSol("0.1");
    setRecipient("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    setProgramId("11111111111111111111111111111111");
  };

  const handleExecute = async () => {
    setIsRunning(true);
    setErrorMessage(null);
    setWarningMessage(null);

    try {
      let lamportsStr: string;
      try {
        lamportsStr = solToLamports(maxSol).toString();
      } catch {
        throw new Error("Invalid Max SOL amount specified. Must be a valid decimal number with <= 9 decimals.");
      }

      const customMandate = {
        id: "workbench-custom",
        name: "Custom Testing Mandate",
        maxLamportsPerAction: lamportsStr,
        allowedRecipients: [recipient],
        allowedPrograms: [programId],
        permittedActionTypes: ["sol_transfer"],
        seenActionIds: ["ACT-REPLAY-TX-0099"]
      };

      const scenarioIds = selectedScenarioId === "ALL" ? scenarios.map((s) => s.id) : [selectedScenarioId];

      if (compareMode) {
        // Run both vulnerable and hardened profiles for side-by-side comparison
        const vulnRes = await fetch("/api/test-runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenarioIds,
            profileType: "vulnerable",
            provider,
            mandate: customMandate
          })
        });

        const hardRes = await fetch("/api/test-runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenarioIds,
            profileType: "hardened",
            provider,
            mandate: customMandate
          })
        });

        const vulnData = await vulnRes.json();
        const hardData = await hardRes.json();

        if (vulnData.error || hardData.error) {
          throw new Error(vulnData.error || hardData.error);
        }

        if (vulnData.warning) setWarningMessage(vulnData.warning);

        const combined = [...vulnData.results, ...hardData.results];
        setResults(combined);
      } else {
        const res = await fetch("/api/test-runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenarioIds,
            profileType,
            provider,
            mandate: customMandate
          })
        });

        const data = await res.json();
        if (data.error) {
          throw new Error(data.error);
        }

        if (data.warning) setWarningMessage(data.warning);
        setResults(data.results);
      }

      if (onRunComplete) {
        onRunComplete();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsRunning(false);
    }
  };

  const buildExecutionMandate = () => ({
    id: "workbench-custom",
    name: "Custom Testing Mandate",
    maxLamportsPerAction: solToLamports(maxSol).toString(),
    allowedRecipients: [recipient],
    allowedPrograms: [programId],
    permittedActionTypes: ["sol_transfer"],
    seenActionIds: ["ACT-REPLAY-TX-0099"]
  });

  const executionInputKey = JSON.stringify({
    runId: selectedExecutionRunId,
    maxSol,
    recipient,
    programId,
    publicKey
  });

  const handlePrepareExecution = async () => {
    const run = results.find((candidate) => candidate.runId === selectedExecutionRunId);
    if (!run || !publicKey || !connectedWallet || !isDevnet) return;
    setIsPreparing(true);
    setExecutionStatus("Preparing and simulating on Devnet...");
    setExecutionResult(null);
    try {
      const mandate = buildExecutionMandate();
      const response = await fetch("/api/solana/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal: run.proposal, mandate, feePayerAddress: publicKey })
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.simulation) {
          setPreparedExecution({
            unsignedWireTransaction: data.unsignedWireTransaction,
            lastValidBlockHeight: data.lastValidBlockHeight,
            preparedAt: data.preparedAt,
            simulation: data.simulation,
            authorization: data.authorization,
            inspected: data.inspected,
            feePayerAddress: data.feePayerAddress,
            mandate,
            proposal: run.proposal,
            inputKey: executionInputKey
          });
        }
        throw new Error(data.error || data.details || "Transaction preparation failed");
      }
      setPreparedExecution({
        unsignedWireTransaction: data.unsignedWireTransaction,
        lastValidBlockHeight: data.lastValidBlockHeight,
        preparedAt: data.preparedAt,
        simulation: data.simulation,
        authorization: data.authorization,
        inspected: data.inspected,
        feePayerAddress: data.feePayerAddress,
        mandate,
        proposal: run.proposal,
        inputKey: executionInputKey
      });
      setExecutionStatus(
        data.simulation.status === "SUCCESS"
          ? "Simulation succeeded. Review the transaction, then approve it in your wallet."
          : `Simulation ${data.simulation.status}. Signing is disabled.`
      );
    } catch (error: unknown) {
      setPreparedExecution(null);
      setExecutionStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPreparing(false);
    }
  };

  const handleSignAndSubmit = async () => {
    if (!preparedExecution || !publicKey || !connectedWallet || !isDevnet) return;
    if (preparedExecution.inputKey !== executionInputKey) {
      setExecutionStatus("Proposal, mandate, or wallet changed since inspection; prepare again");
      return;
    }
    if (preparedExecution.authorization.allowed !== true) {
      setExecutionStatus("Authorization is not satisfied; signing is blocked");
      return;
    }
    if (preparedExecution.simulation.status !== "SUCCESS") {
      setExecutionStatus("Simulation must succeed before signing is allowed");
      return;
    }

    setIsSubmitting(true);
    setExecutionStatus("Waiting for explicit wallet approval...");
    setExecutionResult(null);
    try {
      const unsignedBytes = Uint8Array.from(atob(preparedExecution.unsignedWireTransaction), (char) => char.charCodeAt(0));
      const signedBytes = await signTransaction(unsignedBytes);
      let binary = "";
      signedBytes.forEach((value) => { binary += String.fromCharCode(value); });
      const signedWireTransaction = btoa(binary);
      setExecutionStatus("Signed by wallet. Submitting to Devnet...");
      const response = await fetch("/api/solana/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal: preparedExecution.proposal,
          mandate: preparedExecution.mandate,
          feePayerAddress: preparedExecution.feePayerAddress,
          unsignedWireTransaction: preparedExecution.unsignedWireTransaction,
          signedWireTransaction,
          lastValidBlockHeight: preparedExecution.lastValidBlockHeight
        })
      });
      const data = await response.json();
      setExecutionResult(data);
      if (!response.ok) throw new Error(data.error || "Transaction execution failed");
      setExecutionStatus(data.status === "CONFIRMED" ? "Confirmed on Devnet" : data.status);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setExecutionStatus(
        /reject|denied|cancel/i.test(message)
          ? `Wallet approval was rejected or cancelled: ${message}`
          : message
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportMarkdown = () => {
    if (results.length === 0) return;
    const reportText = `# AgentCrashTest Security Assessment Report
Date: ${new Date().toISOString()}
Total Scenarios Evaluated: ${results.length}

## Executive Summary
${results.map((r, i) => `
### ${i + 1}. ${r.scenarioName} (${r.scenarioCategory})
- **Profile**: ${r.agentProfileType} (${r.modelName})
- **Agent Resistance**: ${r.agentResistanceVerdict} (${r.agentResistanceExplanation})
- **Policy Enforcement**: ${r.policyEnforcementVerdict} (${r.policyEnforcementExplanation})
- **Findings Count**: ${r.findings.length}
${r.findings.map((f) => `  - [${f.severity}] ${f.ruleViolated}: ${f.explanation}`).join("\n")}
- **Remediation**: ${r.remediation.promptHardening}
`).join("\n---\n")}
`;
    const blob = new Blob([reportText], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agentcrashtest-report-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedExecutionRun = results.find((candidate) => candidate.runId === selectedExecutionRunId) ?? null;
  const hasUnresolvedSubmission =
    executionResult?.status === "SUBMITTED" || executionResult?.status === "UNKNOWN";
  const preparedIsCurrent = preparedExecution?.inputKey === executionInputKey;
  const canSignAndSubmit =
    Boolean(preparedExecution) &&
    preparedIsCurrent &&
    preparedExecution?.authorization.allowed === true &&
    preparedExecution?.simulation.status === "SUCCESS" &&
    !isSubmitting &&
    !hasUnresolvedSubmission;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Workbench Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Adversarial Testing Workbench
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure reference agent profiles, set authorization mandates, and run adversarial red-team scenarios.
        </p>
      </div>

      {/* Control Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel 1: Profile & Engine */}
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
          <div className="flex items-center gap-2 text-slate-200 text-sm font-semibold">
            <Shield className="w-4 h-4 text-purple-400" />
            <span>Agent Profile & Engine</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">Reference Agent Profile</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={compareMode}
                  onClick={() => setProfileType("vulnerable")}
                  className={`p-3 rounded-lg border text-left text-xs transition-all ${
                    profileType === "vulnerable" && !compareMode
                      ? "border-rose-500 bg-rose-950/40 text-rose-300 font-semibold ring-1 ring-rose-500"
                      : "border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
                  } ${compareMode ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <span className="block font-sans font-bold">Naive Assistant</span>
                  <span className="text-[11px] font-mono text-slate-400">Vulnerable Profile</span>
                </button>

                <button
                  type="button"
                  disabled={compareMode}
                  onClick={() => setProfileType("hardened")}
                  className={`p-3 rounded-lg border text-left text-xs transition-all ${
                    profileType === "hardened" && !compareMode
                      ? "border-emerald-500 bg-emerald-950/40 text-emerald-300 font-semibold ring-1 ring-emerald-500"
                      : "border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
                  } ${compareMode ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <span className="block font-sans font-bold">Hardened Sentinel</span>
                  <span className="text-[11px] font-mono text-slate-400">Hardened Profile</span>
                </button>
              </div>
            </div>

            <div className="pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-purple-300 font-medium select-none">
                <input
                  type="checkbox"
                  checked={compareMode}
                  onChange={(e) => setCompareMode(e.target.checked)}
                  className="rounded border-slate-700 text-purple-600 focus:ring-purple-500"
                />
                <span>Side-by-Side Comparison (Run Both Profiles)</span>
              </label>
            </div>

            <div className="pt-2 border-t border-slate-800">
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">Model / Execution Engine</label>
              <div className="space-y-2">
                <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-800 bg-slate-950 cursor-pointer">
                  <input
                    type="radio"
                    name="provider"
                    value="deterministic-demo"
                    checked={provider === "deterministic-demo"}
                    onChange={() => setProvider("deterministic-demo")}
                    className="mt-0.5 text-purple-600"
                  />
                  <div>
                    <span className="text-xs font-semibold text-white block">Deterministic Demo Mode (Offline)</span>
                    <span className="text-[11px] text-slate-400 block">
                      Guaranteed reproducible evaluation. Zero external network calls or keys.
                    </span>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-800 bg-slate-950 cursor-pointer ${
                    !geminiAvailable ? "opacity-60" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="provider"
                    value="gemini"
                    checked={provider === "gemini"}
                    onChange={() => setProvider("gemini")}
                    className="mt-0.5 text-purple-600"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-white">Google Gemini 2.5 Flash</span>
                      {geminiAvailable ? (
                        <Badge variant="success">Configured</Badge>
                      ) : (
                        <Badge variant="warning">No API Key</Badge>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 block">
                      Live structured outputs via official Google GenAI JavaScript SDK.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Panel 2: Scenario Selection */}
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
          <div className="flex items-center gap-2 text-slate-200 text-sm font-semibold">
            <Zap className="w-4 h-4 text-purple-400" />
            <span>Target Adversarial Scenario</span>
          </div>

          <div className="space-y-2">
            <select
              value={selectedScenarioId}
              onChange={(e) => setSelectedScenarioId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
            >
              <option value="ALL">★ Run All 5 Adversarial Scenarios</option>
              {scenarios.map((s, idx) => (
                <option key={s.id} value={s.id}>
                  {idx + 1}. [{s.category}] {s.name}
                </option>
              ))}
            </select>

            <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 text-xs font-mono space-y-1.5 text-slate-400">
              <span className="text-slate-300 font-sans font-semibold block text-[11px] uppercase tracking-wider">
                Active Scenario Scope:
              </span>
              {selectedScenarioId === "ALL" ? (
                <p className="text-slate-400">
                  Runs full test suite: Indirect Prompt Injection, Limit Escalation, Address Substitution, Unauthorized Program Call, and Replay Attack.
                </p>
              ) : (
                <p className="text-purple-300">
                  {scenarios.find((s) => s.id === selectedScenarioId)?.description}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Panel 3: Authorization Mandate (Independent Policy Invariants) */}
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-200 text-sm font-semibold">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <span>Authorization Mandate</span>
            </div>
            <button
              type="button"
              onClick={handleResetMandate}
              className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 font-mono"
              title="Reset to default sample mandate"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1 font-mono">Max SOL per Action (Lamport Cap):</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={maxSol}
                  onChange={(e) => setMaxSol(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white font-mono w-24 text-center focus:border-purple-500"
                />
                <span className="text-slate-400 font-mono">
                  SOL ({maxSol ? solToLamports(maxSol || "0").toString() : "0"} lamports)
                </span>
              </div>
            </div>

            <div>
              <label className="text-slate-400 block mb-1 font-mono">Allowed Recipient Address:</label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-300 font-mono text-[11px] focus:border-purple-500"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1 font-mono">Allowed Program ID:</label>
              <input
                type="text"
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-300 font-mono text-[11px] focus:border-purple-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Action Execution Button */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border border-purple-900/60 bg-purple-950/20">
        <div className="space-y-0.5">
          <span className="text-sm font-semibold text-white">Execute Security Assessment</span>
          <p className="text-xs text-slate-400">
            Simulates adversarial context, captures Solana instruction proposals, and evaluates against mandate policy.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {results.length > 0 && (
            <button
              onClick={handleExportMarkdown}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Audit Report</span>
            </button>
          )}

          <button
            disabled={isRunning}
            onClick={handleExecute}
            className={`px-6 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 shadow-lg transition-all ${
              isRunning
                ? "bg-purple-800/60 text-purple-200 cursor-wait"
                : "bg-purple-600 hover:bg-purple-500 text-white shadow-purple-950 hover:scale-[1.02]"
            }`}
          >
            <Play className={`w-4 h-4 fill-white ${isRunning ? "animate-spin" : ""}`} />
            <span>{isRunning ? "Executing Test Runs..." : "Start Security Crash Test"}</span>
          </button>
        </div>
      </div>

      {/* Warnings & Errors */}
      {warningMessage && (
        <div className="p-4 rounded-xl border border-amber-800/80 bg-amber-950/30 text-amber-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{warningMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl border border-rose-800/80 bg-rose-950/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Live Results Stream */}
      {results.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>Security Evaluation Results</span>
              <span className="text-xs font-mono font-normal text-slate-400">
                ({results.length} scenario{results.length > 1 ? "s" : ""} evaluated)
              </span>
            </h2>
          </div>

          <div className="space-y-4">
            {results.map((run, idx) => (
              <ResultCard key={run.runId || idx} run={run} defaultExpanded={idx === 0} />
            ))}
          </div>
        </div>
      )}

      <div className="p-5 rounded-xl border border-emerald-900/60 bg-emerald-950/10 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white">Devnet Transaction Execution</h2>
          <p className="text-xs text-slate-400 mt-1">
            Preparing and simulating never authorizes a transaction. Signing happens only in your wallet,
            and only after you explicitly click <span className="text-slate-200">Sign &amp; Submit</span>.
            The server independently re-inspects and re-authorizes the signed wire transaction before submission.
          </p>
        </div>

        {/* Environment */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <label className="text-slate-400">
            Transaction proposal
            <select
              value={selectedExecutionRunId}
              onChange={(event) => {
                setSelectedExecutionRunId(event.target.value);
                setPreparedExecution(null);
                setExecutionResult(null);
                setExecutionStatus(null);
              }}
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-200 font-mono"
            >
              <option value="">Select an evaluated proposal</option>
              {results.map((run) => (
                <option key={run.runId} value={run.runId}>
                  {run.scenarioName} — {run.policyEnforcementVerdict}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded border border-slate-800 bg-slate-950/70 p-3 space-y-1">
            <div>
              Network:{" "}
              <span className={isDevnet ? "text-emerald-300" : "text-rose-300"}>
                {isDevnet ? "Devnet (verified by wallet)" : "Not Devnet — execution disabled"}
              </span>
            </div>
            <div>
              Connected wallet:{" "}
              <span className="text-slate-200 font-mono break-all">{publicKey || "Disconnected"}</span>
            </div>
            <div>
              Fee payer:{" "}
              <span className="text-slate-200 font-mono break-all">{publicKey || "Unavailable"}</span>
            </div>
            <div>
              Wallet signing capability:{" "}
              <span className={connectedWallet ? "text-emerald-300" : "text-amber-300"}>
                {connectedWallet ? "solana:signTransaction" : "No wallet connected"}
              </span>
            </div>
          </div>
        </div>

        {!publicKey && (
          <div className="rounded border border-amber-900/60 bg-amber-950/20 p-3 text-xs text-amber-300">
            Connect a Wallet Standard wallet set to Devnet before preparing a transaction.
          </div>
        )}
        {publicKey && !isDevnet && (
          <div className="rounded border border-rose-900/60 bg-rose-950/20 p-3 text-xs text-rose-300">
            The connected wallet does not advertise the <span className="font-mono">solana:devnet</span> chain.
            Switch the wallet network to Devnet and reconnect. Signing is blocked.
          </div>
        )}

        {/* Proposal overview */}
        {selectedExecutionRun && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300">
            <div className="rounded border border-slate-800 bg-slate-950/70 p-3 space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Transaction overview</div>
              <div>Transaction ID: <span className="font-mono break-all">{selectedExecutionRun.proposal.actionId}</span></div>
              <div>Network: <span className="text-emerald-300">Devnet</span></div>
              <div>Instruction count: 1</div>
              <div>Program ID: <span className="font-mono break-all">{selectedExecutionRun.decodedInstruction.programAddress}</span></div>
              <div>Recipient: <span className="font-mono break-all">{selectedExecutionRun.decodedInstruction.recipient || "N/A"}</span></div>
              <div>
                Amount:{" "}
                {selectedExecutionRun.decodedInstruction.lamports !== undefined
                  ? `${selectedExecutionRun.decodedInstruction.lamports.toString()} lamports`
                  : selectedExecutionRun.decodedInstruction.tokenAmount !== undefined
                    ? `${selectedExecutionRun.decodedInstruction.tokenAmount.toString()} token base units`
                    : "N/A"}
              </div>
              {selectedExecutionRun.decodedInstruction.tokenMint && (
                <div>Token mint: <span className="font-mono break-all">{selectedExecutionRun.decodedInstruction.tokenMint}</span></div>
              )}
            </div>
            <div className="rounded border border-slate-800 bg-slate-950/70 p-3 space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Security checks</div>
              <div>
                Agent resistance:{" "}
                <span className={selectedExecutionRun.agentResistanceVerdict === "RESISTED" ? "text-emerald-300" : "text-amber-300"}>
                  {selectedExecutionRun.agentResistanceVerdict}
                </span>
              </div>
              <div>
                Authorization:{" "}
                <span className={selectedExecutionRun.policyEnforcementVerdict === "PASSED" ? "text-emerald-300" : "text-rose-300"}>
                  {selectedExecutionRun.policyEnforcementVerdict}
                </span>
              </div>
              <div>Proposal simulation: <span className="text-sky-300">{selectedExecutionRun.simulationResult.status}</span></div>
              <div className="text-amber-300">
                Warnings: wallet connection and simulation are never authorization. Only a fresh wallet signature
                plus server-side re-validation can submit.
              </div>
            </div>
          </div>
        )}

        {/* Exact prepared transaction review */}
        {preparedExecution && preparedIsCurrent && (
          <div
            className={`rounded border p-3 text-xs space-y-2 ${
              preparedExecution.authorization.allowed && preparedExecution.simulation.status === "SUCCESS"
                ? "border-sky-900/60 bg-sky-950/20"
                : "border-rose-900/60 bg-rose-950/20"
            }`}
          >
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              Review before signing — exact server-prepared transaction
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="space-y-1">
                <div>Fee payer: <span className="font-mono break-all">{preparedExecution.feePayerAddress}</span></div>
                <div>Instruction type: <span className="font-mono">{preparedExecution.inspected.instructionType}</span></div>
                <div>Program: <span className="font-mono break-all">{preparedExecution.inspected.programAddress}</span></div>
                <div>Recipient: <span className="font-mono break-all">{preparedExecution.inspected.recipient || "N/A"}</span></div>
                <div>
                  Amount:{" "}
                  {preparedExecution.inspected.lamports !== undefined
                    ? `${preparedExecution.inspected.lamports} lamports`
                    : preparedExecution.inspected.tokenAmount !== undefined
                      ? `${preparedExecution.inspected.tokenAmount} token base units`
                      : "N/A"}
                </div>
                <div>Prepared at: <span className="font-mono">{preparedExecution.preparedAt}</span></div>
                <div>Blockhash valid until height: <span className="font-mono">{preparedExecution.lastValidBlockHeight}</span></div>
              </div>
              <div className="space-y-1">
                <div>
                  Server authorization:{" "}
                  <span className={preparedExecution.authorization.allowed ? "text-emerald-300" : "text-rose-300"}>
                    {preparedExecution.authorization.allowed ? "PASSED" : "BLOCKED"}
                  </span>
                </div>
                <div>
                  Exact prepared simulation:{" "}
                  <span className={preparedExecution.simulation.status === "SUCCESS" ? "text-emerald-300" : "text-rose-300"}>
                    {preparedExecution.simulation.status}
                  </span>
                </div>
                {preparedExecution.simulation.unitsConsumed && (
                  <div>Compute units: <span className="font-mono">{preparedExecution.simulation.unitsConsumed}</span></div>
                )}
                {preparedExecution.simulation.timestamp && (
                  <div>Simulated at: <span className="font-mono">{preparedExecution.simulation.timestamp}</span></div>
                )}
                {preparedExecution.simulation.errorMessage && (
                  <div className="text-rose-300">{preparedExecution.simulation.errorMessage}</div>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Account privileges</div>
              {preparedExecution.inspected.accounts.map((account) => (
                <div key={`${account.address}-${account.role}`} className="font-mono text-[11px] break-all">
                  {account.address} — {account.role}
                </div>
              ))}
            </div>
            {preparedExecution.simulation.logs && preparedExecution.simulation.logs.length > 0 && (
              <details>
                <summary className="cursor-pointer text-slate-400">Simulation program logs</summary>
                <pre className="mt-1 max-h-40 overflow-auto rounded bg-slate-950 p-2 text-[10px] text-slate-400">
                  {preparedExecution.simulation.logs.join("\n")}
                </pre>
              </details>
            )}
            {(!preparedExecution.authorization.allowed || preparedExecution.simulation.status !== "SUCCESS") && (
              <div className="text-rose-300">
                Signing is disabled: authorization must pass and simulation must succeed.
              </div>
            )}
          </div>
        )}

        {/* Execution status / evidence */}
        {executionStatus && (
          <div className="text-xs text-slate-300" role="status">{executionStatus}</div>
        )}
        {executionResult && (
          <div
            className={`rounded border p-3 text-xs space-y-1 ${
              executionResult.status === "CONFIRMED"
                ? "border-emerald-900/60 bg-emerald-950/20"
                : executionResult.status === "FAILED"
                  ? "border-rose-900/60 bg-rose-950/20"
                  : "border-amber-900/60 bg-amber-950/20"
            }`}
          >
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Execution evidence</div>
            <div>Status: <span className="text-sky-300">{executionResult.status || "ERROR"}</span></div>
            {executionResult.signature && (
              <div>Signature: <span className="font-mono break-all">{executionResult.signature}</span></div>
            )}
            {executionResult.slot && <div>Confirmation slot: <span className="font-mono">{executionResult.slot}</span></div>}
            {executionResult.explorerUrl && (
              <a className="text-purple-300 underline" href={executionResult.explorerUrl} target="_blank" rel="noreferrer">
                Verify on Solana Explorer (Devnet)
              </a>
            )}
            {executionResult.status === "UNKNOWN" && (
              <div className="text-amber-300">
                Submission outcome is uncertain. Do not resubmit. Inspect the signature/status first.
              </div>
            )}
            {executionResult.error && <div className="text-rose-300">{executionResult.error}</div>}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handlePrepareExecution}
            disabled={
              !selectedExecutionRunId ||
              !publicKey ||
              !connectedWallet ||
              !isDevnet ||
              isPreparing ||
              isSubmitting ||
              hasUnresolvedSubmission
            }
            className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs disabled:opacity-40"
          >
            {isPreparing ? "Inspecting & simulating..." : "Prepare & Simulate"}
          </button>
          <button
            type="button"
            onClick={handleSignAndSubmit}
            disabled={!canSignAndSubmit}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-40"
          >
            {isSubmitting ? "Waiting for wallet..." : "Sign & Submit to Devnet"}
          </button>
        </div>
      </div>
    </div>
  );
}
