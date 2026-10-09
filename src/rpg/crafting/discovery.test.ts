// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for recipe discovery: `DiscoveryService` plus the craft-process
 * integration (discovery gating + experimentation) against a real test DB.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { CraftingAttemptStatus, DiscoveryMethod, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { registry, } from "../../plugins/registry";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActorItems,
  insertActors,
  insertCraftingRecipeMaterials,
  insertCraftingRecipes,
  insertItems,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import {
  DiscoveryService,
  emitRecipeDiscovered,
  getDiscovery,
  hasDiscovery,
  insertDiscovery,
} from "./discovery";
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
}

/** Seed user → world → actor → items → undiscovered-by-default recipe → stock. */
async function seed(
  opts: { discoveredByDefault?: number; successChance?: number } = {},
): Promise<Seed> {
  const { db, } = await createTestDb();
  const userId = uid();
  await insertUsers(db, `user-${userId}`, "Discoverer", {
    id: userId,
    role: "solo",
    status: "active",
    settings: "{}",
  } as never,);

  const worldId = uid();
  await insertWorlds(db, userId, "Discovery World", { id: worldId, } as never,);
  const actorId = uid();
  await insertActors(db, "Discoverer", { id: actorId, user_id: userId, } as never,);
  const materialItemId = uid();
  const outputItemId = uid();
  await insertItems(db, worldId, "Ore", "consumable", { id: materialItemId, } as never,);
  await insertItems(db, worldId, "Ingot", "material", { id: outputItemId, } as never,);

  const now = new Date().toISOString();
  const recipeId = await insertCraftingRecipes(
    db,
    worldId,
    "Smelt Ingot",
    "smithing",
    outputItemId,
    now,
    now,
    {
      base_success_chance: opts.successChance ?? 1,
      base_quality_min: 1,
      base_quality_max: 10,
      perfect_threshold: 100,
      discovered_by_default: opts.discoveredByDefault ?? 0,
    },
  );

  await insertCraftingRecipeMaterials(db, recipeId, materialItemId, now, { quantity: 2, },);
  await insertActorItems(db, actorId, "Ore", "consumable", { quantity: 10, } as never,);

  return { db, userId, actorId, worldId, recipeId, };
}

/** Count an actor's stocked quantity of a named item. */
async function stockOf(db: Kysely<DB>, actorId: string, name: string,): Promise<number> {
  const row = await db.selectFrom("actor_items",).select("quantity",)
    .where("actor_id", "=", actorId,).where("name", "=", name,)
    .executeTakeFirst();

  return row?.quantity ?? 0;
}

describe("DiscoveryService", () => {
  test("recordDiscovery stores a row and listDiscovered joins recipe info", async () => {
    const s = await seed();
    try {
      const svc = new DiscoveryService(s.db,);
      const { discovery, created, } = await svc.recordDiscovery({
        actorId: s.actorId,
        worldId: s.worldId,
        recipeId: s.recipeId,
        method: DiscoveryMethod.RecipeBook,
      },);

      expect(created,).toBe(true,);
      expect(discovery.discoveryMethod,).toBe("recipe_book",);
      expect(discovery.masteryLevel,).toBe(0,);

      const listed = await svc.listDiscovered(s.actorId, s.worldId,);
      expect(listed,).toHaveLength(1,);
      expect(listed[0]?.recipeName,).toBe("Smelt Ingot",);
      expect(listed[0]?.discipline,).toBe("smithing",);
      expect(listed[0]?.tier,).toBe(1,);
      expect(listed[0]?.discoveryMethod,).toBe("recipe_book",);
    } finally {
      await s.db.destroy();
    }
  });

  test("recordDiscovery is idempotent per actor+recipe", async () => {
    const s = await seed();
    try {
      const svc = new DiscoveryService(s.db,);
      const first = await svc.recordDiscovery({
        actorId: s.actorId,
        worldId: s.worldId,
        recipeId: s.recipeId,
        method: DiscoveryMethod.RecipeBook,
      },);

      const second = await svc.recordDiscovery({
        actorId: s.actorId,
        worldId: s.worldId,
        recipeId: s.recipeId,
        method: DiscoveryMethod.NpcTeaching,
      },);

      expect(second.created,).toBe(false,);
      expect(second.discovery.id,).toBe(first.discovery.id,);
      expect(second.discovery.discoveryMethod,).toBe("recipe_book",);
      expect(await svc.listDiscovered(s.actorId, s.worldId,),).toHaveLength(1,);
    } finally {
      await s.db.destroy();
    }
  });

  test("listDiscovered scopes to actor and world", async () => {
    const s = await seed();
    try {
      await new DiscoveryService(s.db,).recordDiscovery({
        actorId: s.actorId,
        worldId: s.worldId,
        recipeId: s.recipeId,
        method: DiscoveryMethod.QuestReward,
      },);

      const otherActor = uid();
      await insertActors(s.db, "Bystander", { id: otherActor, user_id: s.userId, } as never,);
      const otherWorld = uid();
      await insertWorlds(s.db, s.userId, "Elsewhere", { id: otherWorld, } as never,);

      const svc = new DiscoveryService(s.db,);
      expect(await svc.listDiscovered(otherActor, s.worldId,),).toEqual([],);
      expect(await svc.listDiscovered(s.actorId, otherWorld,),).toEqual([],);
      expect(await svc.listDiscovered(s.actorId, s.worldId,),).toHaveLength(1,);
    } finally {
      await s.db.destroy();
    }
  });

  test("recordDiscovery emits crafting.recipe_discovered only on creation", async () => {
    const seen: unknown[] = [];
    registry.register({
      manifest: {
        name: "test-discovery-events",
        version: "1.0.0",
        description: "test",
        author: "t",
      },
      origin: "local",
      directory: "",
    },);

    registry.addEventHandlers("test-discovery-events", [
      {
        event: "crafting.recipe_discovered",
        handler: async (data: unknown,) => {
          seen.push(data,);
        },
      },
    ],);

    const s = await seed();
    try {
      const svc = new DiscoveryService(s.db,);
      await svc.recordDiscovery({
        actorId: s.actorId,
        worldId: s.worldId,
        recipeId: s.recipeId,
        method: DiscoveryMethod.RecipeBook,
      },);

      await svc.recordDiscovery({
        actorId: s.actorId,
        worldId: s.worldId,
        recipeId: s.recipeId,
        method: DiscoveryMethod.NpcTeaching,
      },);

      expect(seen,).toHaveLength(1,);
      expect(seen[0],).toMatchObject({
        actorId: s.actorId,
        worldId: s.worldId,
        recipeId: s.recipeId,
        method: "recipe_book",
      },);
    } finally {
      registry.unregister("test-discovery-events",);
      await s.db.destroy();
    }
  });
});

