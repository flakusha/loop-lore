// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import {
  applyDurabilityDamage,
  calculateEquipmentModifiers,
  canEquipItem,
  type CombatStats,
  type EquipmentItem,
  generateLoot,
  type LootTableEntry,
  repairItem,
  toEquipmentItem,
} from "../../battle";
import { ItemsService, } from "../../story/items";
import { jsonParseOr, } from "../../utils/safe-json";
import { SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { HttpStatus, } from "../http-utils/status";
import { assertWorldOwner, } from "../rpg/crafting-station-instances";
import { resolveActorAccess, } from "../actor-access";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 */
export function equipmentRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  return new Elysia({ name: "battle-equipment", },)
    .post(
      `${prefix}/battle/equipment/calculate`,
      (ctx: any,) => {
        try {
          const body = ctx.body as { items: EquipmentItem[] };
          const modifiers = calculateEquipmentModifiers(body.items,);
          return jsonResponse(modifiers,);
        } catch (error) {
          log().error("Failed to calculate equipment modifiers", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Calculate equipment modifiers",
          description: "Calculate stat modifiers from equipped items.",
          tags: ["Battle",],
        },
      },
    )
    .post(
      `${prefix}/battle/equipment/calculate-from-items`,
      async (ctx: any,) => {
        try {
          const body = ctx.body as { itemIds: string[]; equipped?: Record<string, boolean> };
          if (!Array.isArray(body.itemIds,) || body.itemIds.length === 0) {
            return jsonError("itemIds must be a non-empty array", 400,);
          }
          const rows = await database
            .selectFrom("items",)
            .select(["id", "name", "description", "category", "rarity", "properties",],)
            .where("id", "in", body.itemIds,)
            .execute();
          const byId = new Map<string, (typeof rows)[number]>();
          for (const row of rows) {
            byId.set(row.id, row,);
          }
          const equipment: EquipmentItem[] = [];
          for (const id of body.itemIds) {
            const row = byId.get(id,);
            if (!row) { continue; }
            const item = toEquipmentItem({
              id: row.id,
              name: row.name,
              description: row.description ?? "",
              category: row.category,
              rarity: row.rarity,
              properties: jsonParseOr<Record<string, unknown>>(row.properties, {},),
            },);
            if (body.equipped?.[id]) { item.equipped = true; }
            equipment.push(item,);
          }
          return jsonResponse(calculateEquipmentModifiers(equipment,),);
        } catch (error) {
          log().error("Failed to calculate modifiers from item IDs", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, 400: SuccessResponse, },
        detail: {
          summary: "Calculate modifiers from world item IDs",
          description: "Resolve world item definitions and compute equipment stat modifiers.",
          tags: ["Battle",],
        },
      },
    )
    .post(
      `${prefix}/battle/equipment/can-equip`,
      (ctx: any,) => {
        try {
          const body = ctx.body as {
            item: EquipmentItem;
            characterLevel: number;
            characterStats: CombatStats;
          };
          const result = canEquipItem(body.item, body.characterLevel, body.characterStats,);
          return jsonResponse(result,);
        } catch (error) {
          log().error("Failed to check equip eligibility", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Check if item can be equipped",
          description: "Check level and stat requirements for equipment.",
          tags: ["Battle",],
        },
      },
    )
    .post(
      `${prefix}/battle/equipment/durability`,
      (ctx: any,) => {
        try {
          const body = ctx.body as { item: EquipmentItem; damage: number };
          const updated = applyDurabilityDamage(body.item, body.damage,);
          return jsonResponse(updated,);
        } catch (error) {
          log().error("Failed to apply durability damage", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Apply durability damage",
          description: "Reduce item durability from combat usage.",
          tags: ["Battle",],
        },
      },
    )
    .post(
      `${prefix}/battle/equipment/repair`,
      (ctx: any,) => {
        try {
          const body = ctx.body as {
            item: EquipmentItem;
            repairAmount: number;
            goldCost: number;
          };
          const result = repairItem(body.item, body.repairAmount, body.goldCost,);
          return jsonResponse(result,);
        } catch (error) {
          log().error("Failed to repair item", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Repair item durability",
          description: "Restore item durability at a gold cost.",
          tags: ["Battle",],
        },
      },
    )
    .post(
      `${prefix}/battle/equipment/loot`,
      async (ctx: any,) => {
        try {
          const body = ctx.body as {
            lootTable: LootTableEntry[];
            monsterLevel: number;
            worldId: string;
            actorId?: string;
            locationId?: string;
          };
          const { lootTable, monsterLevel, worldId, actorId, locationId, } = body;
          const loot = generateLoot(lootTable, monsterLevel,);
          // Persistence path requires authentication and ownership proofs.
          // The non-persistence branch (no worldId, or no destination) needs
          // no guard — no row is written and the response is just the rolled
          // drops. BUG-battle-equipment-loot-no-auth-guard.
          if (!worldId || (!actorId && !locationId)) {
            return jsonResponse(loot,);
          }
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const deny = await assertWorldOwner(database, userId, worldId,);
          if (deny) { return deny; }
          if (actorId) {
            const denyActor = await resolveActorAccess(database, actorId, userId,);
            if (denyActor) { return denyActor; }
          } else if (locationId) {
            const location = await database.selectFrom("locations",)
              .select("world_id",)
              .where("id", "=", locationId,)
              .executeTakeFirst();
            if (!location) {
              return jsonError("Location not found", HttpStatus.NotFound,);
            }
            if (location.world_id !== worldId) {
              return jsonError("Location does not belong to world", HttpStatus.BadRequest,);
            }
            // worldId was already verified to be owned by the caller via
            // `assertWorldOwner`; the location's world_id match enforces
            // that the caller cannot drop loot into a foreign world by
            // mismatching the two ids.
          }
          // Persist drops that reference real item definitions.
          const items = new ItemsService(database,);
          const worldItemIds: string[] = [];
          for (const drop of loot) {
            const id = actorId
              ? await items.giveToNpc(drop.itemId, actorId, worldId, drop.quantity,)
              : await items.placeInLocation(drop.itemId, locationId!, worldId, drop.quantity,);
            worldItemIds.push(id,);
          }
          return jsonResponse({ loot, worldItemIds, },);
        } catch (error) {
          log().error("Failed to generate loot", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: {
          200: SuccessResponse,
          400: SuccessResponse,
          401: SuccessResponse,
          403: SuccessResponse,
          404: SuccessResponse,
        },
        detail: {
          summary: "Generate loot from table",
          description:
            "Roll loot drops based on monster level and loot table; persists instances when worldId + destination given.",
          tags: ["Battle",],
        },
      },
    );
}
