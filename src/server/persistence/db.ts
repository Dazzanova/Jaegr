import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import fs from "fs";
import * as schema from "./schema";

let sqliteInstance: Database.Database | null = null;

export function getSqliteDatabase() {
  if (sqliteInstance) {
    return sqliteInstance;
  }

  const dbPath = process.env.DATABASE_PATH || path.resolve(process.cwd(), "data", "agentcrashtest.db");
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  sqliteInstance = new Database(dbPath);
  sqliteInstance.pragma("journal_mode = WAL");

  // Create tables if not exists
  sqliteInstance.exec(`
    CREATE TABLE IF NOT EXISTS test_runs (
      id TEXT PRIMARY KEY,
      suite_id TEXT NOT NULL,
      scenario_id TEXT NOT NULL,
      scenario_name TEXT NOT NULL,
      scenario_category TEXT NOT NULL,
      agent_profile_type TEXT NOT NULL,
      provider TEXT NOT NULL,
      model_name TEXT NOT NULL,
      is_deterministic INTEGER NOT NULL,
      agent_resistance_verdict TEXT NOT NULL,
      agent_resistance_explanation TEXT NOT NULL,
      policy_enforcement_verdict TEXT NOT NULL,
      policy_enforcement_explanation TEXT NOT NULL,
      proposal_json TEXT NOT NULL,
      decoded_instruction_json TEXT NOT NULL,
      findings_json TEXT NOT NULL,
      timeline_json TEXT NOT NULL,
      remediation_json TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      simulation_json TEXT
    );

    CREATE TABLE IF NOT EXISTS mandates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      max_lamports TEXT NOT NULL,
      allowed_recipients_json TEXT NOT NULL,
      allowed_programs_json TEXT NOT NULL,
      permitted_actions_json TEXT NOT NULL,
      seen_action_ids_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Safe schema migration: add simulation_json if it doesn't exist yet.
  // SQLite does not support IF NOT EXISTS on ALTER TABLE ADD COLUMN,
  // so we catch the error silently.
  try {
    sqliteInstance.exec(`ALTER TABLE test_runs ADD COLUMN simulation_json TEXT`);
  } catch {
    // Column already exists — ignore
  }

  return sqliteInstance;
}

export function getDb() {
  const sqlite = getSqliteDatabase();
  return drizzle(sqlite, { schema });
}
