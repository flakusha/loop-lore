// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness exec-log + job-status SSE (TASK-harness-surfacing-exec-log-sse-to-chat-usage-ledger-credit-g).
 *
 * `GET /api/v1/harness/stream` — admin-gated (the log carries branch names,
 * error text and pids, like the runs surface it mirrors); 503 when the
 * runtime is not composed, so the surface is inert rather than auto-anything.
 *
 * Built on the repo's SSE scaffold (`routes/sse-stream.ts`) in the
 * ActivityStreamer shape: poll on an interval, emit on change. Two events:
 * - `run` — one frame per NEW exec-log record since the last beat, in the
 *   `GET /harness/runs` summary shape (`toSummary`) plus the dispatching
 *   profile (the summary omits it; the operator tail needs who ran), oldest
 *   first.
 * - `jobs` — the permission queue's pending asks (id/profile/tool/arrival)
 *   whenever that set changes, plus once on connect.
 *
 * The stream anchors at connect and never replays history: the JSONL and
 * `GET /harness/runs` are the back catalog. A burst larger than the read
 * window between two beats re-anchors silently — this is an operator tail,
 * not a durable feed, and dropping nothing is the exec-log file's job.
 */
import { Elysia, } from "elysia";
import { listRuns, } from "../../harness/query";
import { type HarnessRunRecord, toSummary, } from "../../harness/types";
import { getHarnessRuntime, } from "../../integrations/harness/runtime";
import { requirePermission, } from "../../middleware/permissions";
import { safeJsonStringify, } from "../../utils";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, } from "../http-utils";
import { type SseSend, sseStream, } from "../sse-stream";

/** Poll interval: the exec-log writer is append-per-call, so a tail lags at most this. */
const RUN_POLL_MS = 2000;

/** Keepalive must beat Bun.serve's 10s idle timeout (sseStream contract). */
const KEEPALIVE_MS = 8000;

/** Newest records examined per beat; a bigger burst re-anchors (documented above). */
const RUN_WINDOW = 25;

/** Error when the runtime (and with it the stream's sources) is missing. */
const NOT_COMPOSED = {
  message: "harness runtime not composed — the ACP integration is disabled or not booted",
  status: HttpStatus.ServiceUnavailable,
  code: ErrorCode.ServiceUnavailable,
} as const;

/** Route options; tests shorten the intervals so beats fire without sleeps. */
export interface HarnessStreamOptions {
  /** Poll interval in ms (default {@link RUN_POLL_MS}). */
  intervalMs?: number;
  /** Keepalive ping interval in ms (default {@link KEEPALIVE_MS}). */
  keepaliveMs?: number;
}

/** The permission-queue fields an operator tail needs (never the raw params). */
interface HarnessJobView {
  id: string;
  profile: string;
  tool: string | null;
  arrival: number;
}

/**
 * The pending permission asks, oldest first, projected to the wire shape.
 * @param profileTool - nothing; reads the composed runtime's queue.
 * @returns the pending asks.
 */
function jobViews(): HarnessJobView[] {
  const runtime = getHarnessRuntime();
  if (!runtime) { return []; }

  return runtime.permissions.listPending().map((entry,) => ({
    id: entry.id,
    profile: entry.profile,
    tool: entry.tool,
    arrival: entry.arrival,
  }));
}

/**
 * Open the SSE stream: anchor at the newest record, then emit new runs and
 * jobs deltas per beat. Test seam for the intervals, production defaults.
 * @param opts - interval overrides.
 * @returns the text/event-stream response.
 */
export function openHarnessStream(opts: HarnessStreamOptions = {},): Response {
  let lastRunId: string | null = null;
  let lastJobs = "";
  // Beats before the anchor lands must not run: onStart's async listRuns
  // could otherwise lose the race with the first interval tick.
  let anchored = false;

  const tick = async (send: SseSend,): Promise<void> => {
    if (!anchored || !getHarnessRuntime()) { return; } // pre-anchor / reset: skip the beat

    const runs = await listRuns({}, RUN_WINDOW,);
    // Newest first: everything above the anchor arrived since the last beat.
    // A null anchor means connect saw an EMPTY log, so every record since is
    // new. An anchor that fell out of the window (burst > RUN_WINDOW)
    // re-anchors silently — the file, not the stream, is the durable record.
    let fresh: HarnessRunRecord[] = [];
    if (lastRunId === null) {
      fresh = runs;
    } else {
      const anchorIdx = runs.findIndex((record,) => record.runId === lastRunId);
      fresh = anchorIdx > 0 ? runs.slice(0, anchorIdx,) : [];
    }

    for (const record of [...fresh,].reverse()) {
      // The runs SUMMARY omits the profile; the operator tail needs who ran,
      // so the frame carries the summary shape plus the dispatching profile.
      send("run", { ...toSummary(record,), profile: record.profile ?? null, },);
    }

    if (runs.length > 0) { lastRunId = runs[0]?.runId ?? lastRunId; }

    const jobs = jobViews();
    const encoded = safeJsonStringify(jobs,);
    const signature = encoded.ok ? encoded.value : "";
    if (signature !== lastJobs) {
      lastJobs = signature;
      send("jobs", { items: jobs, },);
    }
  };

  return sseStream(tick, {
    intervalMs: opts.intervalMs ?? RUN_POLL_MS,
    keepaliveMs: opts.keepaliveMs ?? KEEPALIVE_MS,
    onStart: async (send,) => {
      // Anchor WITHOUT replaying history; the jobs snapshot is the one thing
      // a connecting operator must see immediately.
      const runs = await listRuns({}, 1,);
      lastRunId = runs[0]?.runId ?? null;
      anchored = true;
      const jobs = jobViews();
      const encoded = safeJsonStringify(jobs,);
      lastJobs = encoded.ok ? encoded.value : "";
      send("jobs", { items: jobs, },);
    },
  },);
}

/**
 * Build the harness stream route plugin.
 * @param prefix - Mount prefix. Admin-gated like the rest of the harness
 *   surface, so the default is the versioned root.
 * @param opts - interval overrides (test seam).
 * @returns The Elysia plugin, ready for `.use()`.
 */
export function harnessStreamRoutes(prefix = "/api/v1", opts: HarnessStreamOptions = {},) {
  const guard = requirePermission("admin.system",);
  const denied = { 403: ErrorResponse, } as const;

  return new Elysia({ name: "harness-stream", },)
    .guard({ beforeHandle: guard, }, (app,) =>
      app.get(`${prefix}/harness/stream`, () => {
        if (!getHarnessRuntime()) { return jsonError(NOT_COMPOSED,); }

        return openHarnessStream(opts,);
      }, {
        response: { 503: ErrorResponse, ...denied, },
        detail: {
          summary: "Stream harness exec-log and job status via SSE",
          description:
            "Admin-gated Server-Sent Events tail of the harness exec log (`run` events, runs-summary shape) and the pending permission queue (`jobs` events). Anchors at connect; the JSONL stays the durable record.",
          tags: ["Harness", "Stream",],
        },
      },),);
}
