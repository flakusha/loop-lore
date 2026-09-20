// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Notifications — SSE streamer. Pushes notification updates over SSE;
 * recomputes the unread snapshot on an interval and emits the recent list only
 * when it changes, keeping the wire quiet while remaining authoritative. A
 * dropped connection is repaired by the client's next poll.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { NotificationService, } from "../../notifications/service";
import { safeJsonStringify, } from "../../utils";

export const POLL_INTERVAL_MS = 5000;
// Bun.serve's default idleTimeout kills a connection after 10s without
// traffic (same window as the activity stream's keepalive); 15s left an
// idle gap long enough for the stream to be severed between pings.
// BUG-bug-notification-stream-killed-by-idle-timeout.
export const KEEPALIVE_MS = 8_000;

/** Snapshot of the unread state surfaced over SSE. */
export interface NotificationSnapshot {
  readonly count: number;
  readonly recent: readonly { readonly id: string }[];
}

/**
 * Load the unread snapshot with allSettled semantics: each query resolves
 * independently so one failing query degrades to its empty default instead
 * of throwing. Never rejects for query failures.
 * @param database
 * @param userId
 */
export async function loadNotificationSnapshot(
  database: Kysely<DB>,
  userId: string,
): Promise<NotificationSnapshot> {
  const service = new NotificationService(database,);
  const [countRes, recentRes,] = await Promise.allSettled([
    service.getUnreadCount(userId,),
    service.list(userId, false,),
  ],);
  return {
    count: countRes.status === "fulfilled" ? countRes.value : 0,
    recent: recentRes.status === "fulfilled" ? recentRes.value : [],
  };
}

/** */
export class NotificationStreamer {
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

  /** */
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
      // loadNotificationSnapshot never rejects for query failures (allSettled
      // → empty defaults), so only transport-level throws land in catch.
      try {
        const { count, recent, } = await loadNotificationSnapshot(this.database, this.userId,);
        const snap = `${count}:${recent[0]?.id ?? ""}`;
        if (snap !== lastSnapshot) {
          lastSnapshot = snap;
          send(controller, "notifications", { unreadCount: count, items: recent.slice(0, 10,), },);
        }
      } catch {
        // transient DB error — skip this tick, keep stream alive
      }
    };

    const stream = new ReadableStream({
      start: async (controller,) => {
        try {
          const { count, recent, } = await loadNotificationSnapshot(this.database, this.userId,);
          lastSnapshot = `${count}:${recent[0]?.id ?? ""}`;
          send(controller, "notifications", { unreadCount: count, items: recent.slice(0, 10,), },);
        } catch (error) {
          // Never leak error internals to the client; log with a correlation id.
          const correlationId = crypto.randomUUID();
          getLogger().error(
            "notification-stream: initial snapshot failed",
            error instanceof Error ? error : new Error(String(error,),),
            { correlationId, },
          );
          send(controller, "stream-error", { message: "stream error, retry", correlationId, },);
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
