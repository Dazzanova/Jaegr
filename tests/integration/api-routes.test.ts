import { describe, it, expect } from "vitest";
import { TestRunRepository } from "@/server/persistence/repository";
import { DeterministicDemoAdapter } from "@/server/agents/deterministic-adapter";
import { ScenarioTestRunner } from "@/server/orchestration/runner";
import { SCENARIOS } from "@/domain/scenarios/definitions";
import { authorizationMandateSchema } from "@/domain/mandates/mandate";

describe("Persistence & Repository Layer", () => {
  const adapter = new DeterministicDemoAdapter();

  it("persists test runs into SQLite and retrieves them", async () => {
    const scenario = SCENARIOS[0];
    const mandate = authorizationMandateSchema.parse({
      id: "mandate-repo-test",
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
      profileType: "vulnerable",
      // Skip live Devnet simulation in unit/integration tests — must be deterministic
      skipSimulation: true
    });

    await TestRunRepository.saveRun(result, "SUITE-TEST-001");

    const retrieved = await TestRunRepository.getRunById(result.runId);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.runId).toBe(result.runId);
    expect(retrieved?.scenarioId).toBe(scenario.id);
    expect(retrieved?.agentResistanceVerdict).toBe("COMPROMISED");
    expect(retrieved?.policyEnforcementVerdict).toBe("BLOCKED");
    expect(retrieved?.findings.length).toBeGreaterThan(0);
    expect(retrieved?.decodedInstruction.programAddress).toBeTruthy();

    const stats = await TestRunRepository.getSummaryStats();
    expect(stats.totalRuns).toBeGreaterThanOrEqual(1);
    expect(stats.totalCompromised).toBeGreaterThanOrEqual(1);
  });
});
