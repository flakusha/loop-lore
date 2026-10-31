// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /api/v1/agency/earn — POST endpoint that credits story points to the
 * calling actor. Mounted from `src/routes/agency/index.ts` and registered
 * via the v1 barrel (`src/routes/v1/standalone-surface.ts`).
 *
 * Body: { actor_id: string, amount: number, reason?: string, world_id?: string|null }
 * Response: StoryPointLedger JSON (or 400 on cap exceeded / invalid amount).
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import {
  CapExceededError,
  earnStoryPoints,
  InvalidAmountError,
} from "../../services/agency/story-points";
import {
  forbiddenResponse,
  jsonError,
  jsonResponse,
  requireUserId,
} from "../http-utils";

/** POST /api/v1/agency/earn — credit story points to the authenticated actor. */
export function agencyEarnRoute(
  opts: { database: Kysely<DB> },
  prefix = "/api/v1",
) {
  const { database, } = opts;
  return new Elysia({ name: "agency-earn", },)
    .post(
      `${prefix}/agency/earn`,
      async (ctx,) => {
        // actor_id and amount are already narrowed by the t.Object schema below
        // (t.String({minLength:1}) / t.Integer({minimum:1})) — Elysia rejects a
        // malformed body with 422 before this handler runs, so only the authz
        // checks live here.
        // Authz: the calling session must own the actor whose story points
        // are being credited. Without this, a client could credit any actor's
        // balance by supplying a foreign actor_id.
        const authUserId = requireUserId(ctx,);
        if (typeof authUserId !== "string") { return authUserId; }
        if (ctx.body.actor_id !== authUserId) {
          return forbiddenResponse("actor_id must match the authenticated session",);
        }

        try {
          const ledger = await earnStoryPoints(database, {
            actorId: ctx.body.actor_id,
            worldId: ctx.body.world_id ?? null,
            amount: ctx.body.amount,
            reason: ctx.body.reason ?? null,
          },);

          return jsonResponse(ledger,);
        } catch (err) {
          if (err instanceof CapExceededError) {
            return jsonError({
              message: `Story point cap exceeded (cap ${err.cap}, attempted +${err.attempted})`,
              status: 400,
            },);
          }

          if (err instanceof InvalidAmountError) {
            return jsonError({ message: err.message, status: 400, },);
          }

          const msg = err instanceof Error ? err.message : String(err,);
          return jsonError({ message: `earn failed: ${msg}`, status: 500, },);
        }
      },
      {
        body: t.Object({
          actor_id: t.String({ minLength: 1, },),
          amount: t.Integer({ minimum: 1, },),
          reason: t.Optional(t.String(),),
          world_id: t.Optional(t.Union([t.String(), t.Null(),],),),
        },),
        detail: {
          summary: "Credit story points to an actor",
          description: "Earn story points — awards story points for narrative beats and rewards.",
          tags: ["Agency",],
        },
      },
    );
}
