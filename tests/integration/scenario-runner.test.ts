import { describe, it, expect } from "vitest";
import { SCENARIOS } from "@/domain/scenarios/definitions";
import { authorizationMandateSchema } from "@/domain/mandates/mandate";
import { DeterministicDemoAdapter } from "@/server/agents/deterministic-adapter";
import { ScenarioTestRunner } from "@/server/orchestration/runner";

describe("Scenario Runner Integration Pipeline", () => {
  const adapter = new DeterministicDemoAdapter();

  it("loads all 5 required adversarial scenarios", () => {
    expect(SCENARIOS).toHaveLength(5);
    const ids = SCENARIOS.map((s) => s.id);
    expect(ids).toContain("scenario-1-token-metadata-injection");
    expect(ids).toContain("scenario-2-spending-limit-escalation");
    expect(ids).toContain("scenario-3-recipient-substitution");
    expect(ids).toContain("scenario-4-unauthorized-program");
    expect(ids).toContain("scenario-5-replayed-action-id");
  });

  for (const scenario of SCENARIOS) {
    it(`executes ${scenario.id} with vulnerable agent: catches compromise and enforces policy`, async () => {
      const mandate = authorizationMandateSchema.parse({
        id: `mandate-${scenario.id}`,
        name: scenario.defaultMandate.name,
        maxLamportsPerAction: scenario.defaultMandate.maxLamports,
        allowedRecipients: scenario.defaultMandate.allowedRecipients,
        allowedPrograms: scenario.defaultMandate.allowedPrograms,
        permittedActionTypes: scenario.defaultMandate.permittedActionTypes,
        seenActionIds: scenario.defaultMandate.seenActionIds
      });

      const result = await ScenarioTestRunner.runScenario({
        scenario,
        mandate,
        agentAdapter: adapter,
        profileType: "vulnerable"
      });

      // Metric 1: Agent Resistance
      expect(result.agentResistanceVerdict).toBe("COMPROMISED");
      expect(result.agentResistanceExplanation).toBeTruthy();

      // Metric 2: Policy Enforcement
      expect(result.policyEnforcementVerdict).toBe("BLOCKED");
      expect(result.findings.length).toBeGreaterThan(0);

      // Decoded Solana Instruction
      expect(result.decodedInstruction.programAddress).toBeTruthy();

      // Timeline events
      expect(result.timeline.length).toBeGreaterThanOrEqual(6);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it(`executes ${scenario.id} with hardened agent: resists attack cleanly`, async () => {
      const mandate = authorizationMandateSchema.parse({
        id: `mandate-${scenario.id}`,
        name: scenario.defaultMandate.name,
        maxLamportsPerAction: scenario.defaultMandate.maxLamports,
        allowedRecipients: scenario.defaultMandate.allowedRecipients,
        allowedPrograms: scenario.defaultMandate.allowedPrograms,
        permittedActionTypes: scenario.defaultMandate.permittedActionTypes,
        seenActionIds: scenario.defaultMandate.seenActionIds
      });

      const result = await ScenarioTestRunner.runScenario({
        scenario,
        mandate,
        agentAdapter: adapter,
        profileType: "hardened"
      });

      // Metric 1: Agent Resistance
      expect(result.agentResistanceVerdict).toBe("RESISTED");

      // Metric 2: Policy Enforcement passes for safe proposals
      expect(result.policyEnforcementVerdict).toBe("PASSED");
      expect(result.findings).toHaveLength(0);
    });
  }
});
