// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /api/agency/spend — POST endpoint that debits story points for the
 * calling actor. Mounted from `src/routes/agency/index.ts` and registered
 * via `register-plugins.ts`.
 *
 * Body: { actor_id: string, amount: number, reason?: string, world_id?: string|null }
 * Response: StoryPointLedger JSON (or 400 on insufficient / invalid amount).
 */
import { Elysia, t, } from "elysia";
import {
  InsufficientStoryPointsError,
  InvalidAmountError,
  spendStoryPoints,
} from "../../services/agency/story-points";
import { jsonError, jsonResponse, } from "../http-utils";

export function agencySpendRoute(
  opts: { database: import("kysely").Kysely<import("../../db/schema").DB> },
  prefix = "/api",
) {
  const { database, } = opts;
  return new Elysia({ name: "agency-spend", },)
    .post(
      `${prefix}/agency/spend`,
      async (ctx: any,) => {
        const body = ctx.body as { actor_id?: string; amount?: number; reason?: string; world_id?: string | null };
        if (!body.actor_id || typeof body.actor_id !== "string") {
          return jsonError({ message: "actor_id is required", status: 400, },);
        }
        if (typeof body.amount !== "number" || !Number.isInteger(body.amount,)) {
          return jsonError({ message: "amount must be a positive integer", status: 400, },);
        }
        try {
          const ledger = await spendStoryPoints(database, {
            actorId: body.actor_id,
            worldId: body.world_id ?? null,
            amount: body.amount,
            reason: body.reason ?? null,
          },);
          return jsonResponse(ledger,);
        } catch (err) {
          if (err instanceof InsufficientStoryPointsError) {
            return jsonError({
              message: `Not enough story points (have ${err.available}, need ${err.requested})`,
              status: 400,
            },);
          }
          if (err instanceof InvalidAmountError) {
            return jsonError({ message: "amount must be a positive integer", status: 400, },);
          }
          const msg = err instanceof Error ? err.message : String(err,);
          return jsonError({ message: `spend failed: ${msg}`, status: 500, },);
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
          summary: "Debit story points from an actor",
          description: "Spend story points — used by the chat composer chip and reroll flows.",
          tags: ["Agency",],
        },
      },
    );
}
