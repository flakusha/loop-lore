// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Behavior tests for the wardrobe CRUD + override writers.
 *
 * The contracts pinned here are the authorization ones, because wardrobe
 * rows are addressable by id at the route layer:
 *  1. `getWardrobeItem` returns undefined for a row the actor cannot see
 *     (another actor's personal item, or a world template from another world).
 *  2. `updateWardrobeItem` / `deleteWardrobeItem` return false and write
 *     NOTHING for a non-owner — the shared ownsItem guard must not drift.
 *  3. Chat override writes are chat+actor unique (upsert, not duplicate row).
 *  4. Location binding writes validate every referenced outfit first, so a
 *     partially-invalid map never lands.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertUsers,
  insertWardrobeItems,
  insertWorlds,
} from "../../../test-utils/insert-helpers";
import {
  createWardrobeItem,
  deleteWardrobeItem,
  getWardrobeItem,
  listWardrobeItems,
  updateWardrobeItem,
} from "./crud";
import { setChatOutfitOverride, setLocationOutfitBindings, } from "./overrides";

describe("wardrobe CRUD — visibility and ownership", () => {
  let db: Kysely<DB>;
  const actorA = "actor-crud-a";
  const actorB = "actor-crud-b";
  const worldId = "world-crud-1";
  const otherWorldId = "world-crud-2";
  const userId = "user-crud-1";

  beforeAll(async () => {
    const created = await createTestDb();
    db = created.db;
    await insertUsers(db, "crud-user", "Crud User", { id: userId as never, },);
    await insertActors(db, "Crud A", { id: actorA, },);
    await insertActors(db, "Crud B", { id: actorB, },);
    await insertWorlds(db, userId, "Crud World", { id: worldId, },);
    await insertWorlds(db, userId, "Other World", { id: otherWorldId, },);
  },);

  it("create rejects a scope-less item (needs an actor or a world)", async () => {
    await expect(
      createWardrobeItem(db, { name: "Orphan", descriptor: "no scope", },),
    ).rejects.toThrow("Wardrobe item requires an actor or world scope",);
  });

  it("create writes a personal item with defaults applied", async () => {
    const id = await createWardrobeItem(db, { actorId: actorA, name: "Leather", descriptor: "worn hide", },);
    const item = await getWardrobeItem(db, id, actorA,);
    expect(item?.name,).toBe("Leather",);
    expect(item?.descriptor,).toBe("worn hide",);
    // Unspecified optionals fall back to their documented defaults.
    expect(item?.tags,).toEqual([],);
    expect(item?.sortOrder,).toBe(0,);
    expect(item?.actorId,).toBe(actorA,);
    expect(item?.worldId,).toBeNull();
  });

  it("create preserves explicit tags and sort order", async () => {
    const id = await createWardrobeItem(db, {
      actorId: actorA,
      name: "Tagged",
      tags: ["formal", "evening",],
      sortOrder: 7,
    },);

    const item = await getWardrobeItem(db, id, actorA,);
    expect(item?.tags,).toEqual(["formal", "evening",],);
    expect(item?.sortOrder,).toBe(7,);
    expect(item?.descriptor,).toBe("",);
  });

  it("get returns undefined for a row belonging to another actor", async () => {
    const id = await insertWardrobeItems(db, "B armor", { actor_id: actorB, },);
    expect(await getWardrobeItem(db, id, actorA,),).toBeUndefined();
    // ...and the owner can read it.
    expect((await getWardrobeItem(db, id, actorB,))?.name,).toBe("B armor",);
  });

  it("get returns undefined for a missing id", async () => {
    expect(await getWardrobeItem(db, "no-such-item", actorA,),).toBeUndefined();
  });

  it("a world template is visible inside its world and hidden outside", async () => {
    const id = await insertWardrobeItems(db, "World robe", { world_id: worldId, },);
    expect((await getWardrobeItem(db, id, actorA, worldId,))?.name,).toBe("World robe",);
    // Same template, different world — not visible.
    expect(await getWardrobeItem(db, id, actorA, otherWorldId,),).toBeUndefined();
    // No world context at all — not visible.
    expect(await getWardrobeItem(db, id, actorA,),).toBeUndefined();
  });

  it("list returns the actor own items plus the world templates, sorted", async () => {
    await insertWardrobeItems(db, "Template A", { world_id: worldId, sort_order: 1, },);
    await insertWardrobeItems(db, "Template B", { world_id: worldId, sort_order: 2, },);
    await insertWardrobeItems(db, "Personal C", { actor_id: actorA, sort_order: 3, },);
    await insertWardrobeItems(db, "Other world", { world_id: otherWorldId, sort_order: 0, },);

    const visible = await listWardrobeItems(db, actorA, { worldId, },);
    const names = visible.map((i,) => i.name);
    expect(names,).toContain("Template A",);
    expect(names,).toContain("Personal C",);
    // Out of scope: the other world and another actor rows.
    expect(names,).not.toContain("Other world",);
    expect(names,).not.toContain("B armor",);
    // Ordered by sort_order ascending.
    const orders = visible.map((i,) => i.sortOrder);
    expect(orders,).toEqual([...orders,].sort((a, b,) => a - b),);
  });

  it("list without a world scope omits world templates", async () => {
    const names = (await listWardrobeItems(db, actorA,)).map((i,) => i.name);
    expect(names,).toContain("Personal C",);
    expect(names,).not.toContain("Template A",);
  });

  it("update applies only the supplied fields and bumps updated_at", async () => {
    const id = await insertWardrobeItems(db, "Original", {
      actor_id: actorA,
      descriptor: "old desc",
      sort_order: 4,
    },);

    const before = await getWardrobeItem(db, id, actorA,);

    expect(await updateWardrobeItem(db, id, actorA, { name: "Renamed", tags: ["y",], sortOrder: 9, },),).toBe(true,);
    const after = await getWardrobeItem(db, id, actorA,);
    expect(after?.name,).toBe("Renamed",);
    expect(after?.tags,).toEqual(["y",],);
    expect(after?.sortOrder,).toBe(9,);
    // Untouched field kept its value.
    expect(after?.descriptor,).toBe("old desc",);
    expect(after!.updatedAt >= before!.updatedAt,).toBe(true,);
  });

  it("update returns false and changes nothing when the caller is not the owner", async () => {
    const id = await insertWardrobeItems(db, "Untouched", { actor_id: actorB, },);
    expect(await updateWardrobeItem(db, id, actorA, { name: "Hijacked", },),).toBe(false,);
    // The row is still B and still named Untouched.
    const still = await db
      .selectFrom("wardrobe_items",)
      .select(["name",],)
      .where("id", "=", id,)
      .executeTakeFirst();

    expect(still?.name,).toBe("Untouched",);
  });

  it("update returns false for a missing item", async () => {
    expect(await updateWardrobeItem(db, "nope", actorA, { name: "X", },),).toBe(false,);
  });

  it("delete removes the caller own item", async () => {
    const id = await insertWardrobeItems(db, "Disposable", { actor_id: actorA, },);
    expect(await deleteWardrobeItem(db, id, actorA,),).toBe(true,);
    expect(await getWardrobeItem(db, id, actorA,),).toBeUndefined();
    // Second delete finds nothing.
    expect(await deleteWardrobeItem(db, id, actorA,),).toBe(false,);
  });

  it("delete returns false and keeps the row when the caller is not the owner", async () => {
    const id = await insertWardrobeItems(db, "B keeper", { actor_id: actorB, },);
    expect(await deleteWardrobeItem(db, id, actorA,),).toBe(false,);
    expect(await deleteWardrobeItem(db, id, actorA,),).toBe(false,);
    const still = await db
      .selectFrom("wardrobe_items",)
      .select(["id",],)
      .where("id", "=", id,)
      .executeTakeFirst();

    expect(still?.id,).toBe(id,);
  });
});

