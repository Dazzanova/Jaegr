import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { actionProposalSchema } from "@/domain/actions/proposal";
import { authorizationMandateSchema } from "@/domain/mandates/mandate";
import { evaluateTransactionPolicy } from "@/domain/evaluation/evaluator";
import { SolanaInstructionAdapter } from "@/server/solana/adapter";
import { getSolanaClient } from "@/server/solana/client";
import { isDevnetConfigured } from "@/server/solana/config";
import { buildTransactionForExecution } from "@/server/solana/transactions/builder";
import { assertWireMatchesInspected } from "@/server/solana/transactions/decoder";
import { isRateLimited } from "@/server/solana/execution";

const requestBodySchema = z.object({
  proposal: actionProposalSchema,
  mandate: authorizationMandateSchema,
  feePayerAddress: z.string().min(32).max(44)
});

/**
 * POST /api/solana/prepare
 *
 * Builds (but never signs or submits) the exact Devnet transaction that the
 * Workbench will ask the wallet to sign.
 *
 * The server decodes the instruction, independently authorizes it, builds the
 * wire transaction, re-decodes the wire bytes to verify they match the
 * inspected instruction, and simulates them. A successful response is NOT an
 * authorization to execute; the client must still obtain an explicit wallet
 * signature and the execute endpoint re-validates everything.
 */
export async function POST(req: NextRequest) {
  if (isRateLimited(req)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }
  if (!isDevnetConfigured()) {
    return NextResponse.json(
      { error: "Devnet only: transaction preparation is disabled" },
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

  const { proposal, mandate, feePayerAddress } = parsed.data;
  const { decoded } = SolanaInstructionAdapter.processProposal(proposal);
  const report = evaluateTransactionPolicy(mandate, proposal, decoded);

  if (!report.allowed) {
    return NextResponse.json(
      { error: "Unauthorized transaction", findings: report.findings, report },
      { status: 403 }
    );
  }
  if (decoded.instructionType === "MALFORMED" || decoded.instructionType === "UNSUPPORTED") {
    return NextResponse.json(
      { error: "Unsupported or malformed transaction", report },
      { status: 400 }
    );
  }

  const client = getSolanaClient();

  try {
    const blockhash = await client.getLatestBlockhash();
    const unsignedWireTransaction = buildTransactionForExecution(
      decoded,
      blockhash,
      feePayerAddress
    );

    if (!unsignedWireTransaction) {
      return NextResponse.json(
        { error: "Transaction cannot be built for the connected fee payer" },
        { status: 400 }
      );
    }

    // Defense-in-depth: decode the actual wire bytes and prove they match the
    // instruction that was independently inspected and authorized.
    assertWireMatchesInspected(unsignedWireTransaction, decoded);

    try {
      const simulation = await client.simulateWireTransaction(unsignedWireTransaction);
      return NextResponse.json({
        actionId: proposal.actionId,
        feePayerAddress,
        unsignedWireTransaction,
        lastValidBlockHeight: blockhash.lastValidBlockHeight.toString(),
        preparedAt: new Date().toISOString(),
        inspected: {
          programAddress: decoded.programAddress,
          instructionType: decoded.instructionType,
          recipient: decoded.recipient,
          source: decoded.source,
          lamports: decoded.lamports?.toString(),
          tokenAmount: decoded.tokenAmount?.toString(),
          tokenMint: decoded.tokenMint,
          tokenDecimals: decoded.tokenDecimals,
          accounts: decoded.accounts
        },
        authorization: report,
        simulation: {
          status: simulation.err ? "EXECUTION_FAILED" : "SUCCESS",
          logs: simulation.logs ?? [],
          unitsConsumed: simulation.unitsConsumed?.toString(),
          err: simulation.err ?? null,
          timestamp: new Date().toISOString()
        }
      });
    } catch (simulationError: unknown) {
      return NextResponse.json(
        {
          actionId: proposal.actionId,
          feePayerAddress,
          unsignedWireTransaction,
          lastValidBlockHeight: blockhash.lastValidBlockHeight.toString(),
          preparedAt: new Date().toISOString(),
          authorization: report,
          simulation: {
            status: "RPC_ERROR",
            errorMessage:
              simulationError instanceof Error ? simulationError.message : String(simulationError),
            timestamp: new Date().toISOString()
          }
        },
        { status: 502 }
      );
    }
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Devnet RPC request failed while preparing the transaction",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 502 }
    );
  }
}
