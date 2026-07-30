// src/routes/activity-stream.ts
//
// Server-Sent Events stream of cross-chat activity. Coexists with the
// polling endpoint `GET /api/chats/activity`: both read the same source
// via `computeActivity`, so the SSE push and the periodic poll
// revalidate each other. A dropped SSE connection is repaired by the
// client's next poll; a missed poll is covered by the next SSE event.
//
// Route: GET /api/activity/stream

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { safeJsonStringify, } from "../utils";
import { computeActivity, } from "./activity";
import { ErrorCode, HttpStatus, jsonError, } from "./http-utils";

const POLL_INTERVAL_MS = 5000;
const KEEPALIVE_MS = 8000;

interface ActivityEntry {
  unseenCount: number;
  lastMessageCreatedAt: string | null;
  chatName: string;
}

/** Stable signature of an activity snapshot for change detection. */
function snapshotOf(map: Record<string, ActivityEntry>,): string {
  const result = safeJsonStringify(
    Object.entries(map,).map(([id, e,],) => [id, e.unseenCount, e.lastMessageCreatedAt,]),
  );
  return result.ok ? result.value : "[]";
}

/**
 * Streams per-chat unseen counts to the browser over SSE. Recomputes
 * activity on an interval and emits only when the snapshot changes,
 * keeping the wire quiet while remaining authoritative.
 */
export class ActivityStreamer {
  constructor(
    private readonly database: Kysely<DB>,
    private readonly userId: string,
    private readonly intervalMs: number = POLL_INTERVAL_MS,
  ) {}

  /** Open the SSE stream as a Response. */
  open(): Response {
    const encoder = new TextEncoder();
    let timer: ReturnType<typeof setInterval> | undefined;
    let keepalive: ReturnType<typeof setInterval> | undefined;
    let lastSnapshot = "";

    const send = (controller: ReadableStreamDefaultController, event: string, data: unknown,) => {
      try {
        const payload = safeJsonStringify(data,);
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${payload.ok ? payload.value : "{}"}\n\n`,),);
      } catch {
        // controller closed — ignore
      }
    };

    const tick = async (controller: ReadableStreamDefaultController,): Promise<void> => {
      try {
        const next = await computeActivity(this.database, this.userId,);
        const nextSnap = snapshotOf(next,);
        if (nextSnap !== lastSnapshot) {
          lastSnapshot = nextSnap;
          send(controller, "activity", { chats: next, },);
        }
      } catch {
        // transient DB error — skip this tick, keep stream alive
      }
    };

    const stream = new ReadableStream({
      start: async (controller,) => {
        try {
          const initial = await computeActivity(this.database, this.userId,);
          lastSnapshot = snapshotOf(initial,);
          send(controller, "activity", { chats: initial, },);
        } catch (error) {
          send(controller, "stream-error", { error: String(error,), },);
        }

        timer = setInterval(() => {
          void tick(controller,);
        }, this.intervalMs,);

        keepalive = setInterval(() => send(controller, "ping", { t: Date.now(), },), KEEPALIVE_MS,);
      },
      cancel: () => {
        if (timer) { clearInterval(timer,); }
        if (keepalive) { clearInterval(keepalive,); }
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
}

export function activityStreamRoutes({ database, }: { database: Kysely<DB> },) {
  return new Elysia({ name: "activity-stream", },).get("/api/activity/stream", async (ctx,) => {
    const userId = (ctx as any).userId as string | null;
    if (!userId) {
      return jsonError({
        message: (ctx as any).t?.("errors.unauthorized",) ?? "Unauthorized",
        status: HttpStatus.Unauthorized,
        code: ErrorCode.Unauthorized,
      },);
    }
    const streamer = new ActivityStreamer(database, userId,);
    return streamer.open();
  },);
}
