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
import { Id, NotificationPreferencesBody, } from "../validation/schemas";
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
  return new Elysia({ name: "notifications", },)
    .get("/api/notifications", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return unauthorized(ctx.t?.("errors.unauthorized",) ?? "Unauthorized",); }
      const unreadOnly = ctx.query?.unread === "true";
      const items = await new NotificationService(database,).list(userId, unreadOnly,);
      return jsonResponse({ items, },);
    }, {
      detail: {
        summary: "List notifications",
        description: "List notifications for the current user. Optionally filter to unread only.",
        tags: ["Notifications",],
      },
    },)
    .get("/api/notifications/unread-count", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return unauthorized(ctx.t?.("errors.unauthorized",) ?? "Unauthorized",); }
      const count = await new NotificationService(database,).getUnreadCount(userId,);
      return jsonResponse({ count, },);
    }, {
      detail: {
        summary: "Get unread count",
        description: "Get the count of unread notifications for the current user.",
        tags: ["Notifications",],
      },
    },)
    .patch(
      "/api/notifications/:id",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        if (!userId) { return unauthorized(ctx.t?.("errors.unauthorized",) ?? "Unauthorized",); }
        if (ctx.body.read === true) {
          await new NotificationService(database,).markRead(ctx.params.id, userId,);
        }
        return jsonResponse({ ok: true, },);
      },
      {
        params: idParams,
        body: markReadBody,
        detail: {
          summary: "Mark notification read",
          description: "Mark a single notification as read.",
          tags: ["Notifications",],
        },
      },
    )
    .patch("/api/notifications/read-all", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return unauthorized(ctx.t?.("errors.unauthorized",) ?? "Unauthorized",); }
      await new NotificationService(database,).markAllRead(userId,);
      return jsonResponse({ ok: true, },);
    }, {
      detail: {
        summary: "Mark all notifications read",
        description: "Mark all notifications as read for the current user.",
        tags: ["Notifications",],
      },
    },)
    .delete("/api/notifications/:id", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return unauthorized(ctx.t?.("errors.unauthorized",) ?? "Unauthorized",); }
      await new NotificationService(database,).delete(ctx.params.id, userId,);
      return jsonResponse({ ok: true, },);
    }, {
      params: t.Object({ id: Id, },),
      detail: {
        summary: "Delete notification",
        description: "Delete a notification by ID.",
        tags: ["Notifications",],
      },
    },)
    .get("/api/notifications/preferences", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return unauthorized(ctx.t?.("errors.unauthorized",) ?? "Unauthorized",); }
      const prefs = await new NotificationService(database,).getPrefs(userId,);
      return jsonResponse(prefs,);
    }, {
      detail: {
        summary: "Get notification preferences",
        description: "Get the current user's notification preferences.",
        tags: ["Notifications",],
      },
    },)
    .patch(
      "/api/notifications/preferences",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        if (!userId) { return unauthorized(ctx.t?.("errors.unauthorized",) ?? "Unauthorized",); }
        const prefs = await new NotificationService(database,).setPrefs(userId, {
          enabled: ctx.body.enabled,
          mutedWorlds: ctx.body.mutedWorlds,
        },);
        return jsonResponse(prefs,);
      },
      {
        body: NotificationPreferencesBody,
        detail: {
          summary: "Update notification preferences",
          description: "Update notification preferences (enabled channels, muted worlds).",
          tags: ["Notifications",],
        },
      },
    )
    .get("/api/notifications/stream", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
          code: ErrorCode.Unauthorized,
        },);
      }
      return new NotificationStreamer(database, userId,).open();
    }, {
      detail: {
        summary: "Notification SSE stream",
        description: "Server-Sent Events stream that pushes notification updates in real-time.",
        tags: ["Notifications",],
      },
    },);
}
