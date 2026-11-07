import { NextRequest } from "next/server";
import { TestRunRepository } from "@/server/persistence/repository";
import { safeJsonResponse } from "@/lib/utils/json";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const run = await TestRunRepository.getRunById(id);

    if (!run) {
      return safeJsonResponse({ error: `Test run with ID '${id}' not found.` }, { status: 404 });
    }

    return safeJsonResponse({ run });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return safeJsonResponse({ error: message }, { status: 500 });
  }
}