describe("craft discovery gating", () => {
  test("attemptCraft rejects an undiscovered recipe without consuming materials", async () => {
    const s = await seed({ discoveredByDefault: 0, },);
    try {
      const svc = new CraftingProcessService(s.db,);
      await expect(
        withRandom(0, () => svc.attemptCraft({ actorId: s.actorId, worldId: s.worldId, recipeId: s.recipeId, },),),
      ).rejects.toThrow(/Recipe discovery required/,);

      expect(await stockOf(s.db, s.actorId, "Ore",),).toBe(10,);
      expect(await svc.listAttempts(s.actorId, s.worldId,),).toEqual([],);
    } finally {
      await s.db.destroy();
    }
  });

  test("discovered_by_default recipes craft without a discovery row", async () => {
    const s = await seed({ discoveredByDefault: 1, },);
    try {
      const svc = new CraftingProcessService(s.db,);
      const result = await withRandom(
        0,
        () => svc.attemptCraft({ actorId: s.actorId, worldId: s.worldId, recipeId: s.recipeId, },),
      );

      expect(result.status,).toBe(CraftingAttemptStatus.Success,);
      expect(result.recipeDiscovered,).toBe(false,);
      expect(
        await s.db.selectFrom("recipe_discoveries",).selectAll().execute(),
      ).toEqual([],);
    } finally {
      await s.db.destroy();
    }
  });

  test("recording a discovery unlocks the craft", async () => {
    const s = await seed({ discoveredByDefault: 0, },);
    try {
      await new DiscoveryService(s.db,).recordDiscovery({
        actorId: s.actorId,
        worldId: s.worldId,
        recipeId: s.recipeId,
        method: DiscoveryMethod.NpcTeaching,
      },);

      const svc = new CraftingProcessService(s.db,);
      const result = await withRandom(
        0,
        () => svc.attemptCraft({ actorId: s.actorId, worldId: s.worldId, recipeId: s.recipeId, },),
      );

      expect(result.status,).toBe(CraftingAttemptStatus.Success,);
      expect(result.recipeDiscovered,).toBe(false,);
    } finally {
      await s.db.destroy();
    }
  });

  test("experiment success discovers the recipe via experimentation", async () => {
    const s = await seed({ discoveredByDefault: 0, },);
    try {
      const svc = new CraftingProcessService(s.db,);
      const result = await withRandom(
        0,
        () =>
          svc.attemptCraft({
            actorId: s.actorId,
            worldId: s.worldId,
            recipeId: s.recipeId,
            experiment: true,
          },),
      );

      expect(result.status,).toBe(CraftingAttemptStatus.Success,);
      expect(result.recipeDiscovered,).toBe(true,);

      const rows = await s.db.selectFrom("recipe_discoveries",).selectAll().execute();
      expect(rows,).toHaveLength(1,);
      expect(rows[0]?.discovery_method,).toBe("experimentation",);

      // The discovery is durable: the next attempt needs no experiment flag.
      const again = await withRandom(
        0,
        () => svc.attemptCraft({ actorId: s.actorId, worldId: s.worldId, recipeId: s.recipeId, },),
      );

      expect(again.status,).toBe(CraftingAttemptStatus.Success,);
      expect(again.recipeDiscovered,).toBe(false,);
      expect(
        await s.db.selectFrom("recipe_discoveries",).selectAll().execute(),
      ).toHaveLength(1,);
    } finally {
      await s.db.destroy();
    }
  });

  test("experiment failure does not discover", async () => {
    const s = await seed({ discoveredByDefault: 0, successChance: 0.5, },);
    try {
      const svc = new CraftingProcessService(s.db,);
      const result = await withRandom(
        0.99,
        () =>
          svc.attemptCraft({
            actorId: s.actorId,
            worldId: s.worldId,
            recipeId: s.recipeId,
            experiment: true,
          },),
      );

      expect(result.status,).toBe(CraftingAttemptStatus.Failure,);
      expect(result.recipeDiscovered,).toBe(false,);
      expect(
        await s.db.selectFrom("recipe_discoveries",).selectAll().execute(),
      ).toEqual([],);
    } finally {
      await s.db.destroy();
    }
  });

  test("experimenting with an already-discovered recipe does not duplicate", async () => {
    const s = await seed({ discoveredByDefault: 0, },);
    try {
      await new DiscoveryService(s.db,).recordDiscovery({
        actorId: s.actorId,
        worldId: s.worldId,
        recipeId: s.recipeId,
        method: DiscoveryMethod.RecipeBook,
      },);

      const svc = new CraftingProcessService(s.db,);
      const result = await withRandom(
        0,
        () =>
          svc.attemptCraft({
            actorId: s.actorId,
            worldId: s.worldId,
            recipeId: s.recipeId,
            experiment: true,
          },),
      );

      expect(result.status,).toBe(CraftingAttemptStatus.Success,);
      expect(result.recipeDiscovered,).toBe(false,);
      const rows = await s.db.selectFrom("recipe_discoveries",).selectAll().execute();
      expect(rows,).toHaveLength(1,);
      expect(rows[0]?.discovery_method,).toBe("recipe_book",);
    } finally {
      await s.db.destroy();
    }
  });
});