describe("wardrobe overrides — chat and location writers", () => {
  let db: Kysely<DB>;
  const actorA = "actor-ovr-a";
  const actorB = "actor-ovr-b";
  const worldId = "world-ovr-1";
  const otherWorldId = "world-ovr-2";
  const chatId = "chat-ovr-1";
  const userId = "user-ovr-1";

  beforeAll(async () => {
    const created = await createTestDb();
    db = created.db;
    await insertUsers(db, "ovr-user", "Ovr User", { id: userId as never, },);
    await insertActors(db, "Ovr A", { id: actorA, },);
    await insertActors(db, "Ovr B", { id: actorB, },);
    await insertWorlds(db, userId, "Ovr World", { id: worldId, },);
    await insertWorlds(db, userId, "Ovr Other", { id: otherWorldId, },);
    await db.insertInto("chats",).values({ id: chatId, name: "Ovr Chat", created_by: userId, },).execute();
  },);

  /**
   * @returns every chat override row for the shared chat
   */
  async function overrideRows() {
    return await db
      .selectFrom("chat_wardrobe_overrides",)
      .selectAll()
      .where("chat_id", "=", chatId,)
      .execute();
  }

  it("setChatOutfitOverride inserts a row for a visible personal outfit", async () => {
    const outfit = await insertWardrobeItems(db, "Ovr personal", { actor_id: actorA, },);
    await setChatOutfitOverride(db, { chatId, actorId: actorA, outfitId: outfit, changedBy: userId, },);
    const rows = await overrideRows();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.actor_id,).toBe(actorA,);
    expect(rows[0]?.outfit_id,).toBe(outfit,);
    expect(rows[0]?.changed_by,).toBe(userId,);
  });

  it("setChatOutfitOverride upserts on (chat, actor) rather than duplicating", async () => {
    const first = await insertWardrobeItems(db, "Ovr outfit 1", { actor_id: actorA, },);
    const second = await insertWardrobeItems(db, "Ovr outfit 2", { actor_id: actorA, },);

    await setChatOutfitOverride(db, { chatId, actorId: actorA, outfitId: first, },);
    await setChatOutfitOverride(db, { chatId, actorId: actorA, outfitId: second, changedBy: userId, },);

    const rows = await overrideRows();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.outfit_id,).toBe(second,);
    // changedBy was null on the first write, so the upsert set it.
    expect(rows[0]?.changed_by,).toBe(userId,);
  });

  it("setChatOutfitOverride(null) clears the row instead of writing one", async () => {
    await setChatOutfitOverride(db, { chatId, actorId: actorA, outfitId: null, },);
    expect(await overrideRows(),).toHaveLength(0,);
    // Clearing again is a no-op, not an error.
    await setChatOutfitOverride(db, { chatId, actorId: actorA, outfitId: null, },);
    expect(await overrideRows(),).toHaveLength(0,);
  });

  it("setChatOutfitOverride accepts an actor-less world template", async () => {
    // ck_wardrobe_items_scope forbids actor_id AND world_id both being null,
    // so the actor_id-is-null branch of the visibility check is reachable
    // exactly via a world template.
    const template = await insertWardrobeItems(db, "Global template", { world_id: worldId, },);
    await setChatOutfitOverride(db, { chatId, actorId: actorA, outfitId: template, },);
    expect((await overrideRows())[0]?.outfit_id,).toBe(template,);
  });

  it("setChatOutfitOverride refuses an outfit owned by another actor", async () => {
    const foreign = await insertWardrobeItems(db, "B outfit", { actor_id: actorB, },);
    const before = await overrideRows();
    await expect(
      setChatOutfitOverride(db, { chatId, actorId: actorA, outfitId: foreign, },),
    ).rejects.toThrow("Wardrobe item not found",);

    // The refusal wrote nothing and mutated nothing.
    const after = await overrideRows();
    expect(after,).toHaveLength(before.length,);
    expect(after.map((r,) => r.outfit_id),).not.toContain(foreign,);
  });

  it("setChatOutfitOverride refuses an unknown outfit id", async () => {
    const before = await overrideRows();
    await expect(
      setChatOutfitOverride(db, { chatId, actorId: actorA, outfitId: "missing", },),
    ).rejects.toThrow("Wardrobe item not found",);

    expect(await overrideRows(),).toHaveLength(before.length,);
  });

  it("setLocationOutfitBindings inserts a config row on first write", async () => {
    const outfit = await insertWardrobeItems(db, "Loc outfit", { actor_id: actorA, },);
    await setLocationOutfitBindings(db, {
      worldId,
      actorId: actorA,
      bindings: { "loc-1": outfit, },
    },);

    const row = await db
      .selectFrom("world_avatar_config",)
      .selectAll()
      .where("world_id", "=", worldId,)
      .where("actor_id", "=", actorA,)
      .executeTakeFirst();

    expect(row,).toBeDefined();
    expect(JSON.parse(row!.outfit_bindings ?? "{}",),).toEqual({ "loc-1": outfit, },);
    expect(row?.selection_rule_override,).toBeNull();
  });

  it("setLocationOutfitBindings replaces the map on a second write", async () => {
    const first = await insertWardrobeItems(db, "Loc A", { actor_id: actorA, },);
    const second = await insertWardrobeItems(db, "Loc B", { actor_id: actorA, },);
    await setLocationOutfitBindings(db, { worldId, actorId: actorA, bindings: { "loc-1": first, }, },);
    await setLocationOutfitBindings(db, {
      worldId,
      actorId: actorA,
      bindings: { "loc-2": second, },
    },);

    const rows = await db
      .selectFrom("world_avatar_config",)
      .selectAll()
      .where("world_id", "=", worldId,)
      .where("actor_id", "=", actorA,)
      .execute();

    expect(rows,).toHaveLength(1,);
    // Replaced wholesale, not merged.
    expect(JSON.parse(rows[0]!.outfit_bindings ?? "{}",),).toEqual({ "loc-2": second, },);
  });

  it("setLocationOutfitBindings accepts a template from the same world", async () => {
    const template = await insertWardrobeItems(db, "World template", { world_id: worldId, },);
    await setLocationOutfitBindings(db, { worldId, actorId: actorA, bindings: { "loc-t": template, }, },);
    const row = await db
      .selectFrom("world_avatar_config",)
      .select(["outfit_bindings",],)
      .where("world_id", "=", worldId,)
      .where("actor_id", "=", actorA,)
      .executeTakeFirst();

    expect(JSON.parse(row!.outfit_bindings ?? "{}",),).toEqual({ "loc-t": template, },);
  });

  it("setLocationOutfitBindings rejects the whole map when any outfit is out of scope", async () => {
    const good = await insertWardrobeItems(db, "Loc good", { actor_id: actorA, },);
    const foreignWorld = await insertWardrobeItems(db, "Other world template", {
      world_id: otherWorldId,
    },);

    await expect(
      setLocationOutfitBindings(db, {
        worldId,
        actorId: actorA,
        bindings: { "loc-good": good, "loc-bad": foreignWorld, },
      },),
    ).rejects.toThrow(`Wardrobe item ${foreignWorld} not visible in world`,);

    // The partially-valid entry must NOT have landed.
    const row = await db
      .selectFrom("world_avatar_config",)
      .select(["outfit_bindings",],)
      .where("world_id", "=", worldId,)
      .where("actor_id", "=", actorA,)
      .executeTakeFirst();

    expect(JSON.parse(row!.outfit_bindings ?? "{}",),).not.toHaveProperty("loc-good",);
  });

  it("setLocationOutfitBindings accepts an empty map (clears every rule)", async () => {
    await setLocationOutfitBindings(db, { worldId, actorId: actorA, bindings: {}, },);
    const row = await db
      .selectFrom("world_avatar_config",)
      .select(["outfit_bindings",],)
      .where("world_id", "=", worldId,)
      .where("actor_id", "=", actorA,)
      .executeTakeFirst();

    expect(JSON.parse(row!.outfit_bindings ?? "{}",),).toEqual({},);
  });
});
