import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSolanaClient } from "@/server/solana/client";
import { getSolanaNetworkConfig, getSolanaExplorerUrl } from "@/server/solana/config";
import { actionProposalSchema } from "@/domain/actions/proposal";
import { SolanaInstructionAdapter } from "@/server/solana/adapter";
import { evaluateTransactionPolicy } from "@/domain/evaluation/evaluator";
import { authorizationMandateSchema } from "@/domain/mandates/mandate";

const requestBodySchema = z.object({
  proposal: actionProposalSchema,
  mandate: authorizationMandateSchema,
  signedWireTransaction: z.string().min(1),
  inspected: z.object({
    programAddress: z.string(),
    instructionType: z.string(),
    recipient: z.string().optional(),
    lamports: z.string().optional()
  })
});

export async function POST(req: NextRequest) {
  const config = getSolanaNetworkConfig();
  if (config.cluster !== "devnet") {
    return NextResponse.json({ error: "Devnet only: execution is not permitted on this cluster" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { proposal, mandate, signedWireTransaction, inspected } = parsed.data;

  const { decoded } = SolanaInstructionAdapter.processProposal(proposal);

  if (
    decoded.programAddress !== inspected.programAddress ||
    decoded.instructionType !== inspected.instructionType ||
    (decoded.recipient ?? undefined) !== (inspected.recipient ?? undefined) ||
    (decoded.lamports?.toString() ?? undefined) !== (inspected.lamports ?? undefined)
  ) {
    return NextResponse.json({ error: "Transaction changed since inspection; submission blocked" }, { status: 409 });
  }

  const report = evaluateTransactionPolicy(mandate, proposal, decoded);
  if (!report.allowed) {
    return NextResponse.json({ error: "Unauthorized transaction", findings: report.findings }, { status: 403 });
  }

  if (decoded.instructionType === "MALFORMED" || decoded.instructionType === "UNSUPPORTED") {
    return NextResponse.json({ error: "Unsupported or malformed transaction" }, { status: 400 });
  }

  const client = getSolanaClient();
  try {
    const signature = await client.sendWireTransaction(signedWireTransaction);
    let confirmed = false;
    for (let i = 0; i < 30; i++) {
      const tx = await client.getTransaction(signature);
      if (tx) {
        confirmed = tx.err === null;
        if (confirmed) break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!confirmed) {
      return NextResponse.json({ error: "Confirmation timeout", signature }, { status: 504 });
    }
    return NextResponse.json({
      signature,
      confirmed,
      explorerUrl: getSolanaExplorerUrl(signature, client.getConfig().cluster)
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Submission failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
