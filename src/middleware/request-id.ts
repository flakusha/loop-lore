// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Request-Id resolution.
 *
 * The HTTP request lifecycle layer depends on a single canonical id per
 * request that:
 *   - is non-empty printable ASCII ≤ 128 chars,
 *   - is safe to log and to embed in headers / SQL identifiers,
 *   - is preferably a UUID v4 (RFC 4122) for cross-service correlation,
 *   - is unique enough for the idempotency + in-progress-status subsystems.
 *
 * Order of precedence (mirrors ticket TASK-middleware-accept-frontend-supplied-request-id-uuid-with-ser):
 *   1. `X-Request-Id` header (honor client-supplied id verbatim when valid).
 *   2. `Idempotency-Key` header (alias — same id semantics; accepts whatever
 *      the client chooses, not necessarily a UUID).
 *   3. `crypto.randomUUID()` server-side fallback.
 *
 * The function is pure: it does not read or mutate the request, it only
 * inspects headers. Callers must apply the resolved id back to the request
 * (e.g. `headers.set("x-request-id", id)`) and to the outgoing response.
 * @see TASK-middleware-accept-frontend-supplied-request-id-uuid-with-ser.md
 */

/** HTTP header carrying the client-supplied request id (preferred). */
export const REQUEST_ID_HEADER = "x-request-id";
/** HTTP header carrying the client-supplied request id (alias). */
export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
/** Max accepted length for client-supplied ids. */
export const MAX_REQUEST_ID_LENGTH = 128;
/**
 * Strict printable ASCII that is safe to log, embed in SQL identifiers, and
 * pass through headers without escaping: letters, digits, `-`, `_`, `.`, `:`.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]+$/;

/**
 * Validate a client-supplied id. Empty / oversized / unsafe / control-char
 * inputs are rejected — callers MUST fall back to a server-generated id
 * rather than echo the input back.
 * @param value - Raw header value (may be empty or contain leading/trailing
 *   whitespace from the client).
 * @returns The trimmed value when valid; `null` when the caller must fall
 *   back to `crypto.randomUUID()`.
 */
export function isValidRequestId(value: string | null | undefined,): string | null {
  if (value === null || value === undefined) { return null; }
  // Trim once — RFC 7230 allows OWS around field values.
  const trimmed = value.trim();
  if (trimmed.length === 0) { return null; }
  if (trimmed.length > MAX_REQUEST_ID_LENGTH) { return null; }
  if (!SAFE_REQUEST_ID.test(trimmed,)) { return null; }
  return trimmed;
}

/**
 * Resolve the request id for an incoming request.
 * @param headers - Request headers to inspect (case-insensitive via Headers).
 * @returns The chosen id — either the validated client value or a freshly
 *   generated UUID v4. Always returns a non-empty printable ASCII string ≤
 *   `MAX_REQUEST_ID_LENGTH` chars.
 */
export function resolveRequestId(headers: Headers,): string {
  // X-Request-Id is the canonical header; Idempotency-Key is the alias.
  const fromHeader = isValidRequestId(headers.get(REQUEST_ID_HEADER,),);
  if (fromHeader !== null) { return fromHeader; }
  const fromAlias = isValidRequestId(headers.get(IDEMPOTENCY_KEY_HEADER,),);
  if (fromAlias !== null) { return fromAlias; }
  return crypto.randomUUID();
}

/**
 * Apply the resolved id to the request headers in place.
 *
 * Mutates the given headers map and returns the same reference for
 * convenience. Callers that pass a `Headers` instance directly (as Elysia's
 * `.derive` does) get the mutation for free; callers with immutable
 * snapshots should pass a cloned `Headers` instead.
 * @param headers - Mutable headers bag (typically a cloned request's Headers).
 * @param id - Resolved request id (must pass `isValidRequestId`).
 * @returns The same headers reference, now carrying `x-request-id`.
 */
export function applyRequestId(headers: Headers, id: string,): Headers {
  if (!isValidRequestId(id,)) {
    // Defensive: a malformed id must NEVER be written to headers. Fall back
    // to a fresh UUID rather than echoing the bad input back.
    headers.set(REQUEST_ID_HEADER, crypto.randomUUID(),);
    return headers;
  }
  headers.set(REQUEST_ID_HEADER, id,);
  return headers;
}
/**
 * Elysia `.derive()` middleware — resolves, validates, and applies the
 * request id for every request.
 *
 * Sets `x-request-id` on the in-memory `Request` headers (so existing
 * `request.headers.get("x-request-id")` reads continue to work) AND
 * returns `{ requestId }` so downstream handlers can read `ctx.requestId`
 * without re-parsing headers.
 *
 * Wire in `src/elysia-app.ts` BEFORE the auth `.derive()` so
 * `authenticate(...)` can correlate the resolved id, and BEFORE the
 * idempotency `beforeHandle` (which reads `ctx.requestId`).
 * @returns An Elysia derive function for use with `.derive(...)`.
 * @see TASK-middleware-request-id-elysia-derive.md
 */
export function requestIdMiddleware(): (ctx: {
  request: Request;
},) => { requestId: string } {
  return ({ request, }: { request: Request },) => {
    const id = resolveRequestId(request.headers,);
    request.headers.set(REQUEST_ID_HEADER, id,);
    return { requestId: id, };
  };
}
