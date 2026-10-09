// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
import { getLogger, } from "../logger";
import { safeJsonStringify, } from "../utils";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { computeActivity, } from "./activity";
import { requireUserId, } from "./http-utils";
import { type SseSend, sseStream, } from "./sse-stream";

const POLL_INTERVAL_MS = 5000;
const KEEPALIVE_MS = 8000;

interface ActivityEntry {
  unseenCount: number;
  lastMessageCreatedAt: string | null;
  chatName: string;
}

/**
 * Stable signature of an activity snapshot for change detection.
 * @param map
 */
function snapshotOf(map: Record<string, ActivityEntry>,): string {
  const result = safeJsonStringify(
    Array.from(Object.entries(map,), ([id, e,],) => [id, e.unseenCount, e.lastMessageCreatedAt,],),
  );

  return result.ok ? result.value : "[]";
}

/**
 * Streams per-chat unseen counts to the browser over SSE. Recomputes
 * activity on an interval and emits only when the snapshot changes,
 * keeping the wire quiet while remaining authoritative.
 */
export class ActivityStreamer {
  /**
   * @param database
   * @param userId
   * @param intervalMs
   */
  constructor(
    private readonly database: Kysely<DB>,
    private readonly userId: string,
    private readonly intervalMs: number = POLL_INTERVAL_MS,
  ) {}

  /** Open the SSE stream as a Response. */
  /**
   * @returns {Response}
   */
  open(): Response {
    let lastSnapshot = "";

    const tick = async (send: SseSend,): Promise<void> => {
      try {
        const next = await computeActivity(this.database, this.userId,);
        const nextSnap = snapshotOf(next,);
        if (nextSnap !== lastSnapshot) {
          lastSnapshot = nextSnap;
          send("activity", { chats: next, },);
        }
      } catch {
        // transient DB error — skip this tick, keep stream alive
      }
    };

    return sseStream(tick, {
      intervalMs: this.intervalMs,
      keepaliveMs: KEEPALIVE_MS,
      onStart: async (send,) => {
        try {
          const initial = await computeActivity(this.database, this.userId,);
          lastSnapshot = snapshotOf(initial,);
          send("activity", { chats: initial, },);
        } catch (error) {
          // Never leak error internals to the client; log with a correlation id.
          const correlationId = crypto.randomUUID();
          getLogger().error(
            "activity-stream: initial snapshot failed",
            error instanceof Error ? error : new Error(String(error,),),
            { correlationId, },
          );

          send("stream-error", { message: "stream error, retry", correlationId, },);
        }
      },
    },);
  }
}

/**
 * @param root0
 * @param root0.database
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { activity: { stream: { ...; }; }; }; }, { ...; }, { ...; }>}
 */
export function activityStreamRoutes({ database, }: { database: Kysely<DB> }, prefix = "/api",) {
  return new Elysia({ name: "activity-stream", },).get(`${prefix}/activity/stream`, (ctx,) => {
    const userId = requireUserId(ctx,);
    if (typeof userId !== "string") { return userId; }
    const streamer = new ActivityStreamer(database, userId,);
    return streamer.open();
  }, {
    response: {
      200: SuccessResponse,
      401: ErrorResponse,
    },
    detail: {
      summary: "Stream activity via SSE",
      description:
        "Server-Sent Events stream of cross-chat activity, emitting per-chat unseen counts and last message timestamps.",
      tags: ["Activity", "Stream",],
    },
  },);
}
