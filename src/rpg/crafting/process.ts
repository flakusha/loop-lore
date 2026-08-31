// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { CraftingAttemptStatus, EquipState, } from "../../db/enums";
import type { ItemCategory, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { jsonParseOr, jsonStringifyOr, uid, } from "../../utils";
import type {
  CraftAttempt,
  CraftAttemptOpts,
  CraftResult,
  ItemDef,
  MaterialRecord,
  StationBonuses,
} from "./types";

export type {
  CraftAttempt,
  CraftAttemptOpts,
  CraftResult,
  MaterialRecord,
} from "./types";

/**
 * Find or merge quantity into an actor's inventory.
 * @param trx
 * @param actorId
 * @param item
 * @param qty
 */
async function upsertActorItem(
  trx: Kysely<DB>,
  actorId: string,
  item: ItemDef,
  qty: number,
): Promise<void> {
  const ex = await trx.selectFrom("actor_items",)
    .select(["id", "quantity",],)
    .where("actor_id", "=", actorId,).where("name", "=", item.name,)
    .executeTakeFirst();
  if (ex) {
    await trx.updateTable("actor_items",)
      .set({ quantity: ex.quantity + qty, },).where("id", "=", ex.id,).execute();
  } else {
    await trx.insertInto("actor_items",).values({
      id: uid(),
      actor_id: actorId,
      name: item.name,
      description: item.description,
      item_type: item.category,
      quantity: qty,
      value: item.value,
      weight: item.weight,
      equipped: EquipState.Unequipped,
    },).execute();
  }
}

/**
 * Map a crafting_attempts row to CraftAttempt.
 * @param r
 * @param r.id
 * @param r.actor_id
 * @param r.world_id
 * @param r.recipe_id
 * @param r.station_instance_id
 * @param r.materials_used
 * @param r.status
 * @param r.quality_achieved
 * @param r.output_item_id
 * @param r.output_quantity
 * @param r.experience_gained
 * @param r.skill_increase
 * @param r.bonus_effects
 * @param r.created_at
 */
function toCraftAttempt(r: {
  id: string;
  actor_id: string;
  world_id: string;
  recipe_id: string;
  station_instance_id: string | null;
  materials_used: string;
  status: CraftingAttemptStatus;
  quality_achieved: number;
  output_item_id: string | null;
  output_quantity: number;
  experience_gained: number;
  skill_increase: number;
  bonus_effects: string;
  created_at: string;
},): CraftAttempt {
  return {
    id: r.id,
    actorId: r.actor_id,
    worldId: r.world_id,
    recipeId: r.recipe_id,
    stationInstanceId: r.station_instance_id,
    materialsUsed: jsonParseOr<MaterialRecord[]>(r.materials_used, [],),
    status: r.status,
    qualityAchieved: r.quality_achieved,
    outputItemId: r.output_item_id,
    outputQuantity: r.output_quantity,
    experienceGained: r.experience_gained,
    skillIncrease: r.skill_increase,
    bonusEffects: r.bonus_effects,
    createdAt: r.created_at,
  };
}
/** Crafting process — attempt, consume materials, roll, produce output. */
export class CraftingProcessService {
  private readonly db: Kysely<DB>;
  /**
   * @param db
   */
  constructor(db: Kysely<DB>,) {
    this.db = db;
  }
  /**
   * @param opts
   */
  async attemptCraft(opts: CraftAttemptOpts,): Promise<CraftResult> {
    const recipe = await this.db.selectFrom("crafting_recipes",).selectAll()
      .where("id", "=", opts.recipeId,).executeTakeFirst();
    if (!recipe) { throw new Error(`Recipe not found: ${opts.recipeId}`,); }
    const matRows = await this.db.selectFrom("crafting_recipe_materials",)
      .selectAll().where("recipe_id", "=", opts.recipeId,).execute();
    const itemIds: string[] = Array.from(matRows, m => m.item_id,);
    const defs = itemIds.length > 0
      ? await this.db.selectFrom("items",).selectAll().where("id", "in", itemIds,).execute()
      : [];
    const defMap = new Map<
      string,
      { name: string; description: string | null; category: ItemCategory; value: number; weight: number }
    >();
    for (const d of defs) {
      defMap.set(d.id, {
        name: d.name,
        description: d.description,
        category: d.category,
        value: d.value,
        weight: d.weight,
      },);
    }
    // Validate station if required
    let station: StationBonuses | null = null;
    if (recipe.station_type_required) {
      if (!opts.stationInstanceId) {
        throw new Error("Station required but none provided",);
      }
      const si = await this.db.selectFrom("crafting_station_instances",)
        .innerJoin("crafting_station_defs", "crafting_station_defs.id", "crafting_station_instances.station_def_id",)
        .select([
          "crafting_station_defs.success_bonus",
          "crafting_station_defs.quality_bonus",
          "crafting_station_defs.material_saving_chance",
          "crafting_station_defs.station_type",
          "crafting_station_instances.is_active",
        ],).where("crafting_station_instances.id", "=", opts.stationInstanceId,)
        .executeTakeFirst();
      if (!si) { throw new Error(`Station not found: ${opts.stationInstanceId}`,); }
      if (si.is_active !== 1) { throw new Error("Station is not active",); }
      if (si.station_type !== recipe.station_type_required) {
        throw new Error(`Station type mismatch: need ${recipe.station_type_required}`,);
      }
      station = {
        successBonus: si.success_bonus,
        qualityBonus: si.quality_bonus,
        materialSavingChance: si.material_saving_chance,
      };
    }
    // Transactional: validate → consume → roll → produce → record
    return this.db.transaction().execute(async (trx,) => {
      const consumed: MaterialRecord[] = [];
      for (const mat of matRows) {
        const def = defMap.get(mat.item_id,);
        if (!def) { throw new Error(`Item not found: ${mat.item_id}`,); }
        const ai = await trx.selectFrom("actor_items",)
          .select(["id", "quantity",],)
          .where("actor_id", "=", opts.actorId,).where("name", "=", def.name,)
          .executeTakeFirst();
        if (!ai || ai.quantity < mat.quantity) {
          throw new Error(`Insufficient ${def.name}: need ${mat.quantity}`,);
        }
        const rem = ai.quantity - mat.quantity;
        if (rem === 0) {
          await trx.deleteFrom("actor_items",).where("id", "=", ai.id,).execute();
        } else {
          await trx.updateTable("actor_items",).set({ quantity: rem, },)
            .where("id", "=", ai.id,).execute();
        }
        consumed.push({ itemId: mat.item_id, quantity: mat.quantity, },);
      }
      // Roll success
      const chance = Math.min(1, recipe.base_success_chance + (station?.successBonus ?? 0),);
      const success = Math.random() < chance;
      let status: CraftingAttemptStatus = CraftingAttemptStatus.Failure;
      let quality = 0;
      let outputItemId: string | null = null;
      let outputQuantity = 0;
      const saved: MaterialRecord[] = [];
      if (success) {
        const maxQ = recipe.base_quality_max + (station?.qualityBonus ?? 0);
        quality = Math.floor(Math.random() * (maxQ - recipe.base_quality_min + 1),) +
          recipe.base_quality_min;
        status = quality >= recipe.perfect_threshold
          ? CraftingAttemptStatus.CriticalSuccess
          : CraftingAttemptStatus.Success;
        const outDef = await trx.selectFrom("items",).selectAll()
          .where("id", "=", recipe.output_item_id,).executeTakeFirst();
        if (outDef) {
          outputItemId = outDef.id;
          outputQuantity = recipe.output_quantity;
          await upsertActorItem(trx, opts.actorId, {
            name: outDef.name,
            description: outDef.description,
            category: outDef.category,
            value: outDef.value,
            weight: outDef.weight,
          }, outputQuantity,);
        }
      } else {
        const saveChance = station?.materialSavingChance ?? 0;
        for (const mat of matRows) {
          if (Math.random() >= saveChance) {
            continue;
          }

          const sq = Math.floor(mat.quantity / 2,);
          if (sq > 0) {
            saved.push({ itemId: mat.item_id, quantity: sq, },);
            await upsertActorItem(trx, opts.actorId, defMap.get(mat.item_id,)!, sq,);
          }
        }
      }
      const attemptId = uid();
      await trx.insertInto("crafting_attempts",).values({
        id: attemptId,
        actor_id: opts.actorId,
        world_id: opts.worldId,
        recipe_id: opts.recipeId,
        station_instance_id: opts.stationInstanceId ?? null,
        materials_used: jsonStringifyOr(consumed,),
        status,
        quality_achieved: quality,
        output_item_id: outputItemId,
        output_quantity: outputQuantity,
        experience_gained: 0,
        skill_increase: 0,
        bonus_effects: "{}",
        duration_ms: 0,
        created_at: new Date().toISOString(),
      },).execute();
      return {
        attemptId,
        status,
        quality,
        outputItemId,
        outputQuantity,
        materialsConsumed: consumed,
        materialsSaved: saved,
      };
    },);
  }

  /**
   * @param id
   */
  async getAttempt(id: string,): Promise<CraftAttempt | null> {
    const r = await this.db.selectFrom("crafting_attempts",).selectAll()
      .where("id", "=", id,).executeTakeFirst();
    return r ? toCraftAttempt(r,) : null;
  }
  /**
   * @param actorId
   * @param worldId
   */
  async listAttempts(actorId: string, worldId: string,): Promise<CraftAttempt[]> {
    const rows = await this.db.selectFrom("crafting_attempts",).selectAll()
      .where("actor_id", "=", actorId,).where("world_id", "=", worldId,)
      .orderBy("created_at", "desc",).execute();
    return Array.from(rows, r => toCraftAttempt(r,),);
  }
}
