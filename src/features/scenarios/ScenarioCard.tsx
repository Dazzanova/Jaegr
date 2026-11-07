import React from "react";
import { ArrowRight, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface ScenarioItem {
  id: string;
  name: string;
  category: string;
  description: string;
  attackVector: string;
  attackPayload: string;
  userTask: string;
  untrustedContext: string;
  defaultMandate: {
    name: string;
    maxSolAmount: string;
    maxLamports: string;
    allowedRecipients: string[];
    allowedPrograms: string[];
    permittedActionTypes: string[];
    seenActionIds: string[];
  };
  expectedAgentBehavior: string;
  expectedPolicyBehavior: string;
  remediationGuidance: {
    promptHardening: string;
    mandateConfiguration: string;
    solanaGuardrail: string;
  };
}

interface ScenarioCardProps {
  scenario: ScenarioItem;
  onSelect?: (scenarioId: string) => void;
  isSelected?: boolean;
}

export function ScenarioCard({ scenario, onSelect, isSelected }: ScenarioCardProps) {
  const categoryVariant: Record<string, "danger" | "warning" | "purple" | "info"> = {
    INJECTION: "danger",
    ESCALATION: "warning",
    SUBSTITUTION: "purple",
    UNAUTHORIZED_PROGRAM: "danger",
    REPLAY: "info"
  };

  return (
    <div
      className={`rounded-xl border transition-all ${
        isSelected
          ? "border-purple-500 bg-slate-900/90 shadow-lg shadow-purple-950/40 ring-1 ring-purple-500"
          : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60"
      } p-5 flex flex-col justify-between`}
    >
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          <Badge variant={categoryVariant[scenario.category] || "neutral"}>
            {scenario.category}
          </Badge>
          <span className="text-xs font-mono text-slate-500">{scenario.id.split("-")[1]}</span>
        </div>

        <h3 className="font-semibold text-white text-base mb-1.5">{scenario.name}</h3>
        <p className="text-sm text-slate-400 mb-4 leading-relaxed">{scenario.description}</p>

        <div className="space-y-3 font-mono text-xs">
          <div className="bg-slate-950/60 rounded-lg p-3 border border-slate-800/80">
            <span className="text-slate-500 block mb-1 font-sans text-[11px] font-semibold uppercase tracking-wider">
              Adversary Attack Payload
            </span>
            <p className="text-rose-400/90 line-clamp-3 break-all">{scenario.attackPayload}</p>
          </div>

          <div className="bg-slate-950/60 rounded-lg p-3 border border-slate-800/80">
            <span className="text-slate-500 block mb-1 font-sans text-[11px] font-semibold uppercase tracking-wider">
              Legitimate User Task
            </span>
            <p className="text-slate-300 line-clamp-2">{scenario.userTask}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Lock className="w-3.5 h-3.5 text-slate-500" />
          <span>Mandate Cap: {scenario.defaultMandate.maxSolAmount} SOL</span>
        </div>
        {onSelect && (
          <button
            onClick={() => onSelect(scenario.id)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
              isSelected
                ? "bg-purple-600 text-white"
                : "text-purple-400 hover:bg-purple-950/60 border border-purple-800/40"
            }`}
          >
            <span>{isSelected ? "Selected" : "Test Scenario"}</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
