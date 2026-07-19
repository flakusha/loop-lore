// src/routes/notifications.ts
//
// Notification REST + SSE routes. Mirrors the activity endpoints
// (src/routes/activity.ts, activity-stream.ts) for consistency: a polling
// list plus an SSE stream that pushes when the unread snapshot changes.

import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { NotificationService, } from "../notifications/service";
import { safeJsonStringify, } from "../utils";
import { unauthorized, } from "../validation/middleware";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "./http-utils";

const POLL_INTERVAL_MS = 5000;
const KEEPALIVE_MS = 15_000;

/**
 * Pushes notification updates over SSE. Recomputes the unread snapshot on an
 * interval and emits the recent list only when it changes, keeping the wire
 * quiet while remaining authoritative. A dropped connection is repaired by
 * the client's next poll.
 */
export class NotificationStreamer {
  constructor(
    private readonly database: Kysely<DB>,
    private readonly userId: string,
    private readonly intervalMs: number = POLL_INTERVAL_MS,
  ) {}

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
        const service = new NotificationService(this.database,);
        const [count, recent,] = await Promise.all([
          service.getUnreadCount(this.userId,),
          service.list(this.userId, false,),
        ],);
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
          const service = new NotificationService(this.database,);
          const [count, recent,] = await Promise.all([
            service.getUnreadCount(this.userId,),
            service.list(this.userId, false,),
          ],);
          lastSnapshot = `${count}:${recent[0]?.id ?? ""}`;
          send(controller, "notifications", { unreadCount: count, items: recent.slice(0, 10,), },);
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

export function notificationsRoutes({ database, }: { database: Kysely<DB> },) {
  const idParams = t.Object({ id: t.String(), },);
  const markReadBody = t.Object({ read: t.Optional(t.Boolean(),), },);
  const enabledSchema = t.Optional(t.Record(t.String(), t.Boolean(),),);
  const mutedWorldsSchema = t.Optional(t.Array(t.String(),),);
  const prefsBody = t.Object({ enabled: enabledSchema, mutedWorlds: mutedWorldsSchema, },);
  return new Elysia({ name: "notifications", },)
    .get("/api/notifications", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return unauthorized(); }
      const unreadOnly = ctx.query?.unread === "true";
      const items = await new NotificationService(database,).list(userId, unreadOnly,);
      return jsonResponse({ items, },);
    },)
    .get("/api/notifications/unread-count", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return unauthorized(); }
      const count = await new NotificationService(database,).getUnreadCount(userId,);
      return jsonResponse({ count, },);
    },)
    .patch(
      "/api/notifications/:id",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        if (!userId) { return unauthorized(); }
        const id = ctx.params.id as string;
        const body = ctx.body as { read?: boolean };
        if (body.read === true) {
          await new NotificationService(database,).markRead(id, userId,);
        }
        return jsonResponse({ ok: true, },);
      },
      { params: idParams, body: markReadBody, },
    )
    .patch("/api/notifications/read-all", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return unauthorized(); }
      await new NotificationService(database,).markAllRead(userId,);
      return jsonResponse({ ok: true, },);
    },)
    .delete("/api/notifications/:id", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return unauthorized(); }
      await new NotificationService(database,).delete(ctx.params.id as string, userId,);
      return jsonResponse({ ok: true, },);
    },)
    .get("/api/notifications/preferences", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return unauthorized(); }
      const prefs = await new NotificationService(database,).getPrefs(userId,);
      return jsonResponse(prefs,);
    },)
    .patch(
      "/api/notifications/preferences",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        if (!userId) { return unauthorized(); }
        const body = ctx.body as {
          enabled?: Record<string, boolean>;
          mutedWorlds?: string[];
        };
        const prefs = await new NotificationService(database,).setPrefs(userId, {
          enabled: body.enabled,
          mutedWorlds: body.mutedWorlds,
        },);
        return jsonResponse(prefs,);
      },
      {
        body: prefsBody,
      },
    )
    .get("/api/notifications/stream", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: "Unauthorized",
          status: HttpStatus.Unauthorized,
          code: ErrorCode.Unauthorized,
        },);
      }
      return new NotificationStreamer(database, userId,).open();
    },);
}
