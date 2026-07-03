/**
 * Shared HTTP utilities for API route handlers.
 */

export function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function jsonError(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}
