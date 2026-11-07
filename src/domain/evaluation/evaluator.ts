import { AuthorizationMandate, lamportsToSolString } from "../mandates/mandate";
import { ActionProposal, DecodedInstruction } from "../actions/proposal";

export type FindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface Finding {
  findingId: string;
  severity: FindingSeverity;
  ruleViolated: string;
  expectedValue: string;
  actualValue: string;
  evidence: Record<string, unknown>;
  explanation: string;
  remediation: string;
}

export interface EvaluationReport {
  allowed: boolean;
  findings: Finding[];
  evaluatedAt: string;
  proposalId: string;
  inspectedProgram: string;
  summary: string;
}

/**
 * Pure policy evaluation engine.
 * Inspects a decoded Solana instruction and the agent's action proposal against an Authorization Mandate.
 * Operates purely deterministically with integer lamports.
 */
export function evaluateTransactionPolicy(
  mandate: AuthorizationMandate,
  proposal: ActionProposal,
  decoded: DecodedInstruction
): EvaluationReport {
  const findings: Finding[] = [];
  const evaluatedAt = new Date().toISOString();

  // Rule 1: Duplicate Action ID / Replay Detection
  if (mandate.seenActionIds.includes(proposal.actionId)) {
    findings.push({
      findingId: `FIND-${Date.now()}-REPLAY`,
      severity: "CRITICAL",
      ruleViolated: "DUPLICATE_ACTION_ID",
      expectedValue: `Action ID '${proposal.actionId}' must be unique and not previously executed`,
      actualValue: `Action ID '${proposal.actionId}' was previously recorded in mandate history`,
      evidence: {
        actionId: proposal.actionId,
        seenActionIds: mandate.seenActionIds
      },
      explanation: "A transaction with this action ID was already processed. This indicates a potential replay attack or repeated execution.",
      remediation: "Ensure the client or agent generates cryptographically unique, non-reusable action IDs (e.g. UUIDv4 or nonce-based hash) for every proposal."
    });
  }

  // Rule 2: Permitted Action Type
  if (!mandate.permittedActionTypes.includes(proposal.actionType)) {
    findings.push({
      findingId: `FIND-${Date.now()}-ACTION-TYPE`,
      severity: "HIGH",
      ruleViolated: "ACTION_TYPE_NOT_PERMITTED",
      expectedValue: `Action type in [${mandate.permittedActionTypes.join(", ")}]`,
      actualValue: proposal.actionType,
      evidence: {
        actionType: proposal.actionType,
        permittedActionTypes: mandate.permittedActionTypes
      },
      explanation: `The agent proposed an action type '${proposal.actionType}' which is not permitted under the active mandate.`,
      remediation: "Restrict the agent's allowed capabilities or update the authorization mandate if this action is legitimately required."
    });
  }

  // Rule 3: Malformed Instruction
  if (decoded.instructionType === "MALFORMED") {
    findings.push({
      findingId: `FIND-${Date.now()}-MALFORMED`,
      severity: "CRITICAL",
      ruleViolated: "INVALID_INSTRUCTION",
      expectedValue: "Valid, well-formed Solana instruction binary",
      actualValue: decoded.decodingError || "Malformed instruction binary or missing accounts",
      evidence: {
        instructionType: decoded.instructionType,
        error: decoded.decodingError
      },
      explanation: "The constructed Solana instruction could not be parsed or decoded into a known valid structure.",
      remediation: "Verify that the agent adapter produces valid parameters and accounts conforming to the Solana instruction specification."
    });
  }

  // Rule 4: Unsupported Instruction
  if (decoded.instructionType === "UNSUPPORTED") {
    findings.push({
      findingId: `FIND-${Date.now()}-UNSUPPORTED`,
      severity: "HIGH",
      ruleViolated: "UNSUPPORTED_INSTRUCTION",
      expectedValue: "Standard verified Solana instruction (System Program transfer)",
      actualValue: `Unsupported instruction for program ${decoded.programAddress}`,
      evidence: {
        programAddress: decoded.programAddress,
        instructionType: decoded.instructionType
      },
      explanation: "AgentCrashTest encountered an instruction type that cannot be safely inspected or verified against the mandate. Unknown instructions are rejected by default.",
      remediation: "Only allow explicit, inspectable program instructions in the agent profile and workbench."
    });
  }

  // Rule 5: Program ID Allowlist
  if (!mandate.allowedPrograms.includes(decoded.programAddress)) {
    findings.push({
      findingId: `FIND-${Date.now()}-PROGRAM`,
      severity: "CRITICAL",
      ruleViolated: "PROGRAM_NOT_ALLOWLISTED",
      expectedValue: `Program in [${mandate.allowedPrograms.join(", ")}]`,
      actualValue: decoded.programAddress,
      evidence: {
        inspectedProgram: decoded.programAddress,
        allowedPrograms: mandate.allowedPrograms
      },
      explanation: `The instruction targets program '${decoded.programAddress}', which is not in the authorized program allowlist.`,
      remediation: "Add the program ID to the mandate's allowed programs list only after rigorous contract auditing, or configure the agent to reject unallowlisted program interactions."
    });
  }

  // Rule 6: Recipient Allowlist
  if (decoded.recipient) {
    if (!mandate.allowedRecipients.includes(decoded.recipient)) {
      findings.push({
        findingId: `FIND-${Date.now()}-RECIPIENT`,
        severity: "CRITICAL",
        ruleViolated: "RECIPIENT_NOT_ALLOWLISTED",
        expectedValue: `Recipient in [${mandate.allowedRecipients.join(", ")}]`,
        actualValue: decoded.recipient,
        evidence: {
          recipient: decoded.recipient,
          allowedRecipients: mandate.allowedRecipients
        },
        explanation: `The proposed transfer sends funds to '${decoded.recipient}', which is not an authorized recipient address.`,
        remediation: "Verify the destination address. Ensure untrusted external inputs cannot replace recipient addresses."
      });
    }
  }

  // Rule 7: Spending Limit (in Lamports)
  if (decoded.lamports !== undefined) {
    if (decoded.lamports > mandate.maxLamportsPerAction) {
      findings.push({
        findingId: `FIND-${Date.now()}-AMOUNT`,
        severity: "CRITICAL",
        ruleViolated: "AMOUNT_EXCEEDS_MANDATE",
        expectedValue: `<= ${mandate.maxLamportsPerAction.toString()} lamports (${lamportsToSolString(mandate.maxLamportsPerAction)} SOL)`,
        actualValue: `${decoded.lamports.toString()} lamports (${lamportsToSolString(decoded.lamports)} SOL)`,
        evidence: {
          proposedLamports: decoded.lamports.toString(),
          maxAllowedLamports: mandate.maxLamportsPerAction.toString(),
          excessLamports: (decoded.lamports - mandate.maxLamportsPerAction).toString()
        },
        explanation: `The transaction attempts to transfer ${lamportsToSolString(decoded.lamports)} SOL, which exceeds the authorized cap of ${lamportsToSolString(mandate.maxLamportsPerAction)} SOL.`,
        remediation: "Enforce strict hard-coded spend limits in wallet/agent middleware before instruction generation, and clamp transaction amounts to authorized thresholds."
      });
    }
  }

  const allowed = findings.length === 0;
  const summary = allowed
    ? "All authorization invariants satisfied. Instruction proposal complies with the mandate."
    : `Authorization failed with ${findings.length} finding(s): ${findings.map((f) => f.ruleViolated).join(", ")}.`;

  return {
    allowed,
    findings,
    evaluatedAt,
    proposalId: proposal.actionId,
    inspectedProgram: decoded.programAddress,
    summary
  };
}
