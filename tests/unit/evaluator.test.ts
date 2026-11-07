import { describe, it, expect } from "vitest";
import {
  authorizationMandateSchema,
  AuthorizationMandate,
  solToLamports,
  lamportsToSolString,
  SYSTEM_PROGRAM_ID
} from "@/domain/mandates/mandate";
import { ActionProposal } from "@/domain/actions/proposal";
import { SolanaInstructionAdapter } from "@/server/solana/adapter";
import { evaluateTransactionPolicy } from "@/domain/evaluation/evaluator";

const ALICE_ADDRESS = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ATTACKER_ADDRESS = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const ROGUE_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

describe("Mandate & Lamport Helpers", () => {
  it("converts SOL to lamports with integer precision", () => {
    expect(solToLamports("1.0")).toBe(1_000_000_000n);
    expect(solToLamports("0.05")).toBe(50_000_000n);
    expect(solToLamports("0.000000001")).toBe(1n);
    expect(solToLamports("100")).toBe(100_000_000_000n);
  });

  it("formats lamports back to readable SOL string", () => {
    expect(lamportsToSolString(1_000_000_000n)).toBe("1");
    expect(lamportsToSolString(50_000_000n)).toBe("0.05");
    expect(lamportsToSolString(1n)).toBe("0.000000001");
  });

  it("throws on invalid SOL decimal places beyond 9", () => {
    expect(() => solToLamports("0.0000000001")).toThrow("maximum of 9 decimal places");
  });

  it("validates valid mandate with Zod", () => {
    const raw = {
      id: "mandate-1",
      name: "Staging Test Mandate",
      maxLamportsPerAction: "100000000", // 0.1 SOL
      allowedRecipients: [ALICE_ADDRESS],
      allowedPrograms: [SYSTEM_PROGRAM_ID],
      permittedActionTypes: ["sol_transfer"],
      seenActionIds: []
    };
    const parsed = authorizationMandateSchema.parse(raw);
    expect(parsed.maxLamportsPerAction).toBe(100_000_000n);
    expect(parsed.allowedRecipients).toContain(ALICE_ADDRESS);
  });

  it("rejects invalid Solana address in mandate", () => {
    const raw = {
      id: "mandate-bad",
      name: "Bad Mandate",
      maxLamportsPerAction: "100000000",
      allowedRecipients: ["invalid-000-address"],
      allowedPrograms: [SYSTEM_PROGRAM_ID],
      permittedActionTypes: ["sol_transfer"]
    };
    expect(() => authorizationMandateSchema.parse(raw)).toThrow();
  });
});

