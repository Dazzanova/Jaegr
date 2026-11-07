import { NextRequest, NextResponse } from "next/server";
import { getSolanaClient } from "@/server/solana/client";
import { getSolanaExplorerUrl } from "@/server/solana/config";

/**
 * GET /api/solana/transaction?signature=<base58-sig>
 *
 * Fetches confirmed transaction details from Devnet by signature.
 * Returns transaction metadata and a Solana Explorer link.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const signature = searchParams.get("signature");

  if (!signature || signature.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing required 'signature' query parameter" },
      { status: 400 }
    );
  }

  // Basic signature format check: base58, 87-88 chars
  if (!/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(signature)) {
    return NextResponse.json(
      { error: "Invalid transaction signature format" },
      { status: 400 }
    );
  }

  try {
    const client = getSolanaClient();
    const tx = await client.getTransaction(signature);

    if (!tx) {
      return NextResponse.json(
        {
          found: false,
          signature,
          cluster: client.getConfig().cluster,
          message: "Transaction not found — it may not be confirmed yet or may have been on a different cluster"
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      found: true,
      signature,
      cluster: client.getConfig().cluster,
      explorerUrl: getSolanaExplorerUrl(signature, client.getConfig().cluster),
      transaction: tx
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch transaction";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
