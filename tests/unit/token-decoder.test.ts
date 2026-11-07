import { describe, it, expect } from "vitest";
import { SolanaInstructionAdapter } from "@/server/solana/adapter";
import { ActionProposal } from "@/domain/actions/proposal";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { evaluateTransactionPolicy } from "@/domain/evaluation/evaluator";
import { authorizationMandateSchema } from "@/domain/mandates/mandate";

// Valid base58 addresses for testing
const SOURCE_TOKEN_ACCOUNT = "7UX2i7SucgLMQcfZ75s3VXmZZY4YRUyJN9X1RgfMoDUi";
const DEST_TOKEN_ACCOUNT = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_MINT = "So11111111111111111111111111111111111111112"; // wSOL mint
const AUTHORITY = "83vSikV2eS2L54R8iH8Gv5vM2y9zH3R5xQv8vT3s8XqZ";

describe("Token Transfer Decoder (token_transfer → TOKEN_TRANSFER_CHECKED)", () => {
  it("decodes a valid token_transfer proposal into TOKEN_TRANSFER_CHECKED", () => {
    const proposal: ActionProposal = {
      actionId: "tok-valid-001",
      actionType: "token_transfer",
      description: "Transfer 100 wSOL tokens",
      parameters: {
        recipient: DEST_TOKEN_ACCOUNT,
        tokenAmount: "100000000",
        tokenMint: TOKEN_MINT,
        sourceAccount: SOURCE_TOKEN_ACCOUNT,
        tokenDecimals: 9,
        rawAccounts: [SOURCE_TOKEN_ACCOUNT, AUTHORITY]
      }
    };

    const { decoded } = SolanaInstructionAdapter.processProposal(proposal);

    expect(decoded.instructionType).toBe("TOKEN_TRANSFER_CHECKED");
    expect(decoded.programAddress).toBe(TOKEN_PROGRAM_ADDRESS);
    expect(decoded.tokenAmount).toBe(100_000_000n);
    expect(decoded.tokenDecimals).toBe(9);
    expect(decoded.tokenMint).toBe(TOKEN_MINT);
    expect(decoded.source).toBe(SOURCE_TOKEN_ACCOUNT);
    expect(decoded.recipient).toBe(DEST_TOKEN_ACCOUNT);
    expect(decoded.authority).toBe(AUTHORITY);
    expect(decoded.accounts.length).toBeGreaterThan(0);
    expect(decoded.decodingError).toBeUndefined();
  });

  it("extracts exact token amount with integer precision", () => {
    const proposal: ActionProposal = {
      actionId: "tok-amount-001",
      actionType: "token_transfer",
      description: "Transfer 1 token",
      parameters: {
        recipient: DEST_TOKEN_ACCOUNT,
        tokenAmount: "1",
        tokenMint: TOKEN_MINT,
        sourceAccount: SOURCE_TOKEN_ACCOUNT,
        tokenDecimals: 6,
        rawAccounts: [SOURCE_TOKEN_ACCOUNT, AUTHORITY]
      }
    };

    const { decoded } = SolanaInstructionAdapter.processProposal(proposal);
    expect(decoded.instructionType).toBe("TOKEN_TRANSFER_CHECKED");
    expect(decoded.tokenAmount).toBe(1n);
    expect(decoded.tokenDecimals).toBe(6);
  });

  it("returns MALFORMED when recipient is missing", () => {
    const proposal: ActionProposal = {
      actionId: "tok-missing-recipient",
      actionType: "token_transfer",
      description: "Missing recipient",
      parameters: {
        tokenAmount: "1000",
        tokenMint: TOKEN_MINT,
        sourceAccount: SOURCE_TOKEN_ACCOUNT,
        tokenDecimals: 9
      }
    };

    const { decoded } = SolanaInstructionAdapter.processProposal(proposal);
    expect(decoded.instructionType).toBe("MALFORMED");
    expect(decoded.decodingError).toContain("destination");
  });

  it("returns MALFORMED when tokenMint is missing", () => {
    const proposal: ActionProposal = {
      actionId: "tok-missing-mint",
      actionType: "token_transfer",
      description: "Missing mint",
      parameters: {
        recipient: DEST_TOKEN_ACCOUNT,
        tokenAmount: "1000",
        sourceAccount: SOURCE_TOKEN_ACCOUNT,
        tokenDecimals: 9
      }
    };

    const { decoded } = SolanaInstructionAdapter.processProposal(proposal);
    expect(decoded.instructionType).toBe("MALFORMED");
    expect(decoded.decodingError).toContain("tokenMint");
  });

  it("returns MALFORMED when tokenDecimals is missing", () => {
    const proposal: ActionProposal = {
      actionId: "tok-missing-decimals",
      actionType: "token_transfer",
      description: "Missing decimals",
      parameters: {
        recipient: DEST_TOKEN_ACCOUNT,
        tokenAmount: "1000",
        tokenMint: TOKEN_MINT,
        sourceAccount: SOURCE_TOKEN_ACCOUNT
      }
    };

    const { decoded } = SolanaInstructionAdapter.processProposal(proposal);
    expect(decoded.instructionType).toBe("MALFORMED");
    expect(decoded.decodingError).toContain("tokenDecimals");
  });

  it("returns MALFORMED when tokenAmount is missing", () => {
    const proposal: ActionProposal = {
      actionId: "tok-missing-amount",
      actionType: "token_transfer",
      description: "Missing amount",
      parameters: {
        recipient: DEST_TOKEN_ACCOUNT,
        tokenMint: TOKEN_MINT,
        sourceAccount: SOURCE_TOKEN_ACCOUNT,
        tokenDecimals: 9
      }
    };

    const { decoded } = SolanaInstructionAdapter.processProposal(proposal);
    expect(decoded.instructionType).toBe("MALFORMED");
  });
});

