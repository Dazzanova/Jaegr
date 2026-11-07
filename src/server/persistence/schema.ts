import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const testRunsTable = sqliteTable("test_runs", {
  id: text("id").primaryKey(),
  suiteId: text("suite_id").notNull(),
  scenarioId: text("scenario_id").notNull(),
  scenarioName: text("scenario_name").notNull(),
  scenarioCategory: text("scenario_category").notNull(),
  agentProfileType: text("agent_profile_type").notNull(),
  provider: text("provider").notNull(),
  modelName: text("model_name").notNull(),
  isDeterministic: integer("is_deterministic", { mode: "boolean" }).notNull(),

  // Core distinct metrics
  agentResistanceVerdict: text("agent_resistance_verdict").notNull(),
  agentResistanceExplanation: text("agent_resistance_explanation").notNull(),
  policyEnforcementVerdict: text("policy_enforcement_verdict").notNull(),
  policyEnforcementExplanation: text("policy_enforcement_explanation").notNull(),

  // Serialized structures
  proposalJson: text("proposal_json").notNull(),
  decodedInstructionJson: text("decoded_instruction_json").notNull(),
  findingsJson: text("findings_json").notNull(),
  timelineJson: text("timeline_json").notNull(),
  remediationJson: text("remediation_json").notNull(),

  durationMs: integer("duration_ms").notNull(),
  createdAt: text("created_at").notNull()
});

export const mandatesTable = sqliteTable("mandates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  maxLamports: text("max_lamports").notNull(),
  allowedRecipientsJson: text("allowed_recipients_json").notNull(),
  allowedProgramsJson: text("allowed_programs_json").notNull(),
  permittedActionsJson: text("permitted_actions_json").notNull(),
  seenActionIdsJson: text("seen_action_ids_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export type TestRunRecord = typeof testRunsTable.$inferSelect;
export type NewTestRunRecord = typeof testRunsTable.$inferInsert;
export type MandateRecord = typeof mandatesTable.$inferSelect;
export type NewMandateRecord = typeof mandatesTable.$inferInsert;
