// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /api/agency/balance — read the calling actor's story-point balance.
 *
 * Backs the story-points chip in the chat composer. `world_id` is optional:
 * omit it for the cross-world global balance, pass the active chat's world to
 * read that world's per-world balance. Auth-scoped like `/spend` — the actor
 * is always the session user, never a client-supplied id.
 */
import { Elysia, t, } from "elysia";
import { getStoryPointBalance, } from "../../services/agency/story-points";
import { jsonResponse, requireUserId, } from "../http-utils";

export function agencyBalanceRoute(
  opts: { database: import("kysely").Kysely<import("../../db/schema").DB> },
  prefix = "/api",
) {
  const { database, } = opts;
  return new Elysia({ name: "agency-balance", },)
    .get(
      `${prefix}/agency/balance`,
      async (ctx: any,) => {
        const authUserId = requireUserId(ctx,);
        if (typeof authUserId !== "string") { return authUserId; }
        const worldId = (ctx.query as { world_id?: string | null } | null)?.world_id ?? null;
        const balance = await getStoryPointBalance(database, authUserId, worldId,);
        return jsonResponse({
          actor_id: balance.actor_id,
          world_id: balance.world_id,
          balance: balance.balance,
          cap: balance.cap,
        },);
      },
      {
        query: t.Object({
          world_id: t.Optional(t.String(),),
        },),
        detail: {
          summary: "Read an actor's story point balance",
          description: "Story point balance for the chat composer chip.",
          tags: ["Agency",],
        },
      },
    );
}
