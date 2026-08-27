// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/routes/message-seen.ts
//
// Seen-state endpoints for messages, returning grouped viewer lists.
// All endpoints gate on message access via checkChatAccess, consistent with
// reactions and other message interactions.
//
// GET    /api/messages/:id/seen     — grouped viewers (who has seen / who is processing)
// POST   /api/messages/:id/seen     — record/clear seen for actor
// DELETE /api/messages/:id/seen     — remove actor's seen record
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { checkChatAccess, } from "../chat/service";
import type { DB, } from "../db/schema";
import { notFound, } from "../validation/middleware";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { extractAuth, jsonResponse, requireUserId, } from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

/**
 * Resolve a message and verify the user may access it.
 *
 * Access policy: the chat owner, any chat participant, and admin/solo roles
 * may view or modify seen-state. Uses `checkChatAccess`, so this stays
 * consistent with the rest of the message/chat pipelines.
 *
 * @returns the message's `chat_id` on success, or a 404 `Response` if the
 *          message is missing or the user lacks access (returned to the caller
 *          verbatim).
 */
async function resolveMessageAccess(
  database: Kysely<DB>,
  messageId: string,
  userId: string,
  userRole: string | null,
): Promise<string | Response> {
  const msg = await database
    .selectFrom("messages",)
    .select(["chat_id", "id",],)
    .where("id", "=", messageId,)
    .executeTakeFirst();
  if (!msg) { return notFound("Message not found",); }

  const access = await checkChatAccess(database, msg.chat_id, userId, userRole,);
  if (!access.ok) { return notFound("Message not found",); }

  return msg.chat_id;
}

/**
 * List grouped viewers for a message — seen/unseen + who is processing.
 *
 * Returns: { actorId, state ("unseen"|"processing"|"seen"), seenAt } for each
 * viewer (human or AI) with a recorded state on this message.
 */
export function messageSeenRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "message-seen", },)
      // GET /api/messages/:id/seen — grouped viewers
      .get(
        `${prefix}/messages/:id/seen`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const { userRole, } = extractAuth(ctx,);
          const messageId = ctx.params.id;

          const chatId = await resolveMessageAccess(database, messageId, userId, userRole,);
          if (typeof chatId !== "string") { return chatId; }

          const result = await database
            .selectFrom("message_seen",)
            .select(["actor_id", "state", "seen_at",],)
            .where("message_id", "=", messageId,)
            .execute();

          const grouped = new Map<string, { state: string; seenAt: string | null; count: number }>();
          for (const r of result) {
            const existing = grouped.get(r.actor_id,) ?? { state: r.state, seenAt: r.seen_at ?? null, count: 0, };
            existing.state = r.state;
            existing.seenAt = r.seen_at ?? null;
            existing.count++;
            grouped.set(r.actor_id, existing,);
          }

          return jsonResponse(Array.from(grouped, ([actorId, data,],) => ({
            actorId,
            state: data.state,
            seenAt: data.seenAt,
            count: data.count,
          }),),);
        },
        {
          params: t.Object({ id: t.String(), },),
          response: {
            200: t.Array(
              t.Object({ actorId: t.String(), state: t.String(), seenAt: t.String(), count: t.Number(), },),
            ),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Get grouped seen-state viewers for a message",
            description:
              "Returns all actors who have seen or are processing a message, grouped by actor, with their state and timestamp.",
            tags: ["Messages", "Seen",],
          },
        },
      )
      // POST /api/messages/:id/seen — record or clear seen for actor
      .post(
        `${prefix}/messages/:id/seen`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const { userRole, } = extractAuth(ctx,);
          const messageId = ctx.params.id;
          const { actorId, state, } = ctx.body as { actorId: string; state?: "unseen" | "processing" | "seen" };

          if (!actorId || typeof actorId !== "string") {
            return Response.json({ error: "actorId is required", }, { status: 400, },);
          }

          const chatId = await resolveMessageAccess(database, messageId, userId, userRole,);
          if (typeof chatId !== "string") { return chatId; }

          // If user is providing a state of "unseen", remove the actor's record
          if (state === "unseen") {
            await database
              .deleteFrom("message_seen",)
              .where("message_id", "=", messageId,)
              .where("actor_id", "=", actorId,)
              .execute();
            return jsonResponse({ ok: true, reset: true, },);
          }

          // Record the seen state (default: "seen")
          const effectiveState = state ?? "seen";
          const now = new Date().toISOString();

          // Try to update existing row first
          const existing = await database
            .selectFrom("message_seen",)
            .select("id",)
            .where("message_id", "=", messageId,)
            .where("actor_id", "=", actorId,)
            .executeTakeFirst();

          if (existing) {
            await database
              .updateTable("message_seen",)
              .set({
                state: effectiveState,
                seen_at: effectiveState === "seen" || effectiveState === "processing" ? now : null,
              },)
              .where("message_id", "=", messageId,)
              .where("actor_id", "=", actorId,)
              .execute();
          } else {
            await database
              .insertInto("message_seen",)
              .values({
                id: `ms-${messageId}-${actorId}`,
                message_id: messageId,
                actor_id: actorId,
                state: effectiveState,
                seen_at: effectiveState === "seen" || effectiveState === "processing" ? now : null,
                created_at: now,
              },)
              .execute();
          }

          return jsonResponse({ ok: true, state: effectiveState, },);
        },
        {
          params: t.Object({ id: t.String(), },),
          body: t.Object({ actorId: t.String(), state: t.Optional(t.String(),), },),
          response: {
            200: SuccessResponse,
            401: ErrorResponse,
            400: ErrorResponse,
          },
          detail: {
            summary: "Record or clear seen-state for an actor on a message",
            description:
              "Adds a seen state for an actor. Set state='unseen' to clear/reset. Defaults to 'seen'. Returns the effective state.",
            tags: ["Messages", "Seen",],
          },
        },
      )
      // DELETE /api/messages/:id/seen — remove actor's seen record
      .delete(
        `${prefix}/messages/:id/seen`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const { userRole, } = extractAuth(ctx,);
          const messageId = ctx.params.id;
          const { actorId, } = ctx.query as { actorId: string };

          if (!actorId || typeof actorId !== "string") {
            return Response.json({ error: "actorId is required", }, { status: 400, },);
          }

          const chatId = await resolveMessageAccess(database, messageId, userId, userRole,);
          if (typeof chatId !== "string") { return chatId; }

          await database
            .deleteFrom("message_seen",)
            .where("message_id", "=", messageId,)
            .where("actor_id", "=", actorId,)
            .execute();

          return jsonResponse({ ok: true, },);
        },
        {
          params: t.Object({ id: t.String(), },),
          query: t.Object({ actorId: t.String(), },),
          response: {
            200: SuccessResponse,
            401: ErrorResponse,
            400: ErrorResponse,
          },
          detail: {
            summary: "Remove actor's seen record from a message",
            description: "Deletes the seen-state ledger row for the specified actor on the message.",
            tags: ["Messages", "Seen",],
          },
        },
      )
  );
}
