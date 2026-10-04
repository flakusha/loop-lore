// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Scheduled messages + reminders routes (TASK-scheduled-messages-reminders).
 *
 *   POST   /chats/:id/scheduled           — park a message for later
 *   GET    /chats/:id/scheduled           — list a chat's parked messages
 *   DELETE /chats/:id/scheduled/:scheduledId — cancel a parked message
 *   POST   /reminders                        — arm a reminder on a message
 *   GET    /reminders                        — list the caller's reminders
 *   DELETE /reminders/:id                    — cancel a reminder
 *
 * Guards and the service-error mapping live in `./guards.ts`; every
 * chat-scoped endpoint answers 404 on denial — the codebase convention that
 * hides chat existence rather than 403-ing it (see `routes/chat-pins.ts`).
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import {
  cancelReminder,
  cancelScheduledMessage,
  createReminder,
  listReminders,
  listScheduledMessages,
  scheduleMessage,
} from "../../chat/scheduled";
import type { DB, } from "../../db/schema";
import { notFound, } from "../../validation/middleware";
import { ChatIdParams, } from "../../validation/schemas";
import { HttpStatus, jsonResponse, } from "../http-utils";
import { requireChatAccess, requireUser, respond, scheduledError, withChat, } from "./guards";

/** Param schema for the cancel route: chat plus the row to cancel. */
const cancelParams = t.Object({ id: t.String(), scheduledId: t.String(), },);

/** Route options — only the database handle is needed. */
export interface ScheduledRouteOpts {
  database: Kysely<DB>;
}

/**
 * @param opts
 * @param prefix
 * @returns {Elysia}
 */
export function scheduledRoutes(opts: ScheduledRouteOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "scheduled", },)
    // ── Park a message ───────────────────────────────────────
    .post(
      `${prefix}/chats/:id/scheduled`,
      withChat(database, async (ctx, chatId, caller,) => {
        const { body, sendAt, } = (ctx as { body: { body: string; sendAt: string } }).body;
        const result = await scheduleMessage(database, {
          chatId,
          authorId: caller.userId,
          body,
          sendAt,
        },);

        if (!("ok" in result)) { return scheduledError(result,); }
        return jsonResponse(result.scheduled, HttpStatus.Created,);
      },),
      {
        params: ChatIdParams,
        body: t.Object({ body: t.String(), sendAt: t.String(), },),
        detail: {
          summary: "Schedule a message",
          description: "Park a message body for delivery at a future instant.",
          tags: ["Chat", "Scheduled",],
        },
      },
    )
    // ── List a chat's parked messages ────────────────────────
    .get(
      `${prefix}/chats/:id/scheduled`,
      withChat(database, async (_ctx, chatId,) => {
        return jsonResponse(await listScheduledMessages(database, chatId,),);
      },),
      {
        params: ChatIdParams,
        detail: {
          summary: "List scheduled messages",
          description: "List every parked message in a chat, soonest first.",
          tags: ["Chat", "Scheduled",],
        },
      },
    )
    // ── Cancel a parked message (author only) ────────────────
    .delete(
      `${prefix}/chats/:id/scheduled/:scheduledId`,
      withChat(database, async (ctx, chatId, caller,) => {
        const scheduledId = (ctx as { params: { scheduledId: string } }).params.scheduledId;
        // The chat `withChat` just authorized is threaded into the service,
        // so `:scheduledId` is only honored when it names a row in that
        // same chat — the same binding the reminder arm applies above.
        const result = await cancelScheduledMessage(database, {
          chatId,
          id: scheduledId,
          requesterId: caller.userId,
        },);

        return respond(result,);
      },),
      {
        params: cancelParams,
        detail: {
          summary: "Cancel a scheduled message",
          description: "Cancel a parked message in this chat. Only its author can cancel it.",
          tags: ["Chat", "Scheduled",],
        },
      },
    )
    // ── Arm a reminder ───────────────────────────────────────
    .post(
      `${prefix}/reminders`,
      async (ctx,) => {
        const { messageId, remindAt, } = ctx.body;

        // A reminder targets a message, so the caller's chat access is
        // checked against the message's own chat — never a body-supplied one.
        const message = await database
          .selectFrom("messages",)
          .select("chat_id",)
          .where("id", "=", messageId,)
          .executeTakeFirst();

        if (!message) { return notFound("Message not found",); }
        const access = await requireChatAccess(database, ctx, message.chat_id,);
        if (access instanceof Response) { return access; }

        const result = await createReminder(database, {
          messageId,
          userId: access.userId,
          remindAt,
        },);

        if (!("ok" in result)) { return scheduledError(result,); }
        return jsonResponse(result.reminder, HttpStatus.Created,);
      },
      {
        body: t.Object({ messageId: t.String(), remindAt: t.String(), },),
        detail: {
          summary: "Create a message reminder",
          description: "Arm a reminder that notifies the caller about a message at a future instant.",
          tags: ["Chat", "Reminders",],
        },
      },
    )
    // ── List the caller's reminders ──────────────────────────
    .get(
      `${prefix}/reminders`,
      async (ctx,) => {
        const auth = requireUser(ctx,);
        if (auth instanceof Response) { return auth; }
        return jsonResponse(await listReminders(database, auth.userId,),);
      },
      {
        detail: {
          summary: "List message reminders",
          description: "List the authenticated user's pending reminders, soonest first.",
          tags: ["Chat", "Reminders",],
        },
      },
    )
    // ── Cancel a reminder ────────────────────────────────────
    .delete(
      `${prefix}/reminders/:id`,
      async (ctx,) => {
        const auth = requireUser(ctx,);
        if (auth instanceof Response) { return auth; }
        const result = await cancelReminder(database, {
          id: ctx.params.id,
          userId: auth.userId,
        },);

        return respond(result,);
      },
      {
        params: t.Object({ id: t.String(), },),
        detail: {
          summary: "Cancel a message reminder",
          description: "Cancel one of the authenticated user's pending reminders.",
          tags: ["Chat", "Reminders",],
        },
      },
    );
}
