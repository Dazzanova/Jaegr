import { NextResponse } from "next/server";
import { getSolanaClient } from "@/server/solana/client";

export async function GET() {
  const client = getSolanaClient();
  const health = await client.checkHealth();

  return NextResponse.json(health);
}
