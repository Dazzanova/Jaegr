import { describe, expect, it } from "vitest";
import { evaluateInstructionSetPolicy } from "@/domain/evaluation/evaluator";
import { authorizationMandateSchema } from "@/domain/mandates/mandate";
import { ActionProposal, DecodedInstruction } from "@/domain/actions/proposal";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { SolanaInstructionAdapter } from "@/server/solana/adapter";

const ALICE = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ATTACKER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const OTHER_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

const mandate = authorizationMandateSchema.parse({
  id: "m-cumulative",
  name: "Cumulative mandate",
  maxLamportsPerAction: "100",
  allowedRecipients: [ALICE],
  allowedPrograms: [SYSTEM_PROGRAM_ADDRESS],
  permittedActionTypes: ["sol_transfer"],
  seenActionIds: []
});

const proposal: ActionProposal = {
  actionId: "ACT-CUMULATIVE",
  actionType: "sol_transfer",
  description: "A batch proposal",
  parameters: {}
};

function transfer(recipient: string, lamports: bigint, programAddress: string = SYSTEM_PROGRAM_ADDRESS): DecodedInstruction {
  return {
    programAddress,
    instructionType: "SYSTEM_TRANSFER",
    accounts: [],
    source: "83vSikV2eS2L54R8iH8Gv5vM2y9zH3R5xQv8vT3s8XqZ",
    recipient,
    lamports
  };
}

describe("cumulative and multi-instruction authorization", () => {
  it("allows multiple instructions whose cumulative amount equals the cap", () => {
    const report = evaluateInstructionSetPolicy(mandate, proposal, [
      transfer(ALICE, 50n),
      transfer(ALICE, 50n)
    ]);

    expect(report.allowed).toBe(true);
    expect(report.findings).toHaveLength(0);
  });

  it("blocks multiple individually-valid instructions that exceed the cap cumulatively", () => {
    const report = evaluateInstructionSetPolicy(mandate, proposal, [
      transfer(ALICE, 60n),
      transfer(ALICE, 60n)
    ]);

    expect(report.allowed).toBe(false);
    expect(report.findings.some((f) => f.ruleViolated === "CUMULATIVE_AMOUNT_EXCEEDS_MANDATE")).toBe(true);
  });

  it("blocks one lamport above the cumulative cap", () => {
    const report = evaluateInstructionSetPolicy(mandate, proposal, [
      transfer(ALICE, 50n),
      transfer(ALICE, 51n)
    ]);

    expect(report.allowed).toBe(false);
    expect(report.findings.some((f) => f.ruleViolated === "CUMULATIVE_AMOUNT_EXCEEDS_MANDATE")).toBe(true);
  });

  it("rejects a disallowed recipient in any instruction of the set", () => {
    const report = evaluateInstructionSetPolicy(mandate, proposal, [
      transfer(ALICE, 10n),
      transfer(ATTACKER, 10n)
    ]);

    expect(report.allowed).toBe(false);
    expect(report.findings.some((f) => f.ruleViolated === "RECIPIENT_NOT_ALLOWLISTED")).toBe(true);
  });

  it("rejects a disallowed program in any instruction of the set", () => {
    const report = evaluateInstructionSetPolicy(mandate, proposal, [
      transfer(ALICE, 10n),
      transfer(ALICE, 10n, OTHER_PROGRAM)
    ]);

    expect(report.allowed).toBe(false);
    expect(report.findings.some((f) => f.ruleViolated === "PROGRAM_NOT_ALLOWLISTED")).toBe(true);
  });

  it("rejects malformed or unsupported instructions inside a set", () => {
    const report = evaluateInstructionSetPolicy(mandate, proposal, [
      transfer(ALICE, 10n),
      {
        programAddress: SYSTEM_PROGRAM_ADDRESS,
        instructionType: "MALFORMED",
        accounts: [],
        decodingError: "bad payload"
      }
    ]);

    expect(report.allowed).toBe(false);
    expect(report.findings.some((f) => f.ruleViolated === "INVALID_INSTRUCTION")).toBe(true);
  });

  it("rejects a replayed action ID even for a valid instruction set", () => {
    const replayMandate = { ...mandate, seenActionIds: [proposal.actionId] };
    const report = evaluateInstructionSetPolicy(replayMandate, proposal, [transfer(ALICE, 10n)]);

    expect(report.allowed).toBe(false);
    expect(report.findings.some((f) => f.ruleViolated === "DUPLICATE_ACTION_ID")).toBe(true);
  });
});

describe("batch proposal decoding", () => {
  it("decodes every sub-proposal and aggregates total lamports", () => {
    const batch: ActionProposal = {
      actionId: "ACT-BATCH",
      actionType: "batch",
      description: "Two transfers",
      parameters: {
        subProposals: [
          {
            actionId: "ACT-BATCH-1",
            actionType: "sol_transfer",
            description: "First",
            parameters: { recipient: ALICE, lamports: "40" }
          },
          {
            actionId: "ACT-BATCH-2",
            actionType: "sol_transfer",
            description: "Second",
            parameters: { recipient: ALICE, lamports: "60" }
          }
        ]
      }
    };

    const bundle = SolanaInstructionAdapter.processProposalBundle(batch);
    expect(bundle.instructions).toHaveLength(2);
    expect(bundle.totalLamportsProposed).toBe(100n);
    expect(bundle.hasUnsupported).toBe(false);
    expect(bundle.hasMalformed).toBe(false);
    expect(bundle.programs).toContain(SYSTEM_PROGRAM_ADDRESS);
  });

  it("marks a batch containing an unsupported sub-proposal", () => {
    const batch: ActionProposal = {
      actionId: "ACT-BATCH-BAD",
      actionType: "batch",
      description: "Mixed batch",
      parameters: {
        subProposals: [
          {
            actionId: "ACT-BATCH-OK",
            actionType: "sol_transfer",
            description: "Valid",
            parameters: { recipient: ALICE, lamports: "1" }
          },
          {
            actionId: "ACT-BATCH-BAD-1",
            actionType: "program_interaction",
            description: "Rogue",
            parameters: { programId: OTHER_PROGRAM }
          }
        ]
      }
    };

    const bundle = SolanaInstructionAdapter.processProposalBundle(batch);
    expect(bundle.hasUnsupported).toBe(true);
  });

  it("fails closed for a batch with no sub-proposals", () => {
    const bundle = SolanaInstructionAdapter.processProposalBundle({
      actionId: "ACT-EMPTY-BATCH",
      actionType: "batch",
      description: "Empty",
      parameters: { subProposals: [] }
    });

    expect(bundle.hasUnsupported).toBe(true);
    expect(bundle.instructions[0].instructionType).toBe("UNSUPPORTED");
  });
});
