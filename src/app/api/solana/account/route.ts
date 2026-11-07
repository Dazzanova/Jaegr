import { NextRequest, NextResponse } from "next/server";
import { getSolanaClient } from "@/server/solana/client";
import { solanaAddressSchema, lamportsToSolString } from "@/domain/mandates/mandate";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const addressStr = searchParams.get("address");

    if (!addressStr) {
      return NextResponse.json({ error: "Missing required 'address' query parameter" }, { status: 400 });
    }

    const parsed = solanaAddressSchema.safeParse(addressStr);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid Solana address format" }, { status: 400 });
    }

    const client = getSolanaClient();
    const info = await client.getAccountInfo(parsed.data);

    if (!info) {
      return NextResponse.json({
        exists: false,
        address: parsed.data,
        cluster: client.getConfig().cluster
      });
    }

    return NextResponse.json({
      exists: true,
      account: info,
      solFormatted: lamportsToSolString(BigInt(info.lamports)),
      cluster: client.getConfig().cluster
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch account info";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
