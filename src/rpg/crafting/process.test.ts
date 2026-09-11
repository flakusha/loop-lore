// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `CraftingProcessService` (craft attempts against a real test DB).
 *
 * Covers: successful craft (consume → produce → record), critical success,
 * failure (no output, attempt recorded), station gating (required / unknown /
 * inactive / type mismatch), material saving on failure, insufficient
 * materials with rollback, exact-quantity row deletion, output stacking
 * across attempts, and attempt read-back (`getAttempt` / `listAttempts`).
 *
 * `Math.random` is pinned per test so rolls are deterministic.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { CraftingAttemptStatus, } from "../../db/enums";
import { CraftingStationType, } from "../../db/enums-crafting";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActorItems,
  insertActors,
  insertCraftingAttempts,
  insertCraftingStationDefs,
  insertCraftingStationInstances,
  insertItems,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { CraftingProcessService, } from "./process";

/** Run `fn` with `Math.random` pinned to `value`. */
async function withRandom<T,>(value: number, fn: () => Promise<T>,): Promise<T> {
  const orig = Math.random;
  Math.random = () => value;
  try {
    return await fn();
  } finally {
    Math.random = orig;
  }
}

interface Seed {
  db: Kysely<DB>;
  userId: string;
  actorId: string;
  worldId: string;
  recipeId: string;
  materialItemId: string;
  outputItemId: string;
}

interface SeedOpts {
  oreQuantity?: number;
  baseSuccessChance?: number;
  baseQualityMin?: number;
  baseQualityMax?: number;
  perfectThreshold?: number;
  materialQuantity?: number;
  stationTypeRequired?: CraftingStationType | null;
}

/** Seed user → world → actor → material/output items → recipe → stock. */
async function seed(opts: SeedOpts = {},): Promise<Seed> {
  const { db, } = await createTestDb();
  const userId = uid();
  await insertUsers(db, `user-${userId}`, "Crafter", {
    id: userId,
    role: "solo",
    status: "active",
    settings: "{}",
  } as never,);
  const worldId = uid();
  await insertWorlds(db, userId, "Craft World", { id: worldId, } as never,);
  const actorId = uid();
  await insertActors(db, "Crafter", { id: actorId, user_id: userId, } as never,);
  const materialItemId = uid();
  const outputItemId = uid();
  await insertItems(db, worldId, "Ore", "consumable", { id: materialItemId, } as never,);
  await insertItems(db, worldId, "Ingot", "material", { id: outputItemId, } as never,);
  const recipeId = uid();
  const now = new Date().toISOString();
  await db.insertInto("crafting_recipes",).values({
    id: recipeId,
    world_id: worldId,
    name: "Smelt Ingot",
    description: null,
    discipline: "smithing",
    tier: 1,
    level_required: 1,
    output_item_id: outputItemId,
    output_quantity: 1,
    crafting_time_seconds: 1,
    base_success_chance: opts.baseSuccessChance ?? 1,
    base_quality_min: opts.baseQualityMin ?? 1,
    base_quality_max: opts.baseQualityMax ?? 10,
    perfect_threshold: opts.perfectThreshold ?? 100,
    station_type_required: opts.stationTypeRequired ?? null,
    discovered_by_default: 1,
    tags: "[]",
    created_at: now,
    updated_at: now,
  },).execute();
  await db.insertInto("crafting_recipe_materials",).values({
    id: uid(),
    recipe_id: recipeId,
    item_id: materialItemId,
    quantity: opts.materialQuantity ?? 2,
    slot_type: "required",
    quality_requirement: null,
    bonus_effect: null,
    sort_order: 1,
    created_at: now,
  },).execute();
  await insertActorItems(db, actorId, "Ore", "consumable", {
    quantity: opts.oreQuantity ?? 10,
  } as never,);
  return { db, userId, actorId, worldId, recipeId, materialItemId, outputItemId, };
}

/** Read an actor's quantity of a named item (0 when absent). */
async function stockOf(db: Kysely<DB>, actorId: string, name: string,): Promise<number> {
  const row = await db.selectFrom("actor_items",).select("quantity",)
    .where("actor_id", "=", actorId,).where("name", "=", name,)
    .executeTakeFirst();
  return row?.quantity ?? 0;
}

