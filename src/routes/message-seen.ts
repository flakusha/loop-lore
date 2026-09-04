// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 300

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
import { type Kysely, sql, } from "kysely";
import type { DB, } from "../db/schema";
import { requireActorFromSession, } from "../middleware/scope-by-user";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { extractAuth, jsonResponse, requireUserId, } from "./http-utils";
import { authorizeActor, resolveMessageAccess, seenAtFor, } from "./message-seen-helpers";

interface HandlerOpts {
  database: Kysely<DB>;
}

/**
 * List grouped viewers for a message — seen/unseen + who is processing.
 *
 * Returns: { actorId, state ("unseen"|"processing"|"seen"), seenAt } for each
 * viewer (human or AI) with a recorded state on this message.
 * @param opts
 * @param prefix
 */
export function messageSeenRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  // Elysia t.Literal state union — strict enum enforcement (replaces the
  // permissive `t.Optional(t.String())` that accepted any string).
  const seenStateSchema = t.Union([
    t.Literal("unseen",),
    t.Literal("processing",),
    t.Literal("seen",),
  ],);

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

          // IDOR guard: the client-supplied actorId must belong to the session user.
          // Covers BOTH the reset branch (state==="unseen") and the record branch.
          const authz = await authorizeActor(database, userId, actorId,);
          if (authz) { return authz; }

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
          const now = seenAtFor(effectiveState,);

          // Atomic upsert backed by migration 072's unique index on
          // (message_id, actor_id). Replaces the previous select-then-insert
          // sequence that raced on concurrent POSTs for the same row.
          //
          // First-seen semantics: the UPDATE path does NOT touch seen_at, so
          // the original timestamp from the first INSERT is preserved across
          // re-marks. A subsequent "seen" → "processing" → "seen" cycle keeps
          // the timestamp from the actor's first "seen"/"processing" mark.
          await database
            .insertInto("message_seen",)
            .values({
              id: `ms-${messageId}-${actorId}`,
              message_id: messageId,
              actor_id: actorId,
              state: effectiveState,
              seen_at: now,
              created_at: sql`(datetime('now'))`,
            },)
            .onConflict((oc,) =>
              oc
                .columns(["message_id", "actor_id",],)
                .doUpdateSet({
                  // Preserve first-seen timestamp; only state changes on re-mark.
                  state: sql`excluded.state`,
                },)
            )
            .execute();

          return jsonResponse({ ok: true, state: effectiveState, },);
        },
        {
          params: t.Object({ id: t.String(), },),
          body: t.Object({ actorId: t.String(), state: t.Optional(seenStateSchema,), },),
          response: {
            200: SuccessResponse,
            401: ErrorResponse,
            400: ErrorResponse,
            403: ErrorResponse,
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
          // Resolve the session actor via the dedicated helper. On success
          // `actor.userId` is the validated session user; on failure the
          // helper returns the same 401 Response that `requireUserId`
          // produced, so the rejection semantics are unchanged.
          const actor = requireActorFromSession(ctx,);
          if (!("userId" in actor)) { return actor; }
          const { userId, } = actor;
          const { userRole, } = extractAuth(ctx,);
          const messageId = ctx.params.id;
          const { actorId, } = ctx.query as { actorId: string };

          // IDOR guard: must own the actor whose record is being deleted.
          const authz = await authorizeActor(database, userId, actorId,);
          if (authz) { return authz; }

          const chatId = await resolveMessageAccess(database, messageId, userId, userRole,);
          if (typeof chatId !== "string") { return chatId; }

          await database
            .deleteFrom("message_seen",)
            .where("message_id", "=", messageId,)
            .where(
              "actor_id",
              "in",
              database
                .selectFrom("actors",)
                .select("id",)
                .where("id", "=", actorId,)
                .where("user_id", "=", userId,),
            )
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
            403: ErrorResponse,
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