describe("Independent Policy Evaluator Invariants", () => {
  const baseMandate: AuthorizationMandate = {
    id: "mandate-test",
    name: "Standard Safety Mandate",
    maxLamportsPerAction: 100_000_000n, // 0.1 SOL
    allowedRecipients: [ALICE_ADDRESS],
    allowedPrograms: [SYSTEM_PROGRAM_ID],
    permittedActionTypes: ["sol_transfer"],
    seenActionIds: ["action-replay-001"]
  };

  it("allows safe proposal at or below limit to authorized recipient", () => {
    const proposal: ActionProposal = {
      actionId: "action-valid-001",
      actionType: "sol_transfer",
      description: "Transfer 0.05 SOL to Alice",
      parameters: {
        recipient: ALICE_ADDRESS,
        lamports: "50000000" // 0.05 SOL
      }
    };

    const { decoded } = SolanaInstructionAdapter.processProposal(proposal);
    const report = evaluateTransactionPolicy(baseMandate, proposal, decoded);

    expect(report.allowed).toBe(true);
    expect(report.findings).toHaveLength(0);
  });

  it("allows exact spending limit (boundary check: amount == limit)", () => {
    const proposal: ActionProposal = {
      actionId: "action-exact-001",
      actionType: "sol_transfer",
      description: "Transfer exactly 0.1 SOL to Alice",
      parameters: {
        recipient: ALICE_ADDRESS,
        lamports: "100000000" // exactly 0.1 SOL
      }
    };

    const { decoded } = SolanaInstructionAdapter.processProposal(proposal);
    const report = evaluateTransactionPolicy(baseMandate, proposal, decoded);

    expect(report.allowed).toBe(true);
    expect(report.findings).toHaveLength(0);
  });

  it("blocks proposal exceeding spending limit (amount > limit by 1 lamport)", () => {
    const proposal: ActionProposal = {
      actionId: "action-over-001",
      actionType: "sol_transfer",
      description: "Transfer 0.100000001 SOL to Alice",
      parameters: {
        recipient: ALICE_ADDRESS,
        lamports: "100000001" // 1 lamport over limit
      }
    };

    const { decoded } = SolanaInstructionAdapter.processProposal(proposal);
    const report = evaluateTransactionPolicy(baseMandate, proposal, decoded);

    expect(report.allowed).toBe(false);
    expect(report.findings.some((f) => f.ruleViolated === "AMOUNT_EXCEEDS_MANDATE")).toBe(true);
  });

  it("blocks proposal to disallowed/attacker recipient", () => {
    const proposal: ActionProposal = {
      actionId: "action-disallowed-recip",
      actionType: "sol_transfer",
      description: "Send SOL to attacker address",
      parameters: {
        recipient: ATTACKER_ADDRESS,
        lamports: "10000000" // 0.01 SOL (within limit)
      }
    };

    const { decoded } = SolanaInstructionAdapter.processProposal(proposal);
    const report = evaluateTransactionPolicy(baseMandate, proposal, decoded);

    expect(report.allowed).toBe(false);
    expect(report.findings.some((f) => f.ruleViolated === "RECIPIENT_NOT_ALLOWLISTED")).toBe(true);
    const recipFinding = report.findings.find((f) => f.ruleViolated === "RECIPIENT_NOT_ALLOWLISTED");
    expect(recipFinding?.actualValue).toBe(ATTACKER_ADDRESS);
  });

  it("blocks duplicate/replayed action ID", () => {
    const proposal: ActionProposal = {
      actionId: "action-replay-001", // matches seenActionIds
      actionType: "sol_transfer",
      description: "Replayed payout to Alice",
      parameters: {
        recipient: ALICE_ADDRESS,
        lamports: "50000000"
      }
    };

    const { decoded } = SolanaInstructionAdapter.processProposal(proposal);
    const report = evaluateTransactionPolicy(baseMandate, proposal, decoded);

    expect(report.allowed).toBe(false);
    expect(report.findings.some((f) => f.ruleViolated === "DUPLICATE_ACTION_ID")).toBe(true);
  });

  it("blocks unauthorized program interaction", () => {
    const proposal: ActionProposal = {
      actionId: "action-rogue-prog",
      actionType: "program_interaction",
      description: "Invoke Memo program",
      parameters: {
        programId: ROGUE_PROGRAM_ID,
        data: "SGVsbG8="
      }
    };

    const { decoded } = SolanaInstructionAdapter.processProposal(proposal);
    const report = evaluateTransactionPolicy(baseMandate, proposal, decoded);

    expect(report.allowed).toBe(false);
    expect(report.findings.some((f) => f.ruleViolated === "PROGRAM_NOT_ALLOWLISTED")).toBe(true);
    expect(report.findings.some((f) => f.ruleViolated === "ACTION_TYPE_NOT_PERMITTED")).toBe(true);
  });

  it("blocks malformed instruction safely", () => {
    const proposal: ActionProposal = {
      actionId: "action-malformed",
      actionType: "sol_transfer",
      description: "Missing parameters",
      parameters: {
        recipient: undefined,
        lamports: undefined
      }
    };

    const { decoded } = SolanaInstructionAdapter.processProposal(proposal);
    const report = evaluateTransactionPolicy(baseMandate, proposal, decoded);

    expect(report.allowed).toBe(false);
    expect(report.findings.some((f) => f.ruleViolated === "INVALID_INSTRUCTION")).toBe(true);
  });
});
