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
} from "../../battle";
import { SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, } from "../http-utils";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

export function equipmentRoutes(_opts: HandlerOpts,) {
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