describe("UNSUPPORTED program rejection", () => {
  it("returns UNSUPPORTED for program_interaction", () => {
    const ROGUE_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
    const proposal: ActionProposal = {
      actionId: "unsupported-prog-001",
      actionType: "program_interaction",
      description: "Invoke Memo program",
      parameters: {
        programId: ROGUE_PROGRAM,
        data: "SGVsbG8="
      }
    };

    const { decoded } = SolanaInstructionAdapter.processProposal(proposal);
    expect(decoded.instructionType).toBe("UNSUPPORTED");
    expect(decoded.programAddress).toBe(ROGUE_PROGRAM);
  });

  it("returns UNSUPPORTED for unknown action type", () => {
    const proposal: ActionProposal = {
      actionId: "unknown-action-001",
      actionType: "unknown",
      description: "Unknown action",
      parameters: {}
    };

    const { decoded } = SolanaInstructionAdapter.processProposal(proposal);
    expect(decoded.instructionType).toBe("UNSUPPORTED");
  });
});

describe("Policy enforcement on token transfers", () => {
  const mandate = authorizationMandateSchema.parse({
    id: "mandate-token-test",
    name: "Token Transfer Test Mandate",
    maxLamportsPerAction: "1000000000",
    allowedRecipients: [DEST_TOKEN_ACCOUNT],
    allowedPrograms: [TOKEN_PROGRAM_ADDRESS],
    permittedActionTypes: ["token_transfer"],
    seenActionIds: []
  });

  it("blocks token transfer to unauthorized recipient", () => {
    const UNAUTHORIZED_DEST = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
    const proposal: ActionProposal = {
      actionId: "tok-unauth-recip",
      actionType: "token_transfer",
      description: "Transfer to unauthorized address",
      parameters: {
        recipient: UNAUTHORIZED_DEST,
        tokenAmount: "1000",
        tokenMint: TOKEN_MINT,
        sourceAccount: SOURCE_TOKEN_ACCOUNT,
        tokenDecimals: 9,
        rawAccounts: [SOURCE_TOKEN_ACCOUNT, AUTHORITY]
      }
    };

    const { decoded } = SolanaInstructionAdapter.processProposal(proposal);
    const report = evaluateTransactionPolicy(mandate, proposal, decoded);

    expect(report.allowed).toBe(false);
    expect(report.findings.some((f) => f.ruleViolated === "RECIPIENT_NOT_ALLOWLISTED")).toBe(true);
  });

  it("blocks token transfer via disallowed program", () => {
    const proposal: ActionProposal = {
      actionId: "tok-unauth-prog",
      actionType: "program_interaction",
      description: "Invoke rogue program",
      parameters: {
        programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
      }
    };

    const { decoded } = SolanaInstructionAdapter.processProposal(proposal);
    const report = evaluateTransactionPolicy(mandate, proposal, decoded);

    expect(report.allowed).toBe(false);
    expect(report.findings.some((f) => f.ruleViolated === "PROGRAM_NOT_ALLOWLISTED")).toBe(true);
  });

  it("allows valid token transfer to authorized recipient", () => {
    const proposal: ActionProposal = {
      actionId: "tok-valid-policy-001",
      actionType: "token_transfer",
      description: "Transfer 100 tokens to authorized recipient",
      parameters: {
        recipient: DEST_TOKEN_ACCOUNT,
        tokenAmount: "100000000",
        tokenMint: TOKEN_MINT,
        sourceAccount: SOURCE_TOKEN_ACCOUNT,
        tokenDecimals: 9,
        rawAccounts: [SOURCE_TOKEN_ACCOUNT, AUTHORITY]
      }
    };

    const { decoded } = SolanaInstructionAdapter.processProposal(proposal);
    expect(decoded.instructionType).toBe("TOKEN_TRANSFER_CHECKED");

    const report = evaluateTransactionPolicy(mandate, proposal, decoded);
    expect(report.allowed).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});

describe("System Program (sol_transfer) decoder — preserved behavior", () => {
  it("decodes sol_transfer with correct program address", () => {
    const proposal: ActionProposal = {
      actionId: "sol-valid-001",
      actionType: "sol_transfer",
      description: "Transfer 0.01 SOL",
      parameters: {
        recipient: DEST_TOKEN_ACCOUNT,
        lamports: "10000000"
      }
    };

    const { decoded } = SolanaInstructionAdapter.processProposal(proposal);
    expect(decoded.instructionType).toBe("SYSTEM_TRANSFER");
    expect(decoded.programAddress).toBe(SYSTEM_PROGRAM_ADDRESS);
    expect(decoded.lamports).toBe(10_000_000n);
    expect(decoded.recipient).toBe(DEST_TOKEN_ACCOUNT);
  });
});