describe("attemptCraft", () => {
  test("success consumes materials, produces output, records the attempt", async () => {
    const s = await seed();
    try {
      const svc = new CraftingProcessService(s.db,);
      const result = await withRandom(0, () =>
        svc.attemptCraft({ actorId: s.actorId, worldId: s.worldId, recipeId: s.recipeId, },),
      );
      expect(result.status,).toBe(CraftingAttemptStatus.Success,);
      expect(result.quality,).toBe(1,);
      expect(result.outputItemId,).toBe(s.outputItemId,);
      expect(result.outputQuantity,).toBe(1,);
      expect(result.materialsConsumed,).toEqual([{ itemId: s.materialItemId, quantity: 2, },]);
      expect(result.materialsSaved,).toEqual([],);
      expect(await stockOf(s.db, s.actorId, "Ore",),).toBe(8,);
      expect(await stockOf(s.db, s.actorId, "Ingot",),).toBe(1,);
      const stored = await svc.getAttempt(result.attemptId,);
      expect(stored?.status,).toBe(CraftingAttemptStatus.Success,);
      expect(stored?.materialsUsed,).toEqual([{ itemId: s.materialItemId, quantity: 2, },]);
    } finally {
      await s.db.destroy();
    }
  });

  test("critical success when quality meets the perfect threshold", async () => {
    const s = await seed({ baseQualityMin: 10, baseQualityMax: 10, perfectThreshold: 10, },);
    try {
      const svc = new CraftingProcessService(s.db,);
      const result = await withRandom(0, () =>
        svc.attemptCraft({ actorId: s.actorId, worldId: s.worldId, recipeId: s.recipeId, },),
      );
      expect(result.status,).toBe(CraftingAttemptStatus.CriticalSuccess,);
      expect(result.quality,).toBe(10,);
    } finally {
      await s.db.destroy();
    }
  });

  test("failure consumes materials but yields no output", async () => {
    const s = await seed({ baseSuccessChance: 0, },);
    try {
      const svc = new CraftingProcessService(s.db,);
      const result = await withRandom(0.99, () =>
        svc.attemptCraft({ actorId: s.actorId, worldId: s.worldId, recipeId: s.recipeId, },),
      );
      expect(result.status,).toBe(CraftingAttemptStatus.Failure,);
      expect(result.quality,).toBe(0,);
      expect(result.outputItemId,).toBeNull();
      expect(result.materialsConsumed,).toEqual([{ itemId: s.materialItemId, quantity: 2, },]);
      expect(result.materialsSaved,).toEqual([],);
      expect(await stockOf(s.db, s.actorId, "Ore",),).toBe(8,);
      expect(await stockOf(s.db, s.actorId, "Ingot",),).toBe(0,);
      // The failed attempt itself is recorded with its consumed materials.
      const stored = await svc.getAttempt(result.attemptId,);
      expect(stored?.status,).toBe(CraftingAttemptStatus.Failure,);
      expect(stored?.materialsUsed,).toEqual([{ itemId: s.materialItemId, quantity: 2, },]);
      expect(stored?.outputItemId,).toBeNull();
    } finally {
      await s.db.destroy();
    }
  });

  test("output stacks across attempts via upsert", async () => {
    const s = await seed();
    try {
      const svc = new CraftingProcessService(s.db,);
      const opts = { actorId: s.actorId, worldId: s.worldId, recipeId: s.recipeId, };
      await withRandom(0, () => svc.attemptCraft(opts,),);
      await withRandom(0, () => svc.attemptCraft(opts,),);
      expect(await stockOf(s.db, s.actorId, "Ingot",),).toBe(2,);
      // Both attempts were recorded, not just the stock movement.
      const attempts = await svc.listAttempts(s.actorId, s.worldId,);
      expect(attempts.length,).toBe(2,);
      expect(attempts.map((a,) => a.status,),).toEqual([
        CraftingAttemptStatus.Success,
        CraftingAttemptStatus.Success,
      ],);
    } finally {
      await s.db.destroy();
    }
  });

  test("exact-quantity consumption deletes the inventory row", async () => {
    const s = await seed({ oreQuantity: 2, },);
    try {
      const svc = new CraftingProcessService(s.db,);
      await withRandom(0, () =>
        svc.attemptCraft({ actorId: s.actorId, worldId: s.worldId, recipeId: s.recipeId, },),
      );
      const rows = await s.db.selectFrom("actor_items",).select("id",)
        .where("actor_id", "=", s.actorId,).where("name", "=", "Ore",)
        .execute();
      expect(rows,).toEqual([],);
    } finally {
      await s.db.destroy();
    }
  });

  test("unknown recipe throws", async () => {
    const s = await seed();
    try {
      const svc = new CraftingProcessService(s.db,);
      await expect(
        svc.attemptCraft({ actorId: s.actorId, worldId: s.worldId, recipeId: uid(), },),
      ).rejects.toThrow(/Recipe not found/,);
    } finally {
      await s.db.destroy();
    }
  });

  test("insufficient materials throws and rolls back (no attempt recorded)", async () => {
    const s = await seed({ oreQuantity: 1, },);
    try {
      const svc = new CraftingProcessService(s.db,);
      await expect(
        withRandom(0, () =>
          svc.attemptCraft({ actorId: s.actorId, worldId: s.worldId, recipeId: s.recipeId, },),
        ),
      ).rejects.toThrow(/Insufficient Ore: need 2/,);
      expect(await svc.listAttempts(s.actorId, s.worldId,),).toEqual([],);
      expect(await stockOf(s.db, s.actorId, "Ore",),).toBe(1,);
    } finally {
      await s.db.destroy();
    }
  });
});

