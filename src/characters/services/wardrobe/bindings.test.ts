// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Behavior tests for the wardrobe ↔ inventory-instance binding seam.
 *
 * An outfit is composed of inventory item *instances* (`actor_items`), not a
 * parallel item model, so the binding layer has three contracts to pin:
 *  1. bind is inventory-gated — a foreign or missing instance is refused.
 *  2. bind is idempotent — re-binding the same triple returns the same id.
 *  3. unbind is actor-scoped — another actor's binding id is not deletable.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { ItemCategory, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActorItems,
  insertActors,
  insertWardrobeItems,
} from "../../../test-utils/insert-helpers";
import {
  bindWardrobeItemInstance,
  listWardrobeBindings,
  unbindWardrobeItemInstance,
} from "./bindings";

describe("wardrobe instance bindings", () => {
  let db: Kysely<DB>;
  const actorA = "actor-bind-a";
  const actorB = "actor-bind-b";
  const outfitId = "outfit-bind-1";
  const instanceA = "instance-bind-a";

  /**
   * @returns rows currently in actor_wardrobe for the shared outfit
   */
  async function bindingRows() {
    return await db
      .selectFrom("actor_wardrobe",)
      .selectAll()
      .where("wardrobe_item_id", "=", outfitId,)
      .execute();
  }

  beforeAll(async () => {
    const created = await createTestDb();
    db = created.db;
    await insertActors(db, "Bind A", { id: actorA, },);
    await insertActors(db, "Bind B", { id: actorB, },);
    await insertWardrobeItems(db, "Bind Outfit", { id: outfitId, actor_id: actorA, },);
    await insertActorItems(db, actorA, "Bindable sword", ItemCategory.Weapon, { id: instanceA, },);
  },);

  it("binds an owned inventory instance and writes the actor_wardrobe row", async () => {
    const id = await bindWardrobeItemInstance(db, actorA, outfitId, instanceA,);
    expect(typeof id,).toBe("string",);
    expect(id.length,).toBeGreaterThan(0,);

    const rows = await bindingRows();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.id,).toBe(id,);
    expect(rows[0]?.actor_id,).toBe(actorA,);
    expect(rows[0]?.wardrobe_item_id,).toBe(outfitId,);
    expect(rows[0]?.item_instance_id,).toBe(instanceA,);
    expect(rows[0]?.created_at,).toBeTruthy();
  });

  it("is idempotent: re-binding the same triple returns the existing id", async () => {
    const first = await bindWardrobeItemInstance(db, actorA, outfitId, instanceA,);
    const second = await bindWardrobeItemInstance(db, actorA, outfitId, instanceA,);
    expect(second,).toBe(first,);
    expect(await bindingRows(),).toHaveLength(1,);
  });

  it("refuses an instance that exists but belongs to another actor", async () => {
    const foreignInstance = await insertActorItems(db, actorB, "B's sword", ItemCategory.Weapon,);
    await expect(
      bindWardrobeItemInstance(db, actorA, outfitId, foreignInstance,),
    ).rejects.toThrow("Item instance not found in actor inventory",);

    // The rejected bind must not have written a row.
    expect(await bindingRows(),).toHaveLength(1,);
  });

  it("refuses a nonexistent instance id", async () => {
    await expect(
      bindWardrobeItemInstance(db, actorA, outfitId, "instance-that-does-not-exist",),
    ).rejects.toThrow("Item instance not found in actor inventory",);
  });

  it("refuses to bind into an outfit the actor cannot see", async () => {
    const foreignOutfit = await insertWardrobeItems(db, "B's outfit", { actor_id: actorB, },);
    await expect(
      bindWardrobeItemInstance(db, actorA, foreignOutfit, instanceA,),
    ).rejects.toThrow("Wardrobe item not found",);
  });

  it("lists bindings for one outfit and maps rows to camelCase", async () => {
    await bindWardrobeItemInstance(db, actorA, outfitId, instanceA,);
    const bindings = await listWardrobeBindings(db, actorA, outfitId,);
    expect(bindings,).toHaveLength(1,);
    expect(bindings[0],).toEqual({
      id: expect.any(String,),
      actorId: actorA,
      wardrobeItemId: outfitId,
      itemInstanceId: instanceA,
      createdAt: expect.any(String,),
    },);
  });

  it("scopes the listing to the actor — another actor sees no bindings", async () => {
    const bOutfit = await insertWardrobeItems(db, "B outfit", { actor_id: actorB, },);
    const bInstance = await insertActorItems(db, actorB, "B's blade", ItemCategory.Weapon,);
    await bindWardrobeItemInstance(db, actorB, bOutfit, bInstance,);

    // Actor A asking about actor B's outfit gets nothing back.
    expect(await listWardrobeBindings(db, actorA, bOutfit,),).toEqual([],);
    // Actor B sees exactly its own binding.
    expect(await listWardrobeBindings(db, actorB, bOutfit,),).toHaveLength(1,);
  });

  it("unbind removes the row and reports true", async () => {
    const id = await bindWardrobeItemInstance(db, actorA, outfitId, instanceA,);
    expect(await unbindWardrobeItemInstance(db, actorA, id,),).toBe(true,);
    expect(await bindingRows(),).toHaveLength(0,);
    // Second unbind of the same id deletes nothing.
    expect(await unbindWardrobeItemInstance(db, actorA, id,),).toBe(false,);
  });

  it("unbind is actor-scoped — another actor cannot delete the binding", async () => {
    const id = await bindWardrobeItemInstance(db, actorA, outfitId, instanceA,);
    expect(await unbindWardrobeItemInstance(db, actorB, id,),).toBe(false,);
    // The binding survived the foreign delete attempt.
    expect(await bindingRows(),).toHaveLength(1,);
  });

  it("unbind of an unknown id reports false", async () => {
    expect(await unbindWardrobeItemInstance(db, actorA, "no-such-binding",),).toBe(false,);
  });
});
