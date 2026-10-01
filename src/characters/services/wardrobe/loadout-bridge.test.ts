// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Loadout bridge tests (TASK-wardrobe-deferred-equipped-items-outfit-auto-mapping-flag-ga).
 *
 * Pins the flag contract:
 *  - flag OFF (absent key or "false"): resolve falls straight through to
 *    the character default — manual behavior preserved.
 *  - flag ON: equipped+bound instances auto-switch, newest binding wins,
 *    unequipped/unbound instances never contribute.
 *  - ladder ordering: chat override > location rule > loadout > default.
 */
import { beforeAll, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { createTestActors, createTestLocation, createTestWorld, } from "../test-helpers";
import { LOADOUT_BRIDGE_FLAG, isLoadoutBridgeEnabled, resolveEquippedOutfit, } from "./loadout-bridge";
import { resolveOutfit, } from "./resolve";

describe("Loadout bridge (flag-gated equipped-items → outfit)", () => {
  let db: Kysely<DB>;
  let actorId: string;
  let worldId: string;
  let locationId: string;
  let chatId: string;
  let armorId: string;
  let robesId: string;
  let courtId: string;

  const now = "2026-10-01T00:00:00.000Z";

  async function setFlag(value: string | null,): Promise<void> {
    await db.deleteFrom("system_config",).where("key", "=", LOADOUT_BRIDGE_FLAG,).execute();
    if (value !== null) {
      await db
        .insertInto("system_config",)
        .values({ key: LOADOUT_BRIDGE_FLAG, value, description: null, created_at: now, updated_at: now, },)
        .execute();
    }
  }

  async function addItem(id: string,): Promise<void> {
    await db
      .insertInto("actor_items",)
      .values({
        id,
        actor_id: actorId,
        name: id,
        description: null,
        item_type: "weapon",
        weight: 1,
        tags: null,
        metadata: null,
      },)
      .execute();
  }

  async function setEquipped(id: string, equipped: boolean,): Promise<void> {
    await db
      .updateTable("actor_items",)
      .set({ equipped: equipped ? "equipped" : "unequipped", },)
      .where("id", "=", id,)
      .execute();
  }

  async function bind(id: string, instanceId: string, outfitId: string, createdAt: string,): Promise<void> {
    await db
      .insertInto("actor_wardrobe",)
      .values({
        id,
        actor_id: actorId,
        wardrobe_item_id: outfitId,
        item_instance_id: instanceId,
        created_at: createdAt,
      },)
      .execute();
  }

  async function addOutfit(id: string, name: string, sortOrder: number,): Promise<void> {
    await db
      .insertInto("wardrobe_items",)
      .values({
        id,
        actor_id: actorId,
        world_id: null,
        name,
        descriptor: name,
        tags: "[]",
        sort_order: sortOrder,
        created_at: now,
        updated_at: now,
      },)
      .execute();
  }

  beforeAll(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    ({ actorId, } = await createTestActors(db, "loadout-actor",));
    worldId = await createTestWorld(db, "loadout-world",);
    locationId = await createTestLocation(db, worldId, "loadout-loc",);
    chatId = "loadout-chat";
    await db
      .insertInto("chats",)
      .values({
        id: chatId,
        name: "Loadout Chat",
        created_by: "test-user",
        world_id: worldId,
        current_location_id: locationId,
      },)
      .execute();

    armorId = "loadout-armor";
    robesId = "loadout-robes";
    courtId = "loadout-court";
    await addOutfit(armorId, "Armor", 0,);
    await addOutfit(robesId, "Robes", 1,);
    await addOutfit(courtId, "Court Dress", 2,);
    await db.updateTable("actors",).set({ default_outfit: robesId, },).where("id", "=", actorId,).execute();

    await addItem("item-sword",);
    await addItem("item-crown",);
  },);

  beforeEach(async () => {
    await db.deleteFrom("chat_wardrobe_overrides",).execute();
    await db.deleteFrom("actor_wardrobe",).execute();
    await db.updateTable("actor_items",).set({ equipped: "unequipped", },).execute();
    await setFlag(null,);
  });

  // ── Flag contract ─────────────────────────────────────────

  it("flag absent = off", async () => {
    expect(await isLoadoutBridgeEnabled(db,),).toBe(false,);
  });

  it('flag "false" = off, flag "true" = on', async () => {
    await setFlag("false",);
    expect(await isLoadoutBridgeEnabled(db,),).toBe(false,);
    await setFlag("true",);
    expect(await isLoadoutBridgeEnabled(db,),).toBe(true,);
  });

  // ── Manual behavior preserved when flag OFF ───────────────

  it("flag OFF: equipped bound instance does not switch — default wins", async () => {
    await setEquipped("item-sword", true,);
    await bind("b1", "item-sword", armorId, "2026-10-01T00:00:01.000Z",);

    const resolved = await resolveOutfit(db, { actorId, worldId, locationId, },);
    expect(resolved.outfitId,).toBe(robesId,);
    expect(resolved.source,).toBe("default",);
  });

  it("flag OFF: resolveEquippedOutfit still derives the mapping (read-side pure)", async () => {
    await setEquipped("item-sword", true,);
    await bind("b1", "item-sword", armorId, "2026-10-01T00:00:01.000Z",);
    expect(await resolveEquippedOutfit(db, actorId,),).toBe(armorId,);
  });

  // ── Flag ON: auto-switch ──────────────────────────────────

  it("flag ON: equipped bound instance auto-switches over default", async () => {
    await setFlag("true",);
    await setEquipped("item-sword", true,);
    await bind("b1", "item-sword", armorId, "2026-10-01T00:00:01.000Z",);

    const resolved = await resolveOutfit(db, { actorId, worldId, locationId, },);
    expect(resolved.outfitId,).toBe(armorId,);
    expect(resolved.source,).toBe("equipped_loadout",);
  });

  it("flag ON: unequipped instance contributes nothing — default wins", async () => {
    await setFlag("true",);
    await bind("b1", "item-sword", armorId, "2026-10-01T00:00:01.000Z",);

    expect(await resolveEquippedOutfit(db, actorId,),).toBeNull();
    const resolved = await resolveOutfit(db, { actorId, worldId, locationId, },);
    expect(resolved.outfitId,).toBe(robesId,);
    expect(resolved.source,).toBe("default",);
  });

  it("flag ON: unbound equipped instance contributes nothing", async () => {
    await setFlag("true",);
    await setEquipped("item-sword", true,);
    expect(await resolveEquippedOutfit(db, actorId,),).toBeNull();
  });

  it("flag ON: newest binding wins (deterministic last-equip ordering)", async () => {
    await setFlag("true",);
    await setEquipped("item-sword", true,);
    await setEquipped("item-crown", true,);
    await bind("b1", "item-sword", armorId, "2026-10-01T00:00:01.000Z",);
    await bind("b2", "item-crown", courtId, "2026-10-01T00:00:02.000Z",);

    expect(await resolveEquippedOutfit(db, actorId,),).toBe(courtId,);

    // Unequip the newest → the older binding takes over.
    await setEquipped("item-crown", false,);
    expect(await resolveEquippedOutfit(db, actorId,),).toBe(armorId,);
  });

  // ── Ladder ordering with the rung active ──────────────────

  it("ladder: chat override beats equipped loadout", async () => {
    await setFlag("true",);
    await setEquipped("item-sword", true,);
    await bind("b1", "item-sword", armorId, "2026-10-01T00:00:01.000Z",);
    await db
      .insertInto("chat_wardrobe_overrides",)
      .values({
        id: "ovr-loadout",
        chat_id: chatId,
        actor_id: actorId,
        outfit_id: courtId,
        created_at: now,
        updated_at: now,
      },)
      .execute();

    const resolved = await resolveOutfit(db, { actorId, chatId, worldId, locationId, },);
    expect(resolved.outfitId,).toBe(courtId,);
    expect(resolved.source,).toBe("chat_override",);
  });

  it("ladder: location rule beats equipped loadout", async () => {
    await setFlag("true",);
    await setEquipped("item-sword", true,);
    await bind("b1", "item-sword", armorId, "2026-10-01T00:00:01.000Z",);
    await db
      .insertInto("world_avatar_config",)
      .values({
        id: "wac-loadout",
        world_id: worldId,
        actor_id: actorId,
        selection_rule_override: null,
        weights_override: null,
        outfit_bindings: JSON.stringify({ [locationId]: courtId, }),
        created_at: now,
        updated_at: now,
      },)
      .execute();

    const resolved = await resolveOutfit(db, { actorId, worldId, locationId, },);
    expect(resolved.outfitId,).toBe(courtId,);
    expect(resolved.source,).toBe("location_rule",);
  });
});
