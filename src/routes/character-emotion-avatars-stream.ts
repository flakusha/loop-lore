// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// SSE stream for emotion-avatar batch job progress.

import {
  jobProgress,
  subscribeJob,
} from "../characters/services/emotion-avatar-service/job-events";
import type { BatchGenerationJob, } from "../characters/services/emotion-avatar-service/types";
import { safeJsonStringify, } from "../utils";

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled",],);

const KEEPALIVE_MS = 15_000;

/**
 * True when the job status is terminal.
 * @param status
 * @returns {boolean}
 */
function isTerminalStatus(status: string,): boolean {
  return TERMINAL_STATUSES.has(status,);
}

/**
 * Stream per-variant progress for a batch job over SSE.
 *
 * Sends an initial `progress` snapshot immediately (the reconnect/stale-job
 * guard: a client that reconnects — or connects to a job that already
 * finished — learns the current state without waiting for the next variant),
 * forwards live progress events, then sends `event: done` and closes once the
 * job reaches a terminal status. Keepalive pings every 15s; the subscription
 * is dropped when the consumer cancels.
 * @param job
 * @returns {Response}
 */
export function handleJobStream(job: BatchGenerationJob,): Response {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let keepalive: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    /**
     * @param {ReadableStreamDefaultController} controller
     */
    start(controller,) {
      const send = (event: string, data: unknown,) => {
        const payload = safeJsonStringify(data,);
        if (!payload.ok) { return; }
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${payload.value}\n\n`,),);
        } catch {
          // Consumer gone — cancel() runs cleanup.
        }
      };

      unsubscribe = subscribeJob(job.id, (progress,) => {
        send("progress", progress,);
        if (!isTerminalStatus(progress.status,)) { return; }
        send("done", {},);
        if (keepalive) {
          clearInterval(keepalive,);
          keepalive = undefined;
        }

        unsubscribe?.();
        unsubscribe = undefined;
        controller.close();
      },);

      send("progress", jobProgress(job,),);
      if (isTerminalStatus(job.status,)) {
        send("done", {},);
        controller.close();
        return;
      }

      keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n",),);
        } catch {
          // Consumer gone — cancel() runs cleanup.
        }
      }, KEEPALIVE_MS,);
    },
    /**
     * @returns {void}
     */
    cancel() {
      if (keepalive) {
        clearInterval(keepalive,);
        keepalive = undefined;
      }

      unsubscribe?.();
      unsubscribe = undefined;
    },
  },);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  },);
}
