import { AuthorizationMandate } from "@/domain/mandates/mandate";
import { ActionProposal, DecodedInstruction } from "@/domain/actions/proposal";
import { Finding, evaluateTransactionPolicy } from "@/domain/evaluation/evaluator";
import { SCENARIOS, ScenarioDefinition } from "@/domain/scenarios/definitions";
import { AgentAdapter, AgentProfileType } from "../agents/types";
import { SolanaInstructionAdapter } from "../solana/adapter";

export interface TimelineEvent {
  step: string;
  timestamp: string;
  description: string;
  status: "info" | "success" | "warning" | "error";
  metadata?: Record<string, unknown>;
}

export interface ScenarioTestResult {
  runId: string;
  scenarioId: string;
  scenarioName: string;
  scenarioCategory: string;
  agentProfileType: AgentProfileType;
  provider: "gemini" | "deterministic-demo";
  modelName: string;
  isDeterministicFallback: boolean;

  // The two core distinct metrics
  agentResistanceVerdict: "RESISTED" | "COMPROMISED";
  agentResistanceExplanation: string;
  policyEnforcementVerdict: "BLOCKED" | "PASSED";
  policyEnforcementExplanation: string;

  // Artifacts
  proposal: ActionProposal;
  decodedInstruction: DecodedInstruction;
  findings: Finding[];
  timeline: TimelineEvent[];
  remediation: ScenarioDefinition["remediationGuidance"];

  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export class ScenarioTestRunner {
  static async runScenario(options: {
    runId?: string;
    scenario: ScenarioDefinition;
    mandate: AuthorizationMandate;
    agentAdapter: AgentAdapter;
    profileType: AgentProfileType;
    customUntrustedContext?: string;
  }): Promise<ScenarioTestResult> {
    const startedAt = new Date().toISOString();
    const startTime = performance.now();
    const runId = options.runId || `RUN-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const timeline: TimelineEvent[] = [];

    // 1. Timeline event: Scenario initialization
    timeline.push({
      step: "INIT",
      timestamp: new Date().toISOString(),
      description: `Initialized test run for '${options.scenario.name}' against profile '${options.profileType}'.`,
      status: "info",
      metadata: { scenarioId: options.scenario.id, profile: options.profileType }
    });

    // 2. Timeline event: Mandate established
    timeline.push({
      step: "MANDATE_LOADED",
      timestamp: new Date().toISOString(),
      description: `Mandate '${options.mandate.name}' configured with max ${options.mandate.maxLamportsPerAction.toString()} lamports.`,
      status: "info",
      metadata: {
        maxLamports: options.mandate.maxLamportsPerAction.toString(),
        allowedRecipients: options.mandate.allowedRecipients
      }
    });

    // 3. Execution: Invoke Agent
    timeline.push({
      step: "AGENT_PROMPT",
      timestamp: new Date().toISOString(),
      description: "Dispatching task and untrusted context to AI Agent...",
      status: "info"
    });

    const agentResult = await options.agentAdapter.execute({
      scenarioId: options.scenario.id,
      userTask: options.scenario.userTask,
      untrustedContext: options.customUntrustedContext || options.scenario.untrustedContext,
      mandateRules: {
        maxLamports: options.mandate.maxLamportsPerAction.toString(),
        allowedRecipients: options.mandate.allowedRecipients,
        allowedPrograms: options.mandate.allowedPrograms,
        permittedActionTypes: options.mandate.permittedActionTypes
      },
      profileType: options.profileType
    });

    timeline.push({
      step: "AGENT_RESPONSE",
      timestamp: new Date().toISOString(),
      description: `Agent returned proposal '${agentResult.proposal.actionId}' in ${agentResult.executionTimeMs}ms (${agentResult.provider}).`,
      status: "info",
      metadata: {
        actionId: agentResult.proposal.actionId,
        actionType: agentResult.proposal.actionType,
        isDeterministicFallback: agentResult.isDeterministicFallback
      }
    });

    // 4. Assert Agent Resistance (Metric 1)
    const resistanceAssertion = options.scenario.assertAgentResistance(agentResult.proposal);
    const agentResistanceVerdict = resistanceAssertion.resisted ? "RESISTED" : "COMPROMISED";

    timeline.push({
      step: "AGENT_EVALUATION",
      timestamp: new Date().toISOString(),
      description: `Agent Resistance Verdict: ${agentResistanceVerdict}. ${resistanceAssertion.explanation}`,
      status: resistanceAssertion.resisted ? "success" : "warning"
    });

    // 5. Execution: Solana Instruction Construction & Deep Binary Inspection
    timeline.push({
      step: "SOLANA_INSPECTION",
      timestamp: new Date().toISOString(),
      description: "Converting proposal to Solana instruction and parsing binary structure...",
      status: "info"
    });

    const { decoded } = SolanaInstructionAdapter.processProposal(agentResult.proposal);

    timeline.push({
      step: "SOLANA_DECODED",
      timestamp: new Date().toISOString(),
      description: `Decoded Solana instruction: Program=${decoded.programAddress}, Type=${decoded.instructionType}, Destination=${decoded.recipient || "N/A"}, Lamports=${decoded.lamports?.toString() || "N/A"}.`,
      status: decoded.instructionType === "MALFORMED" ? "error" : "info"
    });

    // 6. Independent Policy Evaluation (Metric 2)
    timeline.push({
      step: "POLICY_EVALUATION",
      timestamp: new Date().toISOString(),
      description: "Evaluating decoded Solana instruction against authorization mandate...",
      status: "info"
    });

    const evaluationReport = evaluateTransactionPolicy(options.mandate, agentResult.proposal, decoded);

    const policyAssertion = options.scenario.assertPolicyEnforcement(evaluationReport);
    const policyEnforcementVerdict = evaluationReport.allowed ? "PASSED" : "BLOCKED";

    timeline.push({
      step: "ENFORCEMENT_VERDICT",
      timestamp: new Date().toISOString(),
      description: `Authorization Enforcement: ${policyEnforcementVerdict} (${evaluationReport.findings.length} findings). ${policyAssertion.explanation}`,
      status: evaluationReport.allowed ? "success" : "error",
      metadata: { findingsCount: evaluationReport.findings.length }
    });

    const completedAt = new Date().toISOString();
    const durationMs = Math.round(performance.now() - startTime);

    return {
      runId,
      scenarioId: options.scenario.id,
      scenarioName: options.scenario.name,
      scenarioCategory: options.scenario.category,
      agentProfileType: options.profileType,
      provider: agentResult.provider,
      modelName: agentResult.modelName,
      isDeterministicFallback: agentResult.isDeterministicFallback,
      agentResistanceVerdict,
      agentResistanceExplanation: resistanceAssertion.explanation,
      policyEnforcementVerdict,
      policyEnforcementExplanation: policyAssertion.explanation,
      proposal: agentResult.proposal,
      decodedInstruction: decoded,
      findings: evaluationReport.findings,
      timeline,
      remediation: options.scenario.remediationGuidance,
      startedAt,
      completedAt,
      durationMs
    };
  }

  /**
   * Run the full test suite (all 5 scenarios or selected ones)
   */
  static async runSuite(options: {
    scenarioIds?: string[];
    mandate: AuthorizationMandate;
    agentAdapter: AgentAdapter;
    profileType: AgentProfileType;
  }): Promise<ScenarioTestResult[]> {
    const selectedScenarios = options.scenarioIds?.length
      ? SCENARIOS.filter((s) => options.scenarioIds?.includes(s.id))
      : SCENARIOS;

    const results: ScenarioTestResult[] = [];
    for (const scenario of selectedScenarios) {
      const result = await this.runScenario({
        scenario,
        mandate: options.mandate,
        agentAdapter: options.agentAdapter,
        profileType: options.profileType
      });
      results.push(result);
    }
    return results;
  }
}
