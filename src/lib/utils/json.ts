export function safeJsonResponse(data: unknown, init?: ResponseInit): Response {
  const jsonStr = JSON.stringify(data, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  return new Response(jsonStr, {
    ...init,
    headers
  });
}
