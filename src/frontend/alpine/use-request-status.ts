// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * useRequestStatus — small composable for polling the request status
 * endpoint while a long-running request is in flight.
 *
 * Wraps `feFetch` with a polling loop that resolves when the row reaches
 * a terminal state (`complete` | `failed` | `expired`). Exposes
 * `subscribe(id, onUpdate)` and `cancel()` for callers that need
 * fire-and-forget notifications (e.g. a "Retry" button that re-issues
 * the underlying request with the same idempotency key).
 *
 * @see TASK-middleware-in-progress-status-endpoint-for-long-running-requ.md
 * @see epic-middleware-request-lifecycle.md
 */

import { feFetch, } from "../fe-fetch";

export type RequestStatusKind = "pending" | "in_progress" | "complete" | "failed" | "expired";

export interface RequestStatusPayload {
  requestId: string;
  status: RequestStatusKind;
  method?: string;
  routePattern?: string;
  startedAt?: string;
  completedAt?: string | null;
  progress?: Record<string, unknown> | null;
  response?: { status: number; headers: Record<string, string>; body: unknown } | null;
  error?: string | null;
}

export interface UseRequestStatusOptions {
  /** Poll interval in milliseconds (default 750). */
  intervalMs?: number;
  /** Hard ceiling on polling duration (default 30 s). */
  maxDurationMs?: number;
  /** Called when the row hits a terminal state or the ceiling expires. */
  onTerminal?: (payload: RequestStatusPayload,) => void;
  /** Called on every poll with the latest payload. */
  onUpdate?: (payload: RequestStatusPayload,) => void;
}

const TERMINAL: ReadonlySet<RequestStatusKind> = new Set<RequestStatusKind>([
  "complete",
  "failed",
  "expired",
],);

/**
 * Poll `/api/v1/requests/:id/status` until the row reaches a terminal
 * state. Returns a `cancel()` to stop polling early. Errors thrown by the
 * fetch are surfaced via `onUpdate` with `status: "failed"` so callers
 * can render an inline retry affordance without `try/catch` boilerplate.
 */
export function useRequestStatus(opts: UseRequestStatusOptions = {},): {
  subscribe: (requestId: string,) => void;
  cancel: () => void;
} {
  const intervalMs = opts.intervalMs ?? 750;
  const maxDurationMs = opts.maxDurationMs ?? 30_000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let aborted = false;

  function cancel(): void {
    aborted = true;
    if (timer !== null) {
      clearTimeout(timer,);
      timer = null;
    }
  }

  async function poll(requestId: string, startedAt: number,): Promise<void> {
    if (aborted) { return; }
    try {
      const res = await feFetch(`/api/v1/requests/${encodeURIComponent(requestId,)}/status`,);
      if (!res.ok) {
        const payload: RequestStatusPayload = {
          requestId,
          status: "failed",
          error: `Status endpoint returned ${res.status.toString()}`,
        };
        opts.onUpdate?.(payload,);
        opts.onTerminal?.(payload,);
        return;
      }
      const payload = (await res.json()) as RequestStatusPayload;
      opts.onUpdate?.(payload,);
      if (TERMINAL.has(payload.status,)) {
        opts.onTerminal?.(payload,);
        return;
      }
      if (Date.now() - startedAt >= maxDurationMs) {
        opts.onTerminal?.(payload,);
        return;
      }
      timer = setTimeout(() => {
        void poll(requestId, startedAt,);
      }, intervalMs,);
    } catch (err) {
      const payload: RequestStatusPayload = {
        requestId,
        status: "failed",
        error: err instanceof Error ? err.message : String(err,),
      };
      opts.onUpdate?.(payload,);
      opts.onTerminal?.(payload,);
    }
  }

  function subscribe(requestId: string,): void {
    cancel();
    aborted = false;
    void poll(requestId, Date.now(),);
  }

  return { subscribe, cancel, };
}
