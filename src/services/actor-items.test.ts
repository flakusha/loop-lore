/**
 * Actor Items Service tests
 *
 * Covers equip/unequip (slot conflict), carried weight + capacity
 * (STR-derived), equip-state query, and inter-actor transfer.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { EquipState, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActorItems, insertActors, insertUsers, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { ActorItemsService, ENCUMBRANCE, slotForCategory, } from "./actor-items";

let db: Kysely<DB>;
let actorId: string;

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());

  const userId = uid();
  await insertUsers(db, `user-${userId}`, "Test User", { id: userId, role: "solo", status: "active", settings: "{}", } as never,);
  actorId = uid();
  await insertActors(db, "Utgard", { id: actorId, actor_type: "character", user_id: userId, owner_id: userId, agent_type: "ai", settings: "{}", } as never,);
});

afterAll(async () => {
  await db.destroy();
});

describe("ActorItemsService", () => {
  const svc = () => new ActorItemsService(db,);

  test("slotForCategory maps categories to equipment slots", () => {
    expect(slotForCategory("weapon",),).toBe("weapon",);
    expect(slotForCategory("armor",),).toBe("armor",);
    expect(slotForCategory("consumable",),).toBe("accessory",);
    expect(slotForCategory("book",),).toBe("accessory",);
    expect(slotForCategory("artifact",),).toBe("accessory",);
  });

  test("equip sets equipped state", async () => {
    await insertActorItems(db, actorId, "Longsword", "weapon", { weight: 3, },);
    const items = await db.selectFrom("actor_items").where("name", "=", "Longsword",).selectAll().execute();
    const item = items[items.length - 1]!;

    const res = await svc().equip(actorId, item.id,);
    expect(res.ok,).toBe(true,);
    expect(res.itemId,).toBe(item.id,);

    const updated = await db
      .selectFrom("actor_items")
      .select("equipped")
      .where("id", "=", item.id,)
      .executeTakeFirst();
    expect(updated?.equipped,).toBe(EquipState.Equipped,);
  });

  test("equip rejects a second item in the same slot", async () => {
    await insertActorItems(db, actorId, "Sword A", "weapon", { weight: 3, },);
    await insertActorItems(db, actorId, "Sword B", "weapon", { weight: 3, },);
    const weapons = await db.selectFrom("actor_items").where("item_type", "=", "weapon",).selectAll().execute();
    const a = weapons[weapons.length - 2]!;
    const b = weapons[weapons.length - 1]!;

    await svc().equip(actorId, a.id,);
    const res = await svc().equip(actorId, b.id,);
    expect(res.ok,).toBe(false,);
    expect(res.reason,).toMatch(/already equipped/,);
  });

  test("equip returns error for unknown item", async () => {
    const res = await svc().equip(actorId, "missing",);
    expect(res.ok,).toBe(false,);
    expect(res.reason,).toBe("Item not found",);
  });

  test("unequip clears equipped state", async () => {
    await insertActorItems(db, actorId, "Shield", "armor", { weight: 5, },);
    const items = await db.selectFrom("actor_items").where("name", "=", "Shield",).selectAll().execute();
    const item = items[items.length - 1]!;
    await svc().equip(actorId, item.id,);
    const res = await svc().unequip(actorId, item.id,);
    expect(res.ok,).toBe(true,);
    const updated = await db
      .selectFrom("actor_items")
      .select("equipped")
      .where("id", "=", item.id,)
      .executeTakeFirst();
    expect(updated?.equipped,).toBe(EquipState.Unequipped,);
  });

  test("getEquipped returns only equipped items", async () => {
    await insertActorItems(db, actorId, "Leeks", "consumable", { weight: 1, },);
    const items = await db.selectFrom("actor_items").where("name", "=", "Leeks",).selectAll().execute();
    const item = items[items.length - 1]!;
    const before = await svc().getEquipped(actorId,);
    expect(before.some(r => r.id === item.id,),).toBe(false,);
    await svc().equip(actorId, item.id,);
    const after = await svc().getEquipped(actorId,);
    expect(after.some(r => r.id === item.id,),).toBe(true,);
  });

  test("getCarryStatus reflects capacity + encumbrance", async () => {
    const status = await svc().getCarryStatus(actorId,);
    expect(status.capacity,).toBeGreaterThan(0,);
    expect(status.carried,).toBeGreaterThanOrEqual(0,);
    expect(typeof status.canCarry(0,),).toBe("boolean",);
    // Default STR 10 → capacity 50 + 10*10 = 150.
    expect(status.capacity,).toBe(150,);
  });

  test("carry status honors stored strength in actor settings", async () => {
    const strong = uid();
    const strongUser = uid();
    await insertUsers(db, `user-${strong}`, "Str", { id: strongUser, role: "solo", status: "active", settings: "{}", } as never,);
    await insertActors(db, "Strong", { id: strong, actor_type: "character", user_id: strongUser, owner_id: null, agent_type: "ai", settings: "{\"strength\":20}", } as never,);
    const status = await svc().getCarryStatus(strong,);
    expect(status.capacity,).toBe(250,);
  });

  test("transfer moves quantity between actors", async () => {
    const target = uid();
    const targetUser = uid();
    await insertUsers(db, `user-t${target}`, "T", { id: targetUser, role: "solo", status: "active", settings: "{}", } as never,);
    await insertActors(db, "Target", { id: target, actor_type: "character", user_id: targetUser, owner_id: null, agent_type: "ai", settings: "{}", } as never,);

    await insertActorItems(db, actorId, "Rations", "consumable", { quantity: 5, weight: 1, } as never,);
    const sourceItems = await db.selectFrom("actor_items").where("name", "=", "Rations",).selectAll().execute();
    const source = sourceItems[sourceItems.length - 1]!;

    const res = await svc().transfer(actorId, target, source.id, 2,);
    expect(res.ok,).toBe(true,);
    expect(res.transferred,).toBe(2,);

    const srcAfter = await db.selectFrom("actor_items").where("id", "=", source.id,).select("quantity").executeTakeFirst();
    expect(srcAfter?.quantity,).toBe(3,);

    const tgtAfter = await db
      .selectFrom("actor_items")
      .where("actor_id", "=", target,)
      .where("name", "=", "Rations",)
      .select("quantity")
      .executeTakeFirst();
    expect(tgtAfter?.quantity,).toBe(2,);
  });

  test("transfer refuses partial quantity beyond stock", async () => {
    const target = uid();
    const targetUser = uid();
    await insertUsers(db, `user-t2${target}`, "T2", { id: targetUser, role: "solo", status: "active", settings: "{}", } as never,);
    await insertActors(db, "T2", { id: target, actor_type: "character", user_id: targetUser, owner_id: null, agent_type: "ai", settings: "{}", } as never,);

    await insertActorItems(db, actorId, "Lump", "material", { quantity: 1, weight: 1, } as never,);
    const items = await db.selectFrom("actor_items").where("name", "=", "Lump",).selectAll().execute();
    const item = items[items.length - 1]!;

    const res = await svc().transfer(actorId, target, item.id, 5,);
    expect(res.ok,).toBe(false,);
    expect(res.reason,).toMatch(/Insufficient/,);
  });

  test("transfer with same source and target refuses", async () => {
    await insertActorItems(db, actorId, "Trinket", "misc", { quantity: 1, } as never,);
    const items = await db.selectFrom("actor_items").where("name", "=", "Trinket",).selectAll().execute();
    const item = items[items.length - 1]!;
    const res = await svc().transfer(actorId, actorId, item.id, 1,);
    expect(res.ok,).toBe(false,);
    expect(res.reason,).toMatch(/same/,);
  });

  test("ENCUMBRANCE exposed", () => {
    expect(ENCUMBRANCE.Light,).toBe("light",);
    expect(ENCUMBRANCE.Medium,).toBe("medium",);
    expect(ENCUMBRANCE.Overloaded,).toBe("overloaded",);
  });
});