import { desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { testRunsTable, mandatesTable, TestRunRecord } from "./schema";
import { ScenarioTestResult } from "../orchestration/runner";
import { AuthorizationMandate, authorizationMandateSchema } from "@/domain/mandates/mandate";

export interface StoredTestRun extends ScenarioTestResult {
  suiteId: string;
}

export interface SummaryStats {
  totalRuns: number;
  totalCompromised: number;
  totalResisted: number;
  totalBlockedByPolicy: number;
  totalPassedByPolicy: number;
  distinctScenariosTested: number;
}

function safeJsonStringify(obj: unknown): string {
  return JSON.stringify(obj, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
}

export class TestRunRepository {
  static async saveRun(run: ScenarioTestResult, suiteId?: string): Promise<void> {
    const db = getDb();
    const effectiveSuiteId = suiteId || run.runId;

    await db.insert(testRunsTable).values({
      id: run.runId,
      suiteId: effectiveSuiteId,
      scenarioId: run.scenarioId,
      scenarioName: run.scenarioName,
      scenarioCategory: run.scenarioCategory,
      agentProfileType: run.agentProfileType,
      provider: run.provider,
      modelName: run.modelName,
      isDeterministic: run.isDeterministicFallback,
      agentResistanceVerdict: run.agentResistanceVerdict,
      agentResistanceExplanation: run.agentResistanceExplanation,
      policyEnforcementVerdict: run.policyEnforcementVerdict,
      policyEnforcementExplanation: run.policyEnforcementExplanation,
      proposalJson: safeJsonStringify(run.proposal),
      decodedInstructionJson: safeJsonStringify(run.decodedInstruction),
      findingsJson: safeJsonStringify(run.findings),
      timelineJson: safeJsonStringify(run.timeline),
      remediationJson: safeJsonStringify(run.remediation),
      durationMs: run.durationMs,
      createdAt: run.completedAt || run.startedAt
    }).onConflictDoUpdate({
      target: testRunsTable.id,
      set: {
        agentResistanceVerdict: run.agentResistanceVerdict,
        policyEnforcementVerdict: run.policyEnforcementVerdict,
        findingsJson: safeJsonStringify(run.findings),
        timelineJson: safeJsonStringify(run.timeline)
      }
    });
  }

  static async listRuns(limit = 50): Promise<StoredTestRun[]> {
    const db = getDb();
    const records = await db
      .select()
      .from(testRunsTable)
      .orderBy(desc(testRunsTable.createdAt))
      .limit(limit);

    return records.map(this.mapRecordToRun);
  }

  static async getRunById(id: string): Promise<StoredTestRun | null> {
    const db = getDb();
    const records = await db
      .select()
      .from(testRunsTable)
      .where(eq(testRunsTable.id, id))
      .limit(1);

    if (records.length === 0) return null;
    return this.mapRecordToRun(records[0]);
  }

  static async getSummaryStats(): Promise<SummaryStats> {
    const db = getDb();
    const all = await db.select().from(testRunsTable);

    let totalCompromised = 0;
    let totalResisted = 0;
    let totalBlockedByPolicy = 0;
    let totalPassedByPolicy = 0;
    const scenarioSet = new Set<string>();

    for (const r of all) {
      if (r.agentResistanceVerdict === "COMPROMISED") totalCompromised++;
      if (r.agentResistanceVerdict === "RESISTED") totalResisted++;
      if (r.policyEnforcementVerdict === "BLOCKED") totalBlockedByPolicy++;
      if (r.policyEnforcementVerdict === "PASSED") totalPassedByPolicy++;
      scenarioSet.add(r.scenarioId);
    }

    return {
      totalRuns: all.length,
      totalCompromised,
      totalResisted,
      totalBlockedByPolicy,
      totalPassedByPolicy,
      distinctScenariosTested: scenarioSet.size
    };
  }

  private static mapRecordToRun(record: TestRunRecord): StoredTestRun {
    const decodedRaw = JSON.parse(record.decodedInstructionJson);
    if (decodedRaw.lamports !== undefined && decodedRaw.lamports !== null) {
      decodedRaw.lamports = BigInt(decodedRaw.lamports);
    }

    return {
      runId: record.id,
      suiteId: record.suiteId,
      scenarioId: record.scenarioId,
      scenarioName: record.scenarioName,
      scenarioCategory: record.scenarioCategory,
      agentProfileType: record.agentProfileType as StoredTestRun["agentProfileType"],
      provider: record.provider as StoredTestRun["provider"],
      modelName: record.modelName,
      isDeterministicFallback: Boolean(record.isDeterministic),
      agentResistanceVerdict: record.agentResistanceVerdict as StoredTestRun["agentResistanceVerdict"],
      agentResistanceExplanation: record.agentResistanceExplanation,
      policyEnforcementVerdict: record.policyEnforcementVerdict as StoredTestRun["policyEnforcementVerdict"],
      policyEnforcementExplanation: record.policyEnforcementExplanation,
      proposal: JSON.parse(record.proposalJson),
      decodedInstruction: decodedRaw,
      findings: JSON.parse(record.findingsJson),
      timeline: JSON.parse(record.timelineJson),
      remediation: JSON.parse(record.remediationJson),
      startedAt: record.createdAt,
      completedAt: record.createdAt,
      durationMs: record.durationMs
    };
  }
}

export class MandateRepository {
  static async saveMandate(mandate: AuthorizationMandate): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();

    await db.insert(mandatesTable).values({
      id: mandate.id,
      name: mandate.name,
      description: mandate.description || "",
      maxLamports: mandate.maxLamportsPerAction.toString(),
      allowedRecipientsJson: safeJsonStringify(mandate.allowedRecipients),
      allowedProgramsJson: safeJsonStringify(mandate.allowedPrograms),
      permittedActionsJson: safeJsonStringify(mandate.permittedActionTypes),
      seenActionIdsJson: safeJsonStringify(mandate.seenActionIds),
      createdAt: now,
      updatedAt: now
    }).onConflictDoUpdate({
      target: mandatesTable.id,
      set: {
        name: mandate.name,
        description: mandate.description || "",
        maxLamports: mandate.maxLamportsPerAction.toString(),
        allowedRecipientsJson: safeJsonStringify(mandate.allowedRecipients),
        allowedProgramsJson: safeJsonStringify(mandate.allowedPrograms),
        permittedActionsJson: safeJsonStringify(mandate.permittedActionTypes),
        seenActionIdsJson: safeJsonStringify(mandate.seenActionIds),
        updatedAt: now
      }
    });
  }

  static async getMandateById(id: string): Promise<AuthorizationMandate | null> {
    const db = getDb();
    const records = await db
      .select()
      .from(mandatesTable)
      .where(eq(mandatesTable.id, id))
      .limit(1);

    if (records.length === 0) return null;
    const r = records[0];

    return authorizationMandateSchema.parse({
      id: r.id,
      name: r.name,
      description: r.description || undefined,
      maxLamportsPerAction: r.maxLamports,
      allowedRecipients: JSON.parse(r.allowedRecipientsJson),
      allowedPrograms: JSON.parse(r.allowedProgramsJson),
      permittedActionTypes: JSON.parse(r.permittedActionsJson),
      seenActionIds: JSON.parse(r.seenActionIdsJson)
    });
  }
}