describe("attemptCraft with stations", () => {
  /** Seed a recipe requiring an anvil plus a matching active instance. */
  async function seedWithStation(overrides: {
    instanceActive?: number;
    defType?: CraftingStationType;
    materialSavingChance?: number;
  } = {},): Promise<Seed & { stationInstanceId: string }> {
    const s = await seed({
      baseSuccessChance: 0,
      stationTypeRequired: CraftingStationType.Anvil,
    },);
    const now = new Date().toISOString();
    const defId = uid();
    await insertCraftingStationDefs(s.db, s.worldId, "Anvil", CraftingStationType.Anvil, now, now, {
      id: defId,
      station_type: overrides.defType ?? CraftingStationType.Anvil,
      material_saving_chance: overrides.materialSavingChance ?? 0,
    } as never,);
    const stationInstanceId = uid();
    await insertCraftingStationInstances(s.db, defId, s.worldId, 100, now, now, {
      id: stationInstanceId,
      is_active: overrides.instanceActive ?? 1,
    } as never,);
    return { ...s, stationInstanceId, };
  }

  test("station required but none provided throws", async () => {
    const s = await seed({ stationTypeRequired: CraftingStationType.Anvil, },);
    try {
      const svc = new CraftingProcessService(s.db,);
      await expect(
        svc.attemptCraft({ actorId: s.actorId, worldId: s.worldId, recipeId: s.recipeId, },),
      ).rejects.toThrow(/Station required but none provided/,);
    } finally {
      await s.db.destroy();
    }
  });

  test("unknown station instance throws", async () => {
    const s = await seed({ stationTypeRequired: CraftingStationType.Anvil, },);
    try {
      const svc = new CraftingProcessService(s.db,);
      await expect(
        svc.attemptCraft({
          actorId: s.actorId,
          worldId: s.worldId,
          recipeId: s.recipeId,
          stationInstanceId: uid(),
        },),
      ).rejects.toThrow(/Station not found/,);
    } finally {
      await s.db.destroy();
    }
  });

  test("inactive station throws", async () => {
    const s = await seedWithStation({ instanceActive: 0, },);
    try {
      const svc = new CraftingProcessService(s.db,);
      await expect(
        svc.attemptCraft({
          actorId: s.actorId,
          worldId: s.worldId,
          recipeId: s.recipeId,
          stationInstanceId: s.stationInstanceId,
        },),
      ).rejects.toThrow(/Station is not active/,);
    } finally {
      await s.db.destroy();
    }
  });

  test("station type mismatch throws", async () => {
    const s = await seedWithStation({ defType: CraftingStationType.Forge, },);
    try {
      const svc = new CraftingProcessService(s.db,);
      await expect(
        svc.attemptCraft({
          actorId: s.actorId,
          worldId: s.worldId,
          recipeId: s.recipeId,
          stationInstanceId: s.stationInstanceId,
        },),
      ).rejects.toThrow(/Station type mismatch: need anvil/,);
    } finally {
      await s.db.destroy();
    }
  });

  test("failed craft at a saving station refunds half materials", async () => {
    const s = await seedWithStation({ materialSavingChance: 1, },);
    try {
      const svc = new CraftingProcessService(s.db,);
      const result = await withRandom(0, () =>
        svc.attemptCraft({
          actorId: s.actorId,
          worldId: s.worldId,
          recipeId: s.recipeId,
          stationInstanceId: s.stationInstanceId,
        },),
      );
      expect(result.status,).toBe(CraftingAttemptStatus.Failure,);
      expect(result.materialsSaved,).toEqual([{ itemId: s.materialItemId, quantity: 1, },]);
      // 10 - 2 consumed + 1 refunded.
      expect(await stockOf(s.db, s.actorId, "Ore",),).toBe(9,);
    } finally {
      await s.db.destroy();
    }
  });
});

