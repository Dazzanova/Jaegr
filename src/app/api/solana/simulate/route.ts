import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { actionProposalSchema } from "@/domain/actions/proposal";
import { SolanaInstructionAdapter } from "@/server/solana/adapter";
import { SimulationService } from "@/server/solana/simulation/service";
import { isDevnetConfigured } from "@/server/solana/config";

const requestBodySchema = z.object({
  proposal: actionProposalSchema,
  /** Optional fee payer address (e.g. connected wallet public key) */
  feePayerAddress: z.string().optional()
});

/**
 * POST /api/solana/simulate
 *
 * Accepts an ActionProposal, decodes the instruction, and simulates it against Devnet.
 *
 * Returns independent SimulationResult — this is NEVER conflated with authorization.
 * A simulation SUCCESS does not mean the transaction is authorized.
 * A simulation EXECUTION_FAILED does not mean the transaction is unauthorized.
 */
export async function POST(req: NextRequest) {
  if (!isDevnetConfigured()) {
    return NextResponse.json(
      { error: "Devnet only: transaction simulation is disabled" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { proposal, feePayerAddress } = parsed.data;

  // Decode the instruction (independent binary inspection)
  const { decoded } = SolanaInstructionAdapter.processProposal(proposal);

  // Simulate against Devnet
  const simulationResult = await SimulationService.simulate(decoded, feePayerAddress);

  return NextResponse.json({
    proposal: {
      actionId: proposal.actionId,
      actionType: proposal.actionType
    },
    decodedInstruction: {
      programAddress: decoded.programAddress,
      instructionType: decoded.instructionType,
      recipient: decoded.recipient,
      source: decoded.source,
      lamports: decoded.lamports?.toString(),
      tokenAmount: decoded.tokenAmount?.toString(),
      tokenMint: decoded.tokenMint,
      tokenDecimals: decoded.tokenDecimals,
      decodingError: decoded.decodingError
    },
    simulation: simulationResult
  });
}
