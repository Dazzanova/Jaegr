import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SCENARIOS } from "@/domain/scenarios/definitions";
import { authorizationMandateSchema } from "@/domain/mandates/mandate";
import { createAgentAdapter } from "@/server/agents/factory";
import { ScenarioTestRunner } from "@/server/orchestration/runner";
import { TestRunRepository } from "@/server/persistence/repository";

const runTestSchema = z.object({
  scenarioId: z.string().optional(),
  scenarioIds: z.array(z.string()).optional(),
  profileType: z.enum(["vulnerable", "hardened"]).default("vulnerable"),
  provider: z.enum(["gemini", "deterministic-demo"]).default("deterministic-demo"),
  mandate: z
    .object({
      id: z.string().default(() => `mandate-${Date.now()}`),
      name: z.string().default("Custom Testing Mandate"),
      description: z.string().optional(),
      maxLamportsPerAction: z.string().regex(/^\d+$/).default("100000000"), // 0.1 SOL
      allowedRecipients: z.array(z.string()).default(["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"]),
      allowedPrograms: z.array(z.string()).default(["11111111111111111111111111111111"]),
      permittedActionTypes: z.array(z.string()).default(["sol_transfer"]),
      seenActionIds: z.array(z.string()).default(["ACT-REPLAY-TX-0099"])
    })
    .optional(),
  customUntrustedContext: z.string().optional()
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const runs = await TestRunRepository.listRuns(limit);
    const stats = await TestRunRepository.getSummaryStats();

    return NextResponse.json({
      runs,
      stats
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = runTestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request payload",
          details: parsed.error.issues
        },
        { status: 400 }
      );
    }

    const { scenarioId, scenarioIds, profileType, provider, mandate: customMandate, customUntrustedContext } = parsed.data;

    // Determine target scenarios
    let targetScenarios = SCENARIOS;
    if (scenarioId) {
      targetScenarios = SCENARIOS.filter((s) => s.id === scenarioId);
      if (targetScenarios.length === 0) {
        return NextResponse.json({ error: `Scenario '${scenarioId}' not found.` }, { status: 404 });
      }
    } else if (scenarioIds && scenarioIds.length > 0) {
      targetScenarios = SCENARIOS.filter((s) => scenarioIds.includes(s.id));
      if (targetScenarios.length === 0) {
        return NextResponse.json({ error: "None of the specified scenarioIds were found." }, { status: 404 });
      }
    }

    // Initialize agent adapter
    const { adapter, provider: resolvedProvider, warning } = createAgentAdapter(provider);

    const suiteId = `SUITE-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const results = [];

    for (const scenario of targetScenarios) {
      // Build effective mandate
      const effectiveMandateInput = customMandate || {
        id: `mandate-${scenario.id}`,
        name: scenario.defaultMandate.name,
        description: `Default mandate for ${scenario.name}`,
        maxLamportsPerAction: scenario.defaultMandate.maxLamports,
        allowedRecipients: scenario.defaultMandate.allowedRecipients,
        allowedPrograms: scenario.defaultMandate.allowedPrograms,
        permittedActionTypes: scenario.defaultMandate.permittedActionTypes,
        seenActionIds: scenario.defaultMandate.seenActionIds
      };

      const mandate = authorizationMandateSchema.parse(effectiveMandateInput);

      const result = await ScenarioTestRunner.runScenario({
        scenario,
        mandate,
        agentAdapter: adapter,
        profileType,
        customUntrustedContext
      });

      // Persist run
      await TestRunRepository.saveRun(result, suiteId);
      results.push(result);
    }

    return NextResponse.json({
      suiteId,
      profileType,
      provider: resolvedProvider,
      warning,
      resultsCount: results.length,
      results
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
