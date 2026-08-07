// src/routes/notifications/
//
// Notification REST + SSE routes. Mirrors the activity endpoints
// (src/routes/activity.ts, activity-stream.ts) for consistency: a polling
// list plus an SSE stream that pushes when the unread snapshot changes.
//
// Barrel facade — registration point/name (`notifications`) preserved so the
// `elysia-app.ts` wiring is unchanged.
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { NotificationService, } from "../../notifications/service";
import { ErrorResponse, Id, NotificationPreferencesBody, SuccessResponse, } from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";
import { NotificationStreamer, } from "./stream";

export { NotificationStreamer, } from "./stream";

export function notificationsRoutes({ database, }: { database: Kysely<DB> },) {
  const idParams = t.Object({ id: t.String(), },);
  const markReadBody = t.Object({ read: t.Optional(t.Boolean(),), },);
  return new Elysia({ name: "notifications", },)
    .get("/api/notifications", async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const unreadOnly = ctx.query?.unread === "true";
      const items = await new NotificationService(database,).list(userId, unreadOnly,);
      return jsonResponse({ items, },);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "List notifications",
        description: "List notifications for the current user. Optionally filter to unread only.",
        tags: ["Notifications",],
      },
    },)
    .get("/api/notifications/unread-count", async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const count = await new NotificationService(database,).getUnreadCount(userId,);
      return jsonResponse({ count, },);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Get unread count",
        description: "Get the count of unread notifications for the current user.",
        tags: ["Notifications",],
      },
    },)
    .patch(
      "/api/notifications/:id",
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        if (ctx.body.read === true) {
          await new NotificationService(database,).markRead(ctx.params.id, userId,);
        }
        return jsonResponse({ ok: true, },);
      },
      {
        params: idParams,
        body: markReadBody,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
        },
        detail: {
          summary: "Mark notification read",
          description: "Mark a single notification as read.",
          tags: ["Notifications",],
        },
      },
    )
    .patch("/api/notifications/read-all", async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      await new NotificationService(database,).markAllRead(userId,);
      return jsonResponse({ ok: true, },);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Mark all notifications read",
        description: "Mark all notifications as read for the current user.",
        tags: ["Notifications",],
      },
    },)
    .delete("/api/notifications/:id", async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      await new NotificationService(database,).delete(ctx.params.id, userId,);
      return jsonResponse({ ok: true, },);
    }, {
      params: t.Object({ id: Id, },),
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Delete notification",
        description: "Delete a notification by ID.",
        tags: ["Notifications",],
      },
    },)
    .get("/api/notifications/preferences", async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const prefs = await new NotificationService(database,).getPrefs(userId,);
      return jsonResponse(prefs,);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Get notification preferences",
        description: "Get the current user's notification preferences.",
        tags: ["Notifications",],
      },
    },)
    .patch(
      "/api/notifications/preferences",
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const prefs = await new NotificationService(database,).setPrefs(userId, {
          enabled: ctx.body.enabled,
          mutedWorlds: ctx.body.mutedWorlds,
        },);
        return jsonResponse(prefs,);
      },
      {
        body: NotificationPreferencesBody,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
        },
        detail: {
          summary: "Update notification preferences",
          description: "Update notification preferences (enabled channels, muted worlds).",
          tags: ["Notifications",],
        },
      },
    )
    .get("/api/notifications/stream", async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      return new NotificationStreamer(database, userId,).open();
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Notification SSE stream",
        description: "Server-Sent Events stream that pushes notification updates in real-time.",
        tags: ["Notifications",],
      },
    },);
}
