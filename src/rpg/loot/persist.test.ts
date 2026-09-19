/**
 * Loot persistence bridge tests.
 *
 * Verifies generated loot becomes real `world_items` instances (definition
 * resolution, on-the-fly creation, NPC grant + location placement).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ItemCategory, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { ItemsService, } from "../../story/items";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertLocations, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { generateLoot, persistLoot, } from "./index";
import { toCategory, } from "./persist";

let db: Kysely<DB>;
let worldId: string;
let locationId: string;
let actorId: string;

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
  const userId = uid();
  await insertUsers(db, `user-${userId}`, "Loot Owner", { id: userId, } as never,);
  worldId = uid();
  await insertWorlds(db, userId, "Loot World", { id: worldId, } as never,);
  locationId = uid();
  await insertLocations(db, worldId, "Cavern", { id: locationId, } as never,);
  actorId = uid();
  await insertActors(db, "Bandit", { id: actorId, user_id: userId, owner_id: userId, } as never,);
},);

afterAll(async () => {
  await db.destroy();
},);

const TABLE = [
  {
    name: "Health Potion",
    description: "Heals.",
    type: "consumable",
    rarity: "common",
    weight: 50,
    minQuantity: 1,
    maxQuantity: 3,
    minLevel: 1,
    goldValue: 5,
    metadata: {},
  },
] as const;

describe("persistLoot", () => {
  test("creates world_items for each drop at a location", async () => {
    const result = generateLoot([...TABLE,], 1, 2,);
    expect(result.worldItemIds,).toHaveLength(0,);

    const persisted = await persistLoot(db, result, { worldId, locationId, },);
    expect(persisted.worldItemIds.length,).toBeGreaterThanOrEqual(1,);

    // Every returned id must be a real world_items row at the location.
    for (const wId of persisted.worldItemIds) {
      const row = await db
        .selectFrom("world_items",)
        .select(["id", "location_id",],)
        .where("id", "=", wId,)
        .executeTakeFirst();
      expect(row,).toBeDefined();
      expect(row?.location_id,).toBe(locationId,);
    }
  });

  test("grants drops to an NPC via owner_actor_id", async () => {
    const result = generateLoot([...TABLE,], 1, 1,);
    const persisted = await persistLoot(db, result, { worldId, actorId, },);
    expect(persisted.worldItemIds.length,).toBeGreaterThanOrEqual(1,);

    for (const wId of persisted.worldItemIds) {
      const row = await db
        .selectFrom("world_items",)
        .select("owner_actor_id",)
        .where("id", "=", wId,)
        .executeTakeFirst();
      expect(row?.owner_actor_id,).toBe(actorId,);
    }
  });

  test("creates on-the-fly item definitions from anonymous drops", async () => {
    const result = generateLoot([...TABLE,], 1, 1,);
    await persistLoot(db, result, { worldId, locationId, },);
    // Definitions must exist for the created instances.
    const rows = await db
      .selectFrom("world_items",)
      .innerJoin("items", "items.id", "world_items.item_id",)
      .where("world_items.id", "in", result.worldItemIds,)
      .select(["items.name", "items.category", "items.rarity",],)
      .execute();
    expect(rows.length,).toBe(result.worldItemIds.length,);
    for (const r of rows) {
      expect(r.name,).toBe("Health Potion",);
      expect(r.category,).toBe(ItemCategory.Consumable,);
      expect(r.rarity,).toBe("common",);
    }
  });

  test("requires a destination", async () => {
    const result = generateLoot([...TABLE,], 1, 1,);
    await expect(persistLoot(db, result, { worldId, },),).rejects.toThrow(/actorId or locationId/,);
  });

  test("is idempotent for a repeated ledger key", async () => {
    const countRows = async (): Promise<number> => (await db.selectFrom("world_items",).select("id",).execute()).length;
    const before = await countRows();

    const result = generateLoot([...TABLE,], 1, 1,);
    const first = await persistLoot(db, result, { worldId, locationId, ledgerKey: "reward-q1", },);
    expect(first.worldItemIds.length,).toBeGreaterThanOrEqual(1,);
    const afterFirst = await countRows();
    expect(afterFirst,).toBe(before + first.worldItemIds.length,);

    // Re-running with the same key resolves the recorded ids, crediting nothing.
    const second = await persistLoot(db, result, { worldId, locationId, ledgerKey: "reward-q1", },);
    expect(second.worldItemIds,).toEqual(first.worldItemIds,);
    expect(await countRows(),).toBe(afterFirst,);
  });

  test("rolls back all rows when a drop fails mid-transaction", async () => {
    const countRows = async (): Promise<number> => (await db.selectFrom("world_items",).select("id",).execute()).length;
    const before = await countRows();

    const result = generateLoot([...TABLE,], 1, 1,);
    result.drops.push({ ...result.drops[0]!, itemId: "no-such-definition", quantity: 1, },);
    await expect(persistLoot(db, result, { worldId, locationId, },),).rejects.toThrow(/not found in world/,);

    // The successful first drop must have been rolled back with the failed one.
    expect(await countRows(),).toBe(before,);
  });

  test("splits stackable drops across max_stack-bounded instances", async () => {
    const items = new ItemsService(db,);
    const defId = await items.createDefinition({
      worldId,
      name: "Arrow",
      description: "Bundle.",
      category: ItemCategory.Weapon,
      rarity: "common",
      stackable: true,
      maxStack: 2,
      properties: {},
      value: 1,
      weight: 1,
    },);
    const persisted = await persistLoot(db, {
      drops: [{
        name: "Arrow",
        description: "Bundle.",
        type: "weapon",
        rarity: "common",
        itemId: defId,
        quantity: 5,
        goldValue: 1,
        totalGoldValue: 5,
        metadata: {},
      },],
      totalGoldValue: 5,
      hasRareDrop: false,
      worldItemIds: [],
    }, { worldId, locationId, },);
    expect(persisted.worldItemIds,).toHaveLength(3,);

    const rows = await db
      .selectFrom("world_items",)
      .select("quantity",)
      .where("id", "in", persisted.worldItemIds,)
      .execute();
    expect(rows.map((r,) => r.quantity).sort((a, b,) => b - a),).toEqual([2, 2, 1,],);
  });

  test("caps unique drops at quantity 1 per instance", async () => {
    const items = new ItemsService(db,);
    const defId = await items.createDefinition({
      worldId,
      name: "Blade of Secrets",
      description: "Unique.",
      category: ItemCategory.Weapon,
      rarity: "epic",
      stackable: false,
      maxStack: 1,
      properties: {},
      value: 10,
      weight: 1,
    },);
    const persisted = await persistLoot(db, {
      drops: [{
        name: "Blade of Secrets",
        description: "Unique.",
        type: "weapon",
        rarity: "epic",
        itemId: defId,
        quantity: 3,
        goldValue: 10,
        totalGoldValue: 30,
        metadata: {},
      },],
      totalGoldValue: 30,
      hasRareDrop: true,
      worldItemIds: [],
    }, { worldId, locationId, },);
    expect(persisted.worldItemIds,).toHaveLength(3,);

    const rows = await db
      .selectFrom("world_items",)
      .select("quantity",)
      .where("id", "in", persisted.worldItemIds,)
      .execute();
    for (const r of rows) {
      expect(r.quantity,).toBe(1,);
    }
  });
});

describe("toCategory", () => {
  test("maps battle-style type strings to canonical categories", () => {
    expect(toCategory("weapon", "other",),).toBe(ItemCategory.Weapon,);
    expect(toCategory("helmet", "other",),).toBe(ItemCategory.Armor,);
    expect(toCategory("potion", "other",),).toBe(ItemCategory.Consumable,);
    expect(toCategory("quest_item", "other",),).toBe(ItemCategory.QuestItem,);
    expect(toCategory("artifact", "other",),).toBe(ItemCategory.Artifact,);
  });
  test("falls back to provided default for unknown types", () => {
    expect(toCategory("gizmo", "misc",),).toBe(ItemCategory.Misc,);
  });
});
