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
import { ItemCategory, UserRole, } from "../../db/enums";
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

// Named import doubles as the side-effect import: the handlers register
// themselves on module load.
import { parseItemUpdates, } from "./items";

function mustGet(name: string,): CommandHandler {
  const handler = getCommand(name,);
  if (!handler) { throw new Error(`command not registered: ${name}`,); }
  return handler;
}

const itemList = mustGet("item-list",);
const itemGet = mustGet("item-get",);
const itemUpdate = mustGet("item-update",);
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

    // Owner reads it, non-owner does not — same row, same command.
    const denied = await itemGet([itemId,], ctx({ userId: otherId, },),);
    expect(denied.systemMessage,).toBe(`Item ${itemId} not found or access denied.`,);
    expect(denied.systemMessage,).not.toContain("A blunt blade.",);
    expect(denied.action,).toBeUndefined();
  });

  test("ignores an item that lives in another world than the chat", async () => {
    const foreign = await insertItems(db, otherWorldId, "Foreign Blade", ItemCategory.Weapon, {
      description: "A foreign blade.",
    },);

    // Chat is on worldId, item lives in otherWorldId: narrowed out by the query
    // rather than identified and then rejected afterwards.
    const result = await itemGet([foreign,], ctx(),);
    expect(result.systemMessage,).toBe(`Item ${foreign} not found or access denied.`,);
    expect(result.systemMessage,).not.toContain("A foreign blade.",);
    expect(result.action,).toBeUndefined();
  });

  test("still resolves the item's own world when the chat has none", async () => {
    const result = await itemGet([itemId,], ctx({ activeChat: undefined, },),);
    expect(result.action,).toBe("item-get",);
    expect(result.systemMessage,).toContain("**Item:** Iron Sword",);
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

    // A caller who owns neither the world nor the character gets nothing.
    const denied = await inventory([], ctx({ userId: otherId, currentCharacter: { id: charId, name: "Iria", }, },),);
    expect(denied.systemMessage,).toBe(`World ${worldId} not found or access denied.`,);
    expect(denied.systemMessage,).not.toContain("Iron Sword",);
    expect(denied.action,).toBeUndefined();
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

  // ── Site role (checkWorldOwnership) ────────────────────────
  //
  // /item-list is the mirror of the world tests: same command context, but
  // through checkWorldOwnership, whose only branches are owner and
  // can(userRole, "admin.world"). Both directions per role level — without
  // them a pass would prove only that an owner can read.

  test("lets a non-owner with an admin-class role list another world's items", async () => {
    await insertItems(db, otherWorldId, "Foreign Blade", ItemCategory.Weapon, {},);

    for (const role of [UserRole.Admin, UserRole.Solo, UserRole.Tester,]) {
      const callerId = `admin-${role}-${crypto.randomUUID()}`;
      await insertUsers(db, `admin-${role}`, "Admin", { id: callerId, role, },);

      const result = await itemList(
        [otherWorldId,],
        ctx({ userId: callerId, userRole: role, activeChat: { id: "chat-1", worldId: otherWorldId, }, },),
      );

      expect(result.action,).toBe("item-list",);
      expect(result.systemMessage,).toContain("Foreign Blade",);
    }
  });

  test("lets a non-owner with an admin-class role read an item and an inventory it does not own", async () => {
    const foreign = await insertItems(db, otherWorldId, "Foreign Blade", ItemCategory.Weapon, {},);
    const foreignChar = await insertActors(db, "Vex", { actor_type: "character", owner_id: otherId, },);
    await insertWorldItems(db, otherWorldId, foreign, { owner_actor_id: foreignChar, quantity: 4, },);
    const inWorld = { id: "chat-1", worldId: otherWorldId, };

    // /item-get and /inventory reach checkWorldOwnership through items.ts:80 and
    // :140 — separate call sites from the /item-list one at :34, each needing its
    // own proof that the role still arrives.
    for (const role of [UserRole.Admin, UserRole.Solo, UserRole.Tester,]) {
      const callerId = `admin-${role}-${crypto.randomUUID()}`;
      await insertUsers(db, `admin-${role}`, "Admin", { id: callerId, role, },);
      const asRole = ctx({ userId: callerId, userRole: role, activeChat: inWorld, },);

      const got = await itemGet([foreign,], asRole,);
      expect(got.action,).toBe("item-get",);
      expect(got.systemMessage,).toContain("Foreign Blade",);

      const inv = await inventory([foreignChar,], asRole,);
      expect(inv.action,).toBe("inventory",);
      expect(inv.systemMessage,).toContain("Foreign Blade",);
    }
  });

  test("refuses every unprivileged role the same world the admins read", async () => {
    await insertItems(db, otherWorldId, "Foreign Blade", ItemCategory.Weapon, {},);
    const inWorld = { id: "chat-1", worldId: otherWorldId, };
    const DENIAL = `World ${otherWorldId} not found or access denied.`;

    // The same existing world the allow test above reads, so these refusals
    // cannot pass merely because the world happens to be missing.
    for (
      const role of [
        UserRole.Moderator,
        UserRole.Creator,
        UserRole.Player,
        UserRole.User,
        UserRole.Viewer,
        UserRole.Guest,
        UserRole.Bot,
        UserRole.Custom,
      ]
    ) {
      const callerId = `plain-${role}-${crypto.randomUUID()}`;
      await insertUsers(db, `plain-${role}`, "Plain", { id: callerId, role, },);

      const denied = await itemList([otherWorldId,], ctx({ userId: callerId, userRole: role, activeChat: inWorld, },),);
      expect(denied.systemMessage,).toBe(DENIAL,);
      expect(denied.action,).toBeUndefined();
    }

    // No resolved role at all — the fail-closed default for anonymous,
    // deactivated, and unresolvable callers.
    const plainId = `plain-${crypto.randomUUID()}`;
    await insertUsers(db, `plain-${plainId}`, "Plain", { id: plainId, role: UserRole.User, },);

    const asNobody = await itemList([otherWorldId,], ctx({ userId: plainId, userRole: null, activeChat: inWorld, },),);
    expect(asNobody.systemMessage,).toBe(DENIAL,);
    expect(asNobody.action,).toBeUndefined();

    // A role string outside the enum. can() has no entry for it, so it must
    // behave exactly like no role at all.
    const bogus = await itemList([otherWorldId,], ctx({ userId: plainId, userRole: "wizard", activeChat: inWorld, },),);
    expect(bogus.systemMessage,).toBe(DENIAL,);
    expect(bogus.action,).toBeUndefined();
  });

  // ── /item-update ──────────────────────────────────────────

  test("shows usage with no item id", async () => {
    expect((await itemUpdate([], ctx(),)).systemMessage,).toContain("Usage: /item-update <item-id>",);
  });

  test("previews allowed fields with the item's world", async () => {
    const result = await itemUpdate([itemId, 'name="Iron Sword Mk2"', "value=75", "weight=3.5",], ctx(),);

    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("item-update",);
    expect(result.systemMessage,).toContain("Iron Sword",);
    expect(result.systemMessage,).toContain("name",);

    const payload = result.actionPayload as Record<string, unknown>;
    expect(payload.itemId,).toBe(itemId,);
    expect(payload.worldId,).toBe(worldId,);
    expect(payload.name,).toBe("Iron Sword",);
    expect(payload.updates,).toEqual({ name: "Iron Sword Mk2", value: 75, weight: 3.5, },);
  });

  test("previews a JSON properties object", async () => {
    const result = await itemUpdate([itemId, 'properties={"damage":"1d6"}',], ctx(),);
    const payload = result.actionPayload as Record<string, unknown>;
    expect(payload.updates,).toEqual({ properties: { damage: "1d6", }, },);
  });

  test("denies an item in a world the caller does not own", async () => {
    const foreign = await insertItems(db, otherWorldId, "Foreign Blade", ItemCategory.Weapon, {},);
    const result = await itemUpdate([foreign, "name=Hijack",], ctx(),);
    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toBe(`Item ${foreign} not found or access denied.`,);
  });

  test("a missing item is worded identically to a denied one", async () => {
    const foreign = await insertItems(db, otherWorldId, "Foreign Blade", ItemCategory.Weapon, {},);
    const missingId = `item-${crypto.randomUUID()}`;

    const denied = await itemUpdate([foreign, "name=Hijack",], ctx(),);
    const absent = await itemUpdate([missingId, "name=Ghost",], ctx(),);

    expect(absent.systemMessage!.replace(missingId, "<id>",),).toBe(denied.systemMessage!.replace(foreign, "<id>",),);
  });

  test("ignores an item that lives in another world than the chat", async () => {
    const foreign = await insertItems(db, otherWorldId, "Foreign Blade", ItemCategory.Weapon, {},);
    const result = await itemUpdate([foreign, "name=Hijack",], ctx(),);
    expect(result.systemMessage,).toBe(`Item ${foreign} not found or access denied.`,);
    expect(result.action,).toBeUndefined();
  });

  test("rejects unknown fields, bad numbers and bad properties JSON", async () => {
    const unknown = await itemUpdate([itemId, "durability=9",], ctx(),);
    expect(unknown.action,).toBeUndefined();
    expect(unknown.systemMessage,).toContain("Unknown item field",);
    expect(unknown.systemMessage,).toContain("durability",);

    const badNumber = await itemUpdate([itemId, "value=priceless",], ctx(),);
    expect(badNumber.systemMessage,).toContain('expects a number, got "priceless"',);

    const badProps = await itemUpdate([itemId, "properties=[1,2]",], ctx(),);
    expect(badProps.systemMessage,).toContain('Field "properties" expects a JSON object',);
  });

  test("reports missing context instead of throwing", async () => {
    expect(
      (await itemUpdate([itemId, "name=X",], {
        chatId: "chat-1",
        userId: ownerId,
        activeChat: { id: "c", worldId, },
      },)).systemMessage,
    ).toContain("**Items unavailable:** command context missing database.",);
  });

  test("lets a non-owner with an admin-class role preview an update", async () => {
    const foreign = await insertItems(db, otherWorldId, "Foreign Blade", ItemCategory.Weapon, {},);
    const callerId = `admin-${crypto.randomUUID()}`;
    await insertUsers(db, "admin-item-update", "Admin", { id: callerId, role: UserRole.Admin, },);

    const result = await itemUpdate(
      [foreign, "name=Renamed",],
      ctx({ userId: callerId, userRole: UserRole.Admin, activeChat: { id: "chat-1", worldId: otherWorldId, }, },),
    );

    expect(result.action,).toBe("item-update",);
    const payload = result.actionPayload as Record<string, unknown>;
    expect(payload.worldId,).toBe(otherWorldId,);
  });

  test("parseItemUpdates: last-wins on repeated keys and ignores non-pairs", async () => {
    const parsed = parseItemUpdates('description="one" nonsense description="two"',);
    expect(parsed,).toEqual({ ok: true, updates: { description: "two", }, },);

    const empty = parseItemUpdates("no pairs here",);
    expect(empty,).toEqual({ ok: false, error: expect.stringContaining("No updates parsed",), },);
  });
});
