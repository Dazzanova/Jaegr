import { describe, expect, it } from "vitest";
import { SolanaInstructionAdapter, DEFAULT_SOURCE_WALLET } from "@/server/solana/adapter";

const WALLET = "7J8BqX8wAh7C3pu33RMeLxKi29k8T5zgd7RyvJwH4jba";
const RECIPIENT = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

const proposal = {
  actionId: "adapter-source-test",
  actionType: "sol_transfer" as const,
  description: "test",
  parameters: { recipient: RECIPIENT, lamports: "50000000", solAmount: "0.05" },
  reasoning: "test"
};

describe("SolanaInstructionAdapter source override", () => {
  it("uses the placeholder wallet when no source is supplied", () => {
    const { decoded } = SolanaInstructionAdapter.processProposal(proposal);
    expect(decoded.source).toBe(DEFAULT_SOURCE_WALLET);
  });

  it("uses the connected wallet as the inspected transfer source", () => {
    const { decoded } = SolanaInstructionAdapter.processProposal(proposal, {
      sourceAddress: WALLET
    });
    expect(decoded.source).toBe(WALLET);
    expect(decoded.recipient).toBe(RECIPIENT);
    expect(decoded.lamports).toBe(50000000n);
  });
});
