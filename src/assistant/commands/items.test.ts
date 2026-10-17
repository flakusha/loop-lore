// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the item read commands: /item-list, /item-get, /inventory.
 *
 * Item data is world-scoped and owner-scoped, so every test that asserts a
 * successful read is paired with one asserting `checkWorldOwnership` refuses a
 * caller who does not own the world.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ItemCategory, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertItems,
  insertLocations,
  insertUsers,
  insertWorldItems,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import type { CommandContext, CommandHandler, } from "./registry";
import { getCommand, } from "./registry";

// Side-effect import: the handlers register themselves on module load.
import "./items";

function mustGet(name: string,): CommandHandler {
  const handler = getCommand(name,);
  if (!handler) { throw new Error(`command not registered: ${name}`,); }
  return handler;
}

const itemList = mustGet("item-list",);
const itemGet = mustGet("item-get",);
const inventory = mustGet("inventory",);

describe("item commands", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let otherId: string;
  let worldId: string;
  let otherWorldId: string;
  let itemId: string;
  let charId: string;

  const ctx = (overrides?: Partial<CommandContext>,): CommandContext => ({
    chatId: "chat-1",
    db,
    userId: ownerId,
    activeChat: { id: "chat-1", worldId, },
    ...overrides,
  });

  beforeAll(async () => {
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  beforeEach(async () => {
    for (const table of ["world_items", "items", "locations", "actors", "worlds", "users",] as const) {
      await db.deleteFrom(table,).execute();
    }

    ownerId = `user-${crypto.randomUUID()}`;
    otherId = `user-${crypto.randomUUID()}`;
    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, },);
    await insertUsers(db, `other-${otherId}`, "Other", { id: otherId, },);

    worldId = await insertWorlds(db, ownerId, "Emberfall", {},);
    otherWorldId = await insertWorlds(db, otherId, "Hidden Keep", {},);

    charId = await insertActors(db, "Iria", { actor_type: "character", owner_id: ownerId, },);
    itemId = await insertItems(db, worldId, "Iron Sword", ItemCategory.Weapon, {
      description: "A blunt blade.",
      rarity: "rare",
      value: 50,
      weight: 3,
    },);
  },);

  // ── /item-list ────────────────────────────────────────────

  test("defaults to the chat's world and lists its definitions", async () => {
    await insertItems(db, otherWorldId, "Foreign Blade", ItemCategory.Weapon, {},);

    const result = await itemList([], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("item-list",);
    expect(result.systemMessage,).toContain("Iron Sword",);
    expect(result.systemMessage,).toContain("rare",);
    expect(result.systemMessage,).not.toContain("Foreign Blade",);
  });

  test("denies a caller who does not own the world", async () => {
    await insertItems(db, otherWorldId, "Foreign Blade", ItemCategory.Weapon, {},);
    const result = await itemList([otherWorldId,], ctx(),);
    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toBe(`World ${otherWorldId} not found or access denied.`,);
  });

  test("shows usage when there is neither an argument nor a chat world", async () => {
    expect((await itemList([], ctx({ activeChat: undefined, },),)).systemMessage,).toContain(
      "Usage: /item-list [world-id]",
    );
  });

  test("reports a world with no definitions", async () => {
    await db.deleteFrom("items",).execute();
    expect((await itemList([], ctx(),)).systemMessage,).toBe(`No item definitions in world ${worldId}.`,);
  });

  test("answers unavailable instead of throwing when ctx has no db", async () => {
    const result = await itemList([], { chatId: "chat-1", userId: ownerId, activeChat: { id: "c", worldId, }, },);
    expect(result.systemMessage,).toContain("**Items unavailable:** command context missing database.",);
  });

  // ── /item-get ─────────────────────────────────────────────

  test("shows usage with no item id", async () => {
    expect((await itemGet([], ctx(),)).systemMessage,).toBe("Usage: /item-get <item-id>",);
  });

  test("returns the definition and the world's placed copies", async () => {
    const hall = await insertLocations(db, worldId, "Ash Gate", {},);
    await insertWorldItems(db, worldId, itemId, { location_id: hall, quantity: 2, },);
    await insertWorldItems(db, worldId, itemId, { owner_actor_id: charId, quantity: 1, },);

    const result = await itemGet([itemId,], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("item-get",);
    expect(result.systemMessage,).toContain("**Item:** Iron Sword",);
    expect(result.systemMessage,).toContain("A blunt blade.",);
    expect(result.systemMessage,).toContain("**Value:** 50 · **Weight:** 3",);
    expect(result.systemMessage,).toContain("**Instances (2):**",);
    expect(result.systemMessage,).toContain(`actor ${charId}`,);
  });

  test("renders the empty-state for a definition with no placed copies", async () => {
    const result = await itemGet([itemId,], ctx(),);
    expect(result.systemMessage,).toContain("no placed copies",);
  });

  test("denies an item in a world the caller does not own", async () => {
    const foreign = await insertItems(db, otherWorldId, "Foreign Blade", ItemCategory.Weapon, {},);
    const result = await itemGet([foreign,], ctx(),);
    expect(result.systemMessage,).toBe(`Item ${foreign} not found or access denied.`,);
    expect(result.action,).toBeUndefined();
  });

  test("a missing item is worded identically to a denied one", async () => {
    const foreign = await insertItems(db, otherWorldId, "Foreign Blade", ItemCategory.Weapon, {},);
    const missingId = `item-${crypto.randomUUID()}`;

    const denied = await itemGet([foreign,], ctx(),);
    const absent = await itemGet([missingId,], ctx(),);

    expect(absent.systemMessage!.replace(missingId, "<id>",),).toBe(denied.systemMessage!.replace(foreign, "<id>",),);
  });

  test("answers unavailable instead of throwing when ctx has no db", async () => {
    const result = await itemGet([itemId,], { chatId: "chat-1", userId: ownerId, },);
    expect(result.systemMessage,).toContain("**Items unavailable:** command context missing database.",);
  });

  // ── /inventory ────────────────────────────────────────────

  test("defaults to the chat's current character", async () => {
    await insertWorldItems(db, worldId, itemId, { owner_actor_id: charId, quantity: 3, },);

    const result = await inventory([], ctx({ currentCharacter: { id: charId, name: "Iria", }, },),);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("inventory",);
    expect(result.systemMessage,).toContain("x3 **Iron Sword**",);
    expect(result.actionPayload!.charId,).toBe(charId,);
  });

  test("an explicit char id overrides the current character", async () => {
    const otherChar = await insertActors(db, "Bram", { actor_type: "character", owner_id: ownerId, },);
    await insertWorldItems(db, worldId, itemId, { owner_actor_id: otherChar, quantity: 7, },);

    const result = await inventory([otherChar,], ctx(),);
    expect(result.systemMessage,).toContain("x7 **Iron Sword**",);
  });

  test("shows usage when there is neither an argument nor a current character", async () => {
    expect((await inventory([], ctx(),)).systemMessage,).toContain("Usage: /inventory [char-id]",);
  });

  test("reports when the chat has no world", async () => {
    const result = await inventory([charId,], ctx({ activeChat: undefined, },),);
    expect(result.systemMessage,).toBe("**Inventory unavailable:** the chat is not attached to a world.",);
  });

  test("denies a caller who does not own the world", async () => {
    const result = await inventory([charId,], ctx({ activeChat: { id: "chat-1", worldId: otherWorldId, }, },),);
    expect(result.systemMessage,).toBe(`World ${otherWorldId} not found or access denied.`,);
    expect(result.action,).toBeUndefined();
  });

  test("reports an empty inventory", async () => {
    expect((await inventory([charId,], ctx(),)).systemMessage,).toBe(`Nothing carried by ${charId}.`,);
  });

  test("answers unavailable instead of throwing when ctx has no db", async () => {
    const result = await inventory([charId,], {
      chatId: "chat-1",
      userId: ownerId,
      activeChat: { id: "c", worldId, },
    },);

    expect(result.systemMessage,).toContain("**Items unavailable:** command context missing database.",);
  });
});
