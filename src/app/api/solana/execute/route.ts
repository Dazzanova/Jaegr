import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { actionProposalSchema } from "@/domain/actions/proposal";
import { authorizationMandateSchema } from "@/domain/mandates/mandate";
import { evaluateTransactionPolicy } from "@/domain/evaluation/evaluator";
import { SolanaInstructionAdapter } from "@/server/solana/adapter";
import { getSolanaClient } from "@/server/solana/client";
import { getSolanaExplorerUrl, isDevnetConfigured } from "@/server/solana/config";
import { ExecutionRepository } from "@/server/persistence/repository";
import { isRateLimited } from "@/server/solana/execution";
import { validateSignedWireTransaction } from "@/server/solana/transactions/wire";
import { assertWireMatchesInspected } from "@/server/solana/transactions/decoder";
import { toJsonSafe } from "@/lib/utils/json";

const requestBodySchema = z.object({
  proposal: actionProposalSchema,
  mandate: authorizationMandateSchema,
  feePayerAddress: z.string().min(32).max(44),
  unsignedWireTransaction: z.string().min(1),
  signedWireTransaction: z.string().min(1),
  /** Optional blockhash expiry bound returned by /prepare. */
  lastValidBlockHeight: z.string().regex(/^\d+$/).optional()
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const DEFAULT_CONFIRMATION_ATTEMPTS = 30;
const DEFAULT_CONFIRMATION_INTERVAL_MS = 1_000;

function getConfirmationAttempts(): number {
  const parsed = Number.parseInt(process.env.SOLANA_CONFIRMATION_ATTEMPTS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CONFIRMATION_ATTEMPTS;
}

function getConfirmationIntervalMs(): number {
  const parsed = Number.parseInt(process.env.SOLANA_CONFIRMATION_INTERVAL_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_CONFIRMATION_INTERVAL_MS;
}

/**
 * POST /api/solana/execute
 *
 * Final, server-authoritative stage of the wallet-approved Devnet lifecycle:
 *   1. decode the exact unsigned wire transaction,
 *   2. re-run the deterministic evaluator against the decoded wire instruction,
 *   3. verify the wallet-signed message is byte-identical to the inspected one,
 *   4. simulate with signature verification enabled,
 *   5. submit, wait for confirmation, persist evidence.
 *
 * Client-supplied verdicts are never trusted. A successful simulation does not
 * authorize execution; only this endpoint's own checks do.
 */
export async function POST(req: NextRequest) {
  if (isRateLimited(req)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }
  if (!isDevnetConfigured()) {
    return NextResponse.json(
      { error: "Devnet only: transaction execution is disabled" },
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

  const {
    proposal,
    mandate,
    feePayerAddress,
    unsignedWireTransaction,
    signedWireTransaction,
    lastValidBlockHeight
  } = parsed.data;

  // ── Replay / idempotency ───────────────────────────────────────────────────
  const existing = await ExecutionRepository.get(proposal.actionId);
  if (existing?.status === "CONFIRMED") {
    return NextResponse.json({
      actionId: proposal.actionId,
      status: existing.status,
      signature: existing.signature,
      slot: existing.slot,
      explorerUrl: existing.signature
        ? getSolanaExplorerUrl(existing.signature, "devnet")
        : undefined,
      idempotent: true
    });
  }
  if (existing) {
    return NextResponse.json(
      {
        error:
          "A prior submission for this action is unresolved; check its signature/status before retrying",
        status: existing.status,
        signature: existing.signature
      },
      { status: 409 }
    );
  }

  // ── Inspect the proposal-derived instruction ───────────────────────────────
  const { decoded } = SolanaInstructionAdapter.processProposal(proposal, {
    sourceAddress: feePayerAddress
  });
  const proposalReport = evaluateTransactionPolicy(mandate, proposal, decoded);
  if (!proposalReport.allowed) {
    return NextResponse.json(
      { error: "Unauthorized transaction", findings: proposalReport.findings },
      { status: 403 }
    );
  }
  if (decoded.instructionType === "MALFORMED" || decoded.instructionType === "UNSUPPORTED") {
    return NextResponse.json({ error: "Unsupported or malformed transaction" }, { status: 400 });
  }

  // ── Decode and authorize the ACTUAL wire transaction ───────────────────────
  let wireDecoded;
  try {
    wireDecoded = assertWireMatchesInspected(unsignedWireTransaction, decoded);
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 409 });
  }

  const actualInstruction = wireDecoded.instructions[0];
  const wireReport = evaluateTransactionPolicy(mandate, proposal, actualInstruction);
  if (!wireReport.allowed) {
    return NextResponse.json(
      { error: "Unauthorized transaction", findings: wireReport.findings },
      { status: 403 }
    );
  }

  // ── Verify the wallet-signed message is byte-identical ─────────────────────
  let signedDetails;
  try {
    signedDetails = validateSignedWireTransaction({
      signedWireTransaction,
      unsignedWireTransaction,
      expectedFeePayer: feePayerAddress
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 409 });
  }

  if (signedDetails.feePayer !== feePayerAddress) {
    return NextResponse.json(
      { error: "Signed transaction fee payer does not match the connected wallet" },
      { status: 409 }
    );
  }

  const client = getSolanaClient();

  // ── Simulate the exact signed transaction (sigVerify enabled) ──────────────
  try {
    const simulation = await client.simulateSignedWireTransaction(signedWireTransaction);
    if (simulation.err) {
      return NextResponse.json(
        { error: "Signed transaction simulation failed", simulation: toJsonSafe(simulation) },
        { status: 422 }
      );
    }
  } catch (error: unknown) {
    return NextResponse.json(
      { error: `Signed transaction simulation RPC failed: ${errorMessage(error)}` },
      { status: 502 }
    );
  }

  // ── Claim the action ID exactly once, then submit ──────────────────────────
  try {
    await ExecutionRepository.start(proposal.actionId, {
      feePayerAddress,
      inspectedProgram: actualInstruction.programAddress,
      instructionType: actualInstruction.instructionType,
      signature: signedDetails.signature,
      unsignedWireTransaction,
      signedWireTransaction,
      lastValidBlockHeight: lastValidBlockHeight ?? null,
      preparedAt: new Date().toISOString()
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "A submission for this action was created concurrently; check its status before retrying"
      },
      { status: 409 }
    );
  }

  let signature: string;
  try {
    signature = await client.sendWireTransaction(signedWireTransaction);
  } catch (error: unknown) {
    // The submission outcome is uncertain: never retry automatically.
    await ExecutionRepository.update(proposal.actionId, {
      status: "UNKNOWN",
      signature: signedDetails.signature,
      error: `sendTransaction failed: ${errorMessage(error)}`
    });
    return NextResponse.json(
      {
        status: "UNKNOWN",
        signature: signedDetails.signature,
        error: `${errorMessage(error)} — verify the signature before retrying`
      },
      { status: 502 }
    );
  }

  if (signature !== signedDetails.signature) {
    await ExecutionRepository.update(proposal.actionId, {
      status: "UNKNOWN",
      signature,
      error: "RPC returned a signature that does not match the signed transaction"
    });
    return NextResponse.json(
      {
        status: "UNKNOWN",
        signature,
        error: "RPC returned an unexpected signature; verify the transaction before retrying"
      },
      { status: 502 }
    );
  }

  await ExecutionRepository.update(proposal.actionId, { status: "SUBMITTED", signature });

  // ── Wait for confirmation ──────────────────────────────────────────────────
  const confirmationAttempts = getConfirmationAttempts();
  const confirmationIntervalMs = getConfirmationIntervalMs();
  let lastPollError: string | null = null;

  for (let attempt = 0; attempt < confirmationAttempts; attempt += 1) {
    try {
      const transaction = await client.getTransaction(signature);
      if (transaction) {
        if (transaction.err !== null) {
          await ExecutionRepository.update(proposal.actionId, {
            status: "FAILED",
            signature,
            slot: transaction.slot,
            error: JSON.stringify(transaction.err)
          });
          return NextResponse.json(
            { status: "FAILED", signature, slot: transaction.slot, error: transaction.err },
            { status: 422 }
          );
        }
        await ExecutionRepository.update(proposal.actionId, {
          status: "CONFIRMED",
          signature,
          slot: transaction.slot
        });
        return NextResponse.json({
          actionId: proposal.actionId,
          status: "CONFIRMED",
          signature,
          slot: transaction.slot,
          explorerUrl: getSolanaExplorerUrl(signature, client.getConfig().cluster)
        });
      }
    } catch (error: unknown) {
      lastPollError = errorMessage(error);
    }

    if (attempt < confirmationAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, confirmationIntervalMs));
    }
  }

  // ── Timeout: distinguish plain timeout from expired blockhash ──────────────
  let expiryNote = "";
  if (lastValidBlockHeight !== undefined) {
    try {
      const currentHeight = await client.getBlockHeight();
      if (currentHeight > BigInt(lastValidBlockHeight)) {
        expiryNote =
          " Blockhash has expired, so the transaction can no longer confirm; its signature is still persisted for verification.";
      }
    } catch {
      // Expiry could not be verified; report a plain timeout.
    }
  }

  await ExecutionRepository.update(proposal.actionId, {
    status: "UNKNOWN",
    signature,
    error: `Confirmation timeout.${expiryNote}${lastPollError ? ` Last RPC error: ${lastPollError}` : ""}`
  });

  return NextResponse.json(
    {
      status: "UNKNOWN",
      signature,
      error: `Confirmation timeout; do not retry automatically.${expiryNote}`
    },
    { status: 504 }
  );
}