describe("getAttempt / listAttempts", () => {
  test("getAttempt maps the row and returns null when missing", async () => {
    const s = await seed();
    try {
      const svc = new CraftingProcessService(s.db,);
      const result = await withRandom(0, () =>
        svc.attemptCraft({ actorId: s.actorId, worldId: s.worldId, recipeId: s.recipeId, },),
      );
      const stored = await svc.getAttempt(result.attemptId,);
      expect(stored,).toMatchObject({
        id: result.attemptId,
        actorId: s.actorId,
        worldId: s.worldId,
        recipeId: s.recipeId,
        stationInstanceId: null,
        status: CraftingAttemptStatus.Success,
        qualityAchieved: 1,
        outputItemId: s.outputItemId,
        outputQuantity: 1,
        experienceGained: 0,
        skillIncrease: 0,
        bonusEffects: "{}",
      },);
      expect(typeof stored?.createdAt,).toBe("string",);
      expect(await svc.getAttempt(uid(),),).toBeNull();
    } finally {
      await s.db.destroy();
    }
  });

  test("listAttempts filters by actor and world, newest first", async () => {
    const s = await seed();
    try {
      const svc = new CraftingProcessService(s.db,);
      const otherActor = uid();
      const otherWorld = uid();
      await insertCraftingAttempts(s.db, s.actorId, s.worldId, s.recipeId, CraftingAttemptStatus.Success, "2026-01-01T00:00:00.000Z", {
        materials_used: "[]",
      } as never,);
      await insertCraftingAttempts(s.db, s.actorId, s.worldId, s.recipeId, CraftingAttemptStatus.Failure, "2026-06-01T00:00:00.000Z", {
        materials_used: "[]",
      } as never,);
      await insertActors(s.db, "Other", { id: otherActor, user_id: null, } as never,);
      await insertCraftingAttempts(s.db, otherActor, s.worldId, s.recipeId, CraftingAttemptStatus.Success, "2026-03-01T00:00:00.000Z", {
        materials_used: "[]",
      } as never,);
      await insertWorlds(s.db, s.userId, "Other World", { id: otherWorld, } as never,);
      await insertCraftingAttempts(s.db, s.actorId, otherWorld, s.recipeId, CraftingAttemptStatus.Success, "2026-04-01T00:00:00.000Z", {
        materials_used: "[]",
      } as never,);
      const rows = await svc.listAttempts(s.actorId, s.worldId,);
      expect(rows.map((r,) => r.createdAt,),).toEqual([
        "2026-06-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
      ],);
      expect(rows[0]?.materialsUsed,).toEqual([],);
    } finally {
      await s.db.destroy();
    }
  });
});
