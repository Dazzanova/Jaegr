import { NextResponse } from "next/server";
import { SCENARIOS } from "@/domain/scenarios/definitions";

export async function GET() {
  const serialized = SCENARIOS.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    description: s.description,
    attackVector: s.attackVector,
    attackPayload: s.attackPayload,
    userTask: s.userTask,
    untrustedContext: s.untrustedContext,
    defaultMandate: s.defaultMandate,
    expectedAgentBehavior: s.expectedAgentBehavior,
    expectedPolicyBehavior: s.expectedPolicyBehavior,
    remediationGuidance: s.remediationGuidance
  }));

  return NextResponse.json({
    scenarios: serialized,
    count: serialized.length
  });
}
