import { AuthorizationMandate } from "@/domain/mandates/mandate";
import { ActionProposal, DecodedInstruction } from "@/domain/actions/proposal";
import { Finding, evaluateTransactionPolicy } from "@/domain/evaluation/evaluator";
import { SCENARIOS, ScenarioDefinition } from "@/domain/scenarios/definitions";
import { AgentAdapter, AgentProfileType, AgentProviderId } from "../agents/types";
import { SolanaInstructionAdapter } from "../solana/adapter";
import { SimulationService, SimulationResult } from "../solana/simulation/service";

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
  provider: AgentProviderId;
  modelName: string;
  isDeterministicFallback: boolean;

  // The two core distinct metrics
  agentResistanceVerdict: "RESISTED" | "COMPROMISED";
  agentResistanceExplanation: string;
  policyEnforcementVerdict: "BLOCKED" | "PASSED";
  policyEnforcementExplanation: string;

  // Simulation result — always independent from authorization
  simulationResult: SimulationResult;

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
    /** Explicitly skip simulation (e.g. in CI or when RPC is unavailable) */
    skipSimulation?: boolean;
    /** Optional connected wallet address to use as fee payer for simulation */
    feePayerAddress?: string;
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

    const { decoded } = SolanaInstructionAdapter.processProposal(agentResult.proposal, {
      sourceAddress: options.feePayerAddress
    });

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

    // 7. Devnet Simulation (independent of authorization)
    timeline.push({
      step: "SIMULATION_START",
      timestamp: new Date().toISOString(),
      description: "Submitting instruction to Devnet simulation...",
      status: "info"
    });

    let simulationResult: SimulationResult;

    if (options.skipSimulation) {
      simulationResult = {
        status: "NOT_RUN",
        timestamp: new Date().toISOString(),
        durationMs: 0,
        errorMessage: "Simulation skipped by caller (skipSimulation=true)"
      };
    } else {
      simulationResult = await SimulationService.simulate(decoded, options.feePayerAddress);
    }

    timeline.push({
      step: "SIMULATION_RESULT",
      timestamp: new Date().toISOString(),
      description: `Devnet simulation: ${simulationResult.status}. ${simulationResult.errorMessage || (simulationResult.unitsConsumed ? `Compute units: ${simulationResult.unitsConsumed}` : "")}`,
      status:
        simulationResult.status === "SUCCESS" ? "success" :
        simulationResult.status === "NOT_RUN" ? "info" :
        "error",
      metadata: {
        simulationStatus: simulationResult.status,
        unitsConsumed: simulationResult.unitsConsumed,
        logCount: simulationResult.logs?.length ?? 0
      }
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
      simulationResult,
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
    skipSimulation?: boolean;
    feePayerAddress?: string;
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
        profileType: options.profileType,
        skipSimulation: options.skipSimulation,
        feePayerAddress: options.feePayerAddress
      });
      results.push(result);
    }
    return results;
  }
}
