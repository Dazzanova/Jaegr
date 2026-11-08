export function stringifyJsonSafe(value: unknown): string {
  return (
    JSON.stringify(value, (_key, innerValue) =>
      typeof innerValue === "bigint" ? innerValue.toString() : innerValue
    ) ?? "null"
  );
}

/**
 * Deep-converts a value into something JSON-serializable (bigint -> string).
 * Used before handing RPC error payloads to `NextResponse.json`, which uses
 * plain `JSON.stringify` and throws on bigint.
 */
export function toJsonSafe<T>(value: T): T {
  return JSON.parse(stringifyJsonSafe(value)) as T;
}

export function safeJsonResponse(data: unknown, init?: ResponseInit): Response {
  const jsonStr = stringifyJsonSafe(data);
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  return new Response(jsonStr, {
    ...init,
    headers
  });
}
