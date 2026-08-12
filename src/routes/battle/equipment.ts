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
import { SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, } from "../http-utils";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

export function equipmentRoutes(opts: HandlerOpts,) {
  const { database, } = opts;
  return new Elysia({ name: "battle-equipment", },)
    .post(
      "/api/battle/equipment/calculate",
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
      "/api/battle/equipment/calculate-from-items",
      async (ctx: any,) => {
        try {
          const body = ctx.body as { itemIds: string[]; equipped?: Record<string, boolean> };
          if (!Array.isArray(body.itemIds,) || body.itemIds.length === 0) {
            return jsonError("itemIds must be a non-empty array", 400,);
          }
          const rows = await database
            .selectFrom("items")
            .select(["id", "name", "description", "category", "rarity", "properties",])
            .where("id", "in", body.itemIds,)
            .execute();
          const byId = new Map(rows.map(r => [r.id, r,],));
          const equipment: EquipmentItem[] = Array.from(body.itemIds, (id,) => {
            const row = byId.get(id,);
            if (!row) { return null; }
            const item = toEquipmentItem({
              id: row.id,
              name: row.name,
              description: row.description ?? "",
              category: row.category,
              rarity: row.rarity,
              properties: (() => {
                try { return JSON.parse(row.properties,); } catch { return {}; }
              })(),
            },);
            if (body.equipped?.[id]) { item.equipped = true; }
            return item;
          },).filter((i): i is EquipmentItem => i !== null,);
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
      "/api/battle/equipment/can-equip",
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
      "/api/battle/equipment/durability",
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
      "/api/battle/equipment/repair",
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
      "/api/battle/equipment/loot",
      (ctx: any,) => {
        try {
          const body = ctx.body as {
            lootTable: LootTableEntry[];
            monsterLevel: number;
          };
          const loot = generateLoot(body.lootTable, body.monsterLevel,);
          return jsonResponse(loot,);
        } catch (error) {
          log().error("Failed to generate loot", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Generate loot from table",
          description: "Roll loot drops based on monster level and loot table.",
          tags: ["Battle",],
        },
      },
    );
}
