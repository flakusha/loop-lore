// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Request-lifecycle hook — bridges the Elysia request/response cycle to the
 * async request-result store (`request_results` table).
 *
 * `recordLifecycle` returns an Elysia `afterHandle` hook that, for requests
 * carrying a request id, transitions the tracked row:
 *   - success (response present, any status): `complete` with a captured
 *     snapshot of status + whitelisted headers + body.
 *   - no response / non-Response: leaves the row as-is (idempotency owns the
 *     2xx cache; lifecycle just records what the handler produced).
 *
 * On error paths (uncaught throws in handlers) the global `.onError()` bound
 * in `src/elysia-app.ts` resolves the request id and calls `asyncStore.fail`.
 *
 * The hook clones the response before reading its body so the client-facing
 * stream is not consumed.
 * @see TASK-async-store-complete-fail-lifecycle-hooks.md
 * @see epic-middleware-request-lifecycle.md
 */
import {
  type AsyncStore,
  type CapturedResponse,
  type OwnerRef,
  createAsyncStore,
} from "../async/store";

/** Headers that MUST NOT be persisted (cookies, hop-by-hop). */
const HEADER_BLOCKLIST = new Set([
  "set-cookie",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "date",
],);

/**
 * Resolve the userId to attribute this lifecycle event to.
 *
 * Reads the `x-user-id` header that `src/elysia-app.ts` derives sets after
 * authentication resolves. The header is **stripped** when auth fails (see
 * `src/elysia-app.ts:auth-derive` — `request.headers.delete("x-user-id",)`),
 * so a client cannot spoof the owner of an unauthenticated request.
 * Anonymous reads return `null`, matching the `user_id` column on the row
 * created by `track()` for the same request id.
 *
 * BUG-bug-async-lifecycle-writes-request-results-unscoped-by-user.
 * @param request
 */
function resolveOwner(request: Request,): string | null {
  return request.headers.get("x-user-id",);
}

/**
 * Capture a snapshot of the response for the result row.
 * @param response
 */
async function capture(response: Response,): Promise<CapturedResponse> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name,) => {
    if (!HEADER_BLOCKLIST.has(name.toLowerCase(),)) { headers[name] = value; }
  },);
  // Clone before reading so the original body stream reaches the client.
  const body = await response.clone().text();
  return { status: response.status, headers, body, };
}

/**
 * Build the lifecycle afterHandle hook bound to a concrete store.
 * @param asyncStore - The async request-result store written to on completion.
 */
export function recordLifecycle(asyncStore: AsyncStore,) {
  return async (ctx: {
    request: Request;
    route: string;
    requestId?: string;
    response?: unknown;
  },): Promise<void> => {
    const requestId = ctx.requestId;
    if (!requestId) { return; }
    const response = ctx.response;
    if (!(response instanceof Response)) { return; }
    const owner: OwnerRef = { userId: resolveOwner(ctx.request,), };
    try {
      if (response.status >= 400) {
        // Client/server error responses mark the row failed rather than complete
        // so the idempotency layer does not cache a 4xx/5xx for replay.
        asyncStore.fail(requestId, owner, `HTTP ${response.status}`,);
        return;
      }
      const captured = await capture(response,);
      asyncStore.complete(requestId, owner, captured,);
    } catch (error) {
      // Never fail the client response because of a record error.
      asyncStore.fail(requestId, owner, `lifecycle capture failed: ${String(error,)}`,);
    }
  };
}

export { createAsyncStore, };
export type { AsyncStore, } from "../async/store";
