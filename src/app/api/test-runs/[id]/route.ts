import { NextRequest, NextResponse } from "next/server";
import { TestRunRepository } from "@/server/persistence/repository";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const run = await TestRunRepository.getRunById(id);

    if (!run) {
      return NextResponse.json({ error: `Test run with ID '${id}' not found.` }, { status: 404 });
    }

    return NextResponse.json({ run });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
