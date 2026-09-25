import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../test-utils/insert-helpers";
import {
  createActorItem,
  deleteActorItem,
  listActorItems,
  updateActorItem,
} from "./actor-items";

describe("actor items service", () => {
  let db: Kysely<DB>;
  let actorId: string;

  beforeEach(async () => {
    const fresh = await createTestDb();
    db = fresh.db;
    await insertUsers(db, "owner", "Owner", { id: "user-owner", } as never,);
    await insertUsers(db, "other", "Other", { id: "user-other", } as never,);
    actorId = await insertActors(db, "Lyra", {
      id: "actor-lyra",
      owner_id: "user-owner",
    } as never,);
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  it("creates an item with inventory defaults and JSON columns", async () => {
    const created = await createActorItem(db, actorId, "user-owner", "user", {
      name: "Rusty Shortsword",
      itemType: "weapon",
      tags: ["iron", "starter",],
      metadata: { damage: "1d6", },
    },);
    expect(created.ok,).toBe(true,);
    if (!created.ok) { return; }
    expect(created.entity.quantity,).toBe(1,);
    expect(created.entity.value,).toBe(0,);
    expect(created.entity.equipped,).toBe("unequipped",);
    expect(JSON.parse(created.entity.tags ?? "[]",),).toEqual(["iron", "starter",],);
    expect(JSON.parse(created.entity.metadata ?? "{}",),).toEqual({ damage: "1d6", },);

    const listed = await listActorItems(db, actorId, "user-owner", "user",);
    expect(listed.ok,).toBe(true,);
    if (listed.ok) {
      expect(listed.total,).toBe(1,);
      expect(listed.items[0]!.id,).toBe(created.entity.id,);
    }
  });

  it("rejects create with empty name", async () => {
    const res = await createActorItem(db, actorId, "user-owner", "user", {
      name: "",
    },);
    expect(res,).toEqual({ ok: false, code: "bad_request", message: "name is required", },);
  });

  it("filters by item type and orders by sort_order", async () => {
    await createActorItem(db, actorId, "user-owner", "user", {
      name: "Torch",
      itemType: "tool",
      sortOrder: 1,
    },);
    await createActorItem(db, actorId, "user-owner", "user", {
      name: "Health Potion",
      itemType: "consumable",
    },);

    const consumables = await listActorItems(db, actorId, "user-owner", "user", {
      itemType: "consumable",
    },);
    expect(consumables.ok,).toBe(true,);
    if (consumables.ok) {
      expect(consumables.total,).toBe(1,);
      expect(consumables.items[0]!.name,).toBe("Health Potion",);
    }

    const listed = await listActorItems(db, actorId, "user-owner", "user",);
    expect(listed.ok,).toBe(true,);
    if (listed.ok) {
      expect(listed.items.map((i,) => i.name),).toEqual(["Health Potion", "Torch",],);
    }
  });

  it("equips, updates fields, and un-equips without clobbering", async () => {
    const created = await createActorItem(db, actorId, "user-owner", "user", {
      name: "Leather Armor",
      itemType: "armor",
    },);
    if (!created.ok) { throw new Error("seed failed",); }

    const equipped = await updateActorItem(
      db,
      actorId,
      created.entity.id,
      "user-owner",
      "user",
      { equipped: true, quantity: 2, },
    );
    expect(equipped.ok,).toBe(true,);
    if (!equipped.ok) { return; }
    expect(equipped.entity.equipped,).toBe("equipped",);
    expect(equipped.entity.quantity,).toBe(2,);
    expect(equipped.entity.name,).toBe("Leather Armor",);

    const unequipped = await updateActorItem(
      db,
      actorId,
      created.entity.id,
      "user-owner",
      "user",
      { equipped: false, },
    );
    expect(unequipped.ok,).toBe(true,);
    if (unequipped.ok) { expect(unequipped.entity.equipped,).toBe("unequipped",); }
  });

  it("keeps update/delete scoped to the given actor", async () => {
    const created = await createActorItem(db, actorId, "user-owner", "user", {
      name: "Quest Rune",
      itemType: "key_item",
    },);
    if (!created.ok) { throw new Error("seed failed",); }

    const foreignActor = await insertActors(db, "Other", {
      id: "actor-other",
      owner_id: "user-owner",
    } as never,);
    const hijack = await updateActorItem(
      db,
      foreignActor,
      created.entity.id,
      "user-owner",
      "user",
      { name: "Stolen", },
    );
    expect(hijack,).toEqual({ ok: false, code: "not_found", message: "Item not found", },);

    const wrongOwner = await updateActorItem(
      db,
      actorId,
      created.entity.id,
      "user-other",
      "user",
      { name: "Nope", },
    );
    expect(wrongOwner,).toEqual({ ok: false, code: "forbidden", message: "Not allowed", },);

    const deleted = await deleteActorItem(
      db,
      actorId,
      created.entity.id,
      "user-owner",
      "user",
    );
    expect(deleted,).toEqual({ ok: true, id: created.entity.id, },);

    const gone = await deleteActorItem(db, actorId, "no-item", "user-owner", "user",);
    expect(gone,).toEqual({ ok: false, code: "not_found", message: "Item not found", },);
  });

  it("distinguishes not_found from forbidden on the actor guard", async () => {
    const listed = await listActorItems(db, "no-actor", "user-owner", "user",);
    expect(listed,).toEqual({ ok: false, code: "not_found", message: "Actor not found", },);

    const created = await createActorItem(db, actorId, "user-other", "user", {
      name: "x",
    },);
    expect(created,).toEqual({ ok: false, code: "forbidden", message: "Not allowed", },);

    const admin = await listActorItems(db, actorId, "user-other", "admin",);
    expect(admin.ok,).toBe(true,);
  });
});
