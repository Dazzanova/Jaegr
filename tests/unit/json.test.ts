import { describe, expect, it } from "vitest";
import { safeJsonResponse, stringifyJsonSafe, toJsonSafe } from "@/lib/utils/json";

describe("JSON bigint safety", () => {
  it("serializes nested bigint values as strings", () => {
    const value = { units: 150n, nested: [{ fee: 5000n }], ok: true };
    expect(stringifyJsonSafe(value)).toBe(
      '{"units":"150","nested":[{"fee":"5000"}],"ok":true}'
    );
  });

  it("round-trips bigint payloads into plain JSON objects", () => {
    expect(toJsonSafe({ err: { InstructionError: [0, { Custom: 1n }] } })).toEqual({
      err: { InstructionError: [0, { Custom: "1" }] }
    });
  });

  it("never throws on a simulation error payload containing bigint", () => {
    const response = safeJsonResponse({
      simulation: { err: { Custom: 6001n }, logs: ["failed"] }
    });
    expect(response.status).toBe(200);
    return response.text().then((body) => {
      expect(body).toContain('"Custom":"6001"');
    });
  });
});
