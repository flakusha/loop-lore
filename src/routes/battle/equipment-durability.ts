// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle Equipment Durability Routes (IS7)
 *
 * Wires combat-action equipment usage + durability degradation into the live
 * inventory. The pure engine (`applyDurabilityDamage` in src/battle) computes
 * the new durability; this route applies it to the actor's equipped items and
 * persists the result back to `actor_items`.
 *
 *   POST /api/battle/equipment/combat-use  — { actorId, damage? }
 *        degrade every equipped item by `damage` (default 10) and persist.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { applyDurabilityDamage, toEquipmentItem, } from "../../battle";
import { EquipState, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { jsonParseOr, } from "../../utils/safe-json";
import { ErrorResponse, Id, } from "../../validation/schemas";
import { jsonResponse, notFoundResponse, } from "../http-utils";
import { requireUserId, } from "../http-utils/responses";
import type { HandlerOpts, } from "./types";

/**
 * Ensure the user owns the given actor. Returns a denial Response or null.
 * @param db
 * @param actorId
 * @param userId
 */
async function resolveActorAccess(
  db: Kysely<DB>,
  actorId: string,
  userId: string,
): Promise<Response | null> {
  const actor = await db.selectFrom("actors",).select("user_id",).where("id", "=", actorId,).executeTakeFirst();
  if (!actor) { return notFoundResponse("Actor",); }
  if (actor.user_id !== userId) { return jsonResponse({ error: "Not allowed", }, 403,); }
  return null;
}

/**
 * Apply `damage` to every equipped item an actor owns and persist it.
 * @param db
 * @param actorId
 * @param damage
 */
async function degradeActorEquipment(
  db: Kysely<DB>,
  actorId: string,
  damage: number,
): Promise<{ id: string; name: string; durability: number; maxDurability: number; broken: boolean }[]> {
  const rows = await db.selectFrom("actor_items",)
    .selectAll()
    .where("actor_id", "=", actorId,)
    .where("equipped", "=", EquipState.Equipped,)
    .execute();

  const updated: { id: string; name: string; durability: number; maxDurability: number; broken: boolean }[] = [];
  for (const row of rows) {
    const item = toEquipmentItem({
      id: row.id,
      name: row.name,
      description: row.description ?? "",
      category: row.item_type,
      rarity: "common",
      properties: jsonParseOr<Record<string, unknown>>(row.metadata ?? "{}", {},),
    },);
    item.durability = row.durability ?? 100;
    item.maxDurability = row.max_durability ?? 100;
    item.equipped = true;

    const degraded = applyDurabilityDamage(item, damage,);
    await db.updateTable("actor_items",)
      .set({ durability: degraded.durability, },)
      .where("id", "=", row.id,)
      .execute();

    updated.push({
      id: row.id,
      name: row.name,
      durability: degraded.durability,
      maxDurability: degraded.maxDurability,
      broken: degraded.durability <= 0,
    },);
  }
  return updated;
}

/**
 * @param opts
 * @param prefix
 */
export function battleEquipmentDurabilityRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  return new Elysia({ name: "battle-equipment-durability", },)
    .post(
      `${prefix}/battle/equipment/combat-use`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const body = ctx.body as { actorId: string; damage?: number };
        const denied = await resolveActorAccess(database, body.actorId, userId,);
        if (denied) { return denied; }
        const damage = typeof body.damage === "number" && body.damage >= 0 ? body.damage : 10;
        const items = await degradeActorEquipment(database, body.actorId, damage,);
        return jsonResponse({ items, },);
      },
      {
        body: t.Object({
          actorId: Id,
          damage: t.Optional(t.Integer({ minimum: 0, },),),
        },),
        response: {
          200: t.Object({
            items: t.Array(t.Object({
              id: Id,
              name: t.String(),
              durability: t.Integer(),
              maxDurability: t.Integer(),
              broken: t.Boolean(),
            },),),
          },),
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Apply combat equipment durability degradation",
          description: "Degrade an actor's equipped items by a combat action's damage and persist.",
          tags: ["Battle", "Equipment",],
        },
      },
    );
}