describe("discovery primitives", () => {
  test("hasDiscovery / getDiscovery reflect recorded state", async () => {
    const s = await seed();
    try {
      expect(await hasDiscovery(s.db, s.actorId, s.recipeId,),).toBe(false,);
      expect(await getDiscovery(s.db, s.actorId, s.recipeId,),).toBeNull();

      await new DiscoveryService(s.db,).recordDiscovery({
        actorId: s.actorId,
        worldId: s.worldId,
        recipeId: s.recipeId,
        method: DiscoveryMethod.NpcTeaching,
      },);

      expect(await hasDiscovery(s.db, s.actorId, s.recipeId,),).toBe(true,);
      const found = await getDiscovery(s.db, s.actorId, s.recipeId,);
      expect(found?.discoveryMethod,).toBe(DiscoveryMethod.NpcTeaching,);
      expect(found?.actorId,).toBe(s.actorId,);
    } finally {
      await s.db.destroy();
    }
  });

  test("insertDiscovery inserts once and returns null on duplicates", async () => {
    const s = await seed();
    try {
      const first = await insertDiscovery(s.db, {
        actorId: s.actorId,
        worldId: s.worldId,
        recipeId: s.recipeId,
        method: DiscoveryMethod.QuestReward,
        masteryLevel: 2,
      },);

      expect(first?.discoveryMethod,).toBe(DiscoveryMethod.QuestReward,);
      expect(first?.masteryLevel,).toBe(2,);

      // Pre-existing row (idempotent path) and lost insert race both read
      // back as "already known".
      expect(
        await insertDiscovery(s.db, {
          actorId: s.actorId,
          worldId: s.worldId,
          recipeId: s.recipeId,
          method: DiscoveryMethod.Experimentation,
        },),
      ).toBeNull();

      expect(
        await s.db.selectFrom("recipe_discoveries",).selectAll().execute(),
      ).toHaveLength(1,);
    } finally {
      await s.db.destroy();
    }
  });

  test("emitRecipeDiscovered fans out without handlers and tolerates no logger", async () => {
    const s = await seed();
    try {
      await expect(
        emitRecipeDiscovered({
          actorId: s.actorId,
          worldId: s.worldId,
          recipeId: s.recipeId,
          method: DiscoveryMethod.Experimentation,
          discoveredAt: new Date().toISOString(),
        },),
      ).resolves.toBeUndefined();
    } finally {
      await s.db.destroy();
    }
  });
});
