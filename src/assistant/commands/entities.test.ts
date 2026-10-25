// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the deterministic B4 mutation commands: /apply, /add, /clone.
 *
 * Every command previews only — the tests pin that nothing is persisted by
 * the handler itself, that the guard is the underlying route's own guard
 * (`requireWorldOwner` for worlds/locations, `checkWorldOwnership` for items),
 * and that "missing" is worded byte-identically to "not owned" so ids cannot
 * be probed as existence oracles.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ItemCategory, UserRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertItems,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import type { CommandContext, CommandHandler, } from "./registry";
import { getCommand, } from "./registry";

// The patch grammar lives in ./entity-patch; the command modules register
// their handlers as a side effect of being imported.
import { parseEntityPatch, } from "./entity-patch";
import "./apply";
import "./clone";
import "./import";
import "./modify";

function mustGet(name: string,): CommandHandler {
  const handler = getCommand(name,);
  if (!handler) { throw new Error(`command not registered: ${name}`,); }
  return handler;
}

const apply = mustGet("apply",);
const add = mustGet("add",);
const clone = mustGet("clone",);

describe("entity mutation commands", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let otherId: string;
  let worldId: string;
  let otherWorldId: string;

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
    for (const table of ["items", "locations", "worlds", "users",] as const) {
      await db.deleteFrom(table,).execute();
    }

    ownerId = `user-${crypto.randomUUID()}`;
    otherId = `user-${crypto.randomUUID()}`;
    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, },);
    await insertUsers(db, `other-${otherId}`, "Other", { id: otherId, },);

    worldId = await insertWorlds(db, ownerId, "Emberfall", {},);
    otherWorldId = await insertWorlds(db, otherId, "Hidden Keep", {},);
  },);

  // ── parseEntityPatch ──────────────────────────────────────

  test("parser rejects unknown fields, bad numbers, bad booleans, and malformed JSON", () => {
    const spec = {
      name: { type: "string" as const, },
      value: { type: "number" as const, },
      stackable: { type: "boolean" as const, },
      properties: { type: "json-object" as const, },
    };

    expect(parseEntityPatch("colour=red", spec, "item",).ok,).toBe(false,);
    expect(parseEntityPatch("value=abc", spec, "item",).ok,).toBe(false,);
    expect(parseEntityPatch("stackable=maybe", spec, "item",).ok,).toBe(false,);
    expect(parseEntityPatch("properties=not-json", spec, "item",).ok,).toBe(false,);
    expect(parseEntityPatch("properties=[1]", spec, "item",).ok,).toBe(false,);
    expect(parseEntityPatch("", spec, "item",).ok,).toBe(false,);

    const bad = parseEntityPatch("colour=red", spec, "item",);
    if (!bad.ok) { expect(bad.error,).toContain("allowed: name, value, stackable, properties",); }
  });

  test("parser rejects values outside a field's allowed set (route coercion tables)", () => {
    const spec = { kind: { type: "string" as const, allowedValues: ["region", "building",], }, };

    const bad = parseEntityPatch("kind=volcano", spec, "location",);
    expect(bad.ok,).toBe(false,);
    if (!bad.ok) {
      expect(bad.error,).toBe('Field "kind" expects one of: region, building — got "volcano".',);
    }

    expect(parseEntityPatch("kind=region", spec, "location",).ok,).toBe(true,);
  });

  test("parser rejects a non-array properties.effects (route would 500 after confirm)", () => {
    const spec = { properties: { type: "json-object" as const, requireEffectsArray: true, }, };

    const bad = parseEntityPatch('properties=\'{"effects":"x"}\'', spec, "item",);
    expect(bad.ok,).toBe(false,);
    if (!bad.ok) {
      expect(bad.error,).toBe(
        'Field "properties" expects "effects" to be a JSON array when present, e.g. properties=\'{"effects":["burn"]}\'.',
      );
    }

    // effects absent, or a real array, both parse.
    expect(parseEntityPatch("properties='{\"bonus\":2}'", spec, "item",).ok,).toBe(true,);
    expect(parseEntityPatch('properties=\'{"effects":["burn"]}\'', spec, "item",).ok,).toBe(true,);
  });

  test("parser is last-wins on repeated keys", () => {
    const spec = { name: { type: "string" as const, }, };
    const dupes = parseEntityPatch("name=First name=Second", spec, "item",);
    expect(dupes.ok,).toBe(true,);
    if (dupes.ok) { expect(dupes.patch.name,).toBe("Second",); }
  });

  test("parser rejects an empty id-bearing field", () => {
    const spec = { parentLocationId: { type: "string" as const, rejectEmpty: true, }, };
    const empty = parseEntityPatch('parentLocationId=""', spec, "location",);
    expect(empty.ok,).toBe(false,);
    if (!empty.ok) { expect(empty.error,).toBe('Field "parentLocationId" expects an id, got "".',); }
  });

  test("parser types numbers, booleans, arrays, and objects", () => {
    const spec = {
      coordX: { type: "number" as const, },
      stackable: { type: "boolean" as const, },
      connections: { type: "json-array" as const, },
      properties: { type: "json-object" as const, },
    };

    const parsed = parseEntityPatch(
      'coordX=3 stackable=true connections=\'["a","b"]\' properties=\'{"bonus":2}\'',
      spec,
      "location",
    );

    expect(parsed.ok,).toBe(true,);
    if (parsed.ok) {
      expect(parsed.patch,).toEqual({
        coordX: 3,
        stackable: true,
        connections: ["a", "b",],
        properties: { bonus: 2, },
      },);
    }
  });

  // ── /apply ────────────────────────────────────────────────

  test("shows usage without kind or id", async () => {
    expect((await apply([], ctx(),)).systemMessage,).toContain("Usage: /apply",);
    expect((await apply(["world",], ctx(),)).systemMessage,).toContain("Usage: /apply",);
  });

  test("rejects a kind outside the v1 scope", async () => {
    const result = await apply(["character", "c1", "name=X",], ctx(),);
    expect(result.systemMessage,).toContain('Unknown entity kind "character"',);
    expect(result.systemMessage,).toContain("world, location, item",);
    expect(result.action,).toBeUndefined();
  });

  test("previews a world patch without persisting it", async () => {
    const result = await apply(["world", worldId, 'name="New Ember"', "scanDepth=80",], ctx(),);

    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("apply-entity",);
    expect(result.actionPayload,).toEqual({
      kind: "world",
      entityId: worldId,
      worldId,
      updates: { name: "New Ember", scanDepth: 80, },
      name: "Emberfall",
    },);

    // The confirm dialog names the world, not the raw id.
    expect(result.systemMessage,).toContain("Emberfall",);
    expect(result.systemMessage,).toContain("**name** → New Ember",);

    const row = await db.selectFrom("worlds",).selectAll().where("id", "=", worldId,).executeTakeFirst();
    expect(row?.name,).toBe("Emberfall",);
  });

  test("previews a location patch, resolving the world from the row", async () => {
    const gate = await insertLocations(db, worldId, "Ash Gate", {},);
    const result = await apply(["location", gate, "coordX=3", 'name="Iron Gate"',], ctx(),);

    expect(result.action,).toBe("apply-entity",);
    expect(result.actionPayload,).toEqual({
      kind: "location",
      entityId: gate,
      worldId,
      updates: { coordX: 3, name: "Iron Gate", },
      name: "Ash Gate",
    },);

    expect(result.systemMessage,).toContain("Ash Gate",);
    expect(result.systemMessage,).toContain("**coordX** → 3",);
    // The PUT route sets updated_at unconditionally — the preview says so.
    expect(result.systemMessage,).toContain("updated_at",);
  });

  test("previews an item patch and guards with the story-items ownership check", async () => {
    const sword = await insertItems(db, worldId, "Iron Sword", ItemCategory.Weapon, { value: 50, },);
    const result = await apply(["item", sword, "value=65", 'description="A keener blade."',], ctx(),);

    expect(result.action,).toBe("apply-entity",);
    expect(result.actionPayload,).toEqual({
      kind: "item",
      entityId: sword,
      worldId,
      updates: { value: 65, description: "A keener blade.", },
      name: "Iron Sword",
    },);

    const row = await db.selectFrom("items",).selectAll().where("id", "=", sword,).executeTakeFirst();
    expect(row?.value,).toBe(50,);
  });

  test("refuses patches on a world the caller does not own, worded like a missing one", async () => {
    const missing = `world-${crypto.randomUUID()}`;

    const denied = await apply(["world", otherWorldId, "name=X",], ctx(),);
    const absent = await apply(["world", missing, "name=X",], ctx(),);

    expect(denied.action,).toBeUndefined();
    expect(denied.systemMessage!.replace(otherWorldId, "<id>",),).toBe(
      absent.systemMessage!.replace(missing, "<id>",),
    );

    expect(denied.systemMessage,).toContain("not found or not owned by you",);
  });

  test("refuses patches on a location the caller does not own, worded like a missing one", async () => {
    const foreign = await insertLocations(db, otherWorldId, "Foreign Hall", {},);
    const missing = `loc-${crypto.randomUUID()}`;

    const denied = await apply(["location", foreign, "name=X",], ctx(),);
    const absent = await apply(["location", missing, "name=X",], ctx(),);

    expect(denied.action,).toBeUndefined();
    expect(denied.systemMessage!.replace(foreign, "<id>",),).toBe(
      absent.systemMessage!.replace(missing, "<id>",),
    );
  });

  test("refuses patches on an item the caller does not own, worded like a missing one", async () => {
    const foreign = await insertItems(db, otherWorldId, "Stolen Blade", ItemCategory.Weapon, {},);
    const missing = `item-${crypto.randomUUID()}`;

    const denied = await apply(["item", foreign, "value=1",], ctx(),);
    const absent = await apply(["item", missing, "value=1",], ctx(),);

    expect(denied.action,).toBeUndefined();
    expect(denied.systemMessage!.replace(foreign, "<id>",),).toBe(
      absent.systemMessage!.replace(missing, "<id>",),
    );
  });

  test("rejects unknown fields and bad numbers before any guard runs", async () => {
    const unknown = await apply(["world", worldId, "colour=red",], ctx(),);
    expect(unknown.systemMessage,).toContain("**Update patch rejected:**",);
    expect(unknown.systemMessage,).toContain('Unknown world field "colour"',);

    const badNumber = await apply(["world", worldId, "scanDepth=abc",], ctx(),);
    expect(badNumber.systemMessage,).toContain('Field "scanDepth" expects a number, got "abc"',);
  });

  test("rejects enum fields outside the route's coercion tables, and non-array effects", async () => {
    // Parse-time rejection: no world access happens, so the id may not exist.
    const badKind = await apply(["world", worldId, "kind=banana",], ctx(),);
    expect(badKind.systemMessage,).toContain('Field "kind" expects one of: rpg, chat — got "banana".',);

    const badVisibility = await apply(["world", worldId, "visibility=everyone",], ctx(),);
    expect(badVisibility.systemMessage,).toContain('Field "visibility" expects one of: public, unlisted, private',);

    const badMobility = await apply(["location", `loc-${crypto.randomUUID()}`, "mobilityMode=spins",], ctx(),);
    expect(badMobility.systemMessage,).toContain('Field "mobilityMode" expects one of: static, free, anchored',);

    const badCategory = await apply(["item", `item-${crypto.randomUUID()}`, "category=junk",], ctx(),);
    expect(badCategory.systemMessage,).toContain('Field "category" expects one of:',);
    expect(badCategory.systemMessage,).toContain('got "junk"',);

    const badEffects = await apply(
      ["item", `item-${crypto.randomUUID()}`, 'properties=\'{"effects":"nope"}\'',],
      ctx(),
    );

    expect(badEffects.systemMessage,).toContain('expects "effects" to be a JSON array when present',);
  });

  test("answers unavailable instead of throwing when ctx has no db", async () => {
    const result = await apply(["world", worldId, "name=X",], { chatId: "chat-1", userId: ownerId, },);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**Worlds unavailable:** command context missing database.",);
  });

  // ── /add ──────────────────────────────────────────────────

  test("shows usage without kind or name", async () => {
    expect((await add([], ctx(),)).systemMessage,).toContain("Usage: /add",);
    expect((await add(["location",], ctx(),)).systemMessage,).toContain("Usage: /add",);
  });

  test("rejects a kind outside the v1 scope", async () => {
    const result = await add(["character", "Bob", worldId,], ctx(),);
    expect(result.systemMessage,).toContain('Unknown entity kind "character"',);
    expect(result.systemMessage,).toContain("location, item",);
  });

  test("asks for a world when neither an argument nor the chat has one", async () => {
    const result = await add(["location", "Tavern",], ctx({ activeChat: { id: "chat-1", }, },),);
    expect(result.systemMessage,).toContain("pass a world-id when the chat has no world",);
  });

  test("previews a new location in the chat's world without persisting it", async () => {
    const result = await add(
      ["location", "Rustic Tavern", 'description="Warm bread."', "coordX=1", "coordY=2",],
      ctx(),
    );

    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("add-entity",);
    expect(result.actionPayload,).toEqual({
      kind: "location",
      worldId,
      name: "Rustic Tavern",
      fields: { description: "Warm bread.", coordX: 1, coordY: 2, },
    },);

    expect(result.systemMessage,).toContain("Rustic Tavern",);

    const rows = await db.selectFrom("locations",).selectAll().where("world_id", "=", worldId,).execute();
    expect(rows,).toEqual([],);
  });

  test("previews a new item with an explicit world argument", async () => {
    const result = await add(
      ["item", "Iron Sword", worldId, "value=25", "stackable=false", "properties='{\"bonus\":2}'",],
      ctx({ activeChat: undefined, },),
    );

    expect(result.action,).toBe("add-entity",);
    expect(result.actionPayload,).toEqual({
      kind: "item",
      worldId,
      name: "Iron Sword",
      fields: { value: 25, stackable: false, properties: { bonus: 2, }, },
    },);
  });

  test("refuses to add into a world the caller does not own, worded like a missing one", async () => {
    const missing = `world-${crypto.randomUUID()}`;

    const denied = await add(["location", "Tavern", otherWorldId,], ctx(),);
    const absent = await add(["location", "Tavern", missing,], ctx(),);
    expect(denied.systemMessage!.replace(otherWorldId, "<id>",),).toBe(
      absent.systemMessage!.replace(missing, "<id>",),
    );

    const itemDenied = await add(["item", "Sword", otherWorldId,], ctx(),);
    expect(itemDenied.action,).toBeUndefined();
    expect(itemDenied.systemMessage,).toContain("not found or not owned by you",);
  });

  test("rejects unknown fields and bad numbers in add extras", async () => {
    const unknown = await add(["item", "Sword", worldId, "weightless=1",], ctx(),);
    expect(unknown.systemMessage,).toContain('Unknown item field "weightless"',);

    const badNumber = await add(["item", "Sword", worldId, "value=abc",], ctx(),);
    expect(badNumber.systemMessage,).toContain('Field "value" expects a number, got "abc"',);
  });

  test("rejects a preview that would hit the route's (worldId, name, category) dedupe", async () => {
    await insertItems(db, worldId, "Iron Sword", ItemCategory.Weapon, {},);
    await insertItems(db, worldId, "Old Relic", ItemCategory.Other, {},);

    // Same tuple as an existing row → rejected BEFORE the user confirms.
    const dup = await add(["item", "Iron Sword", worldId, "category=weapon",], ctx(),);
    expect(dup.action,).toBeUndefined();
    expect(dup.systemMessage,).toContain('an item named "Iron Sword" already exists in world',);
    expect(dup.systemMessage,).toContain('category "weapon"',);

    // Category omitted → the route's enumOr fallback "other" is the dedupe
    // category, so the seeded Other-category relic collides.
    const dupDefault = await add(["item", "Old Relic", worldId,], ctx(),);
    expect(dupDefault.action,).toBeUndefined();
    expect(dupDefault.systemMessage,).toContain('category "other"',);

    // Same name under a DIFFERENT category is inside the route's tuple
    // semantics and still previews.
    const otherCategory = await add(["item", "Iron Sword", worldId, "category=armor",], ctx(),);
    expect(otherCategory.action,).toBe("add-entity",);
  });

  test("answers unavailable instead of throwing when ctx has no db", async () => {
    const result = await add(["location", "Tavern", worldId,], { chatId: "chat-1", userId: ownerId, },);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**Locations unavailable:** command context missing database.",);
  });

  // ── /clone ────────────────────────────────────────────────

  test("shows usage without kind or source id", async () => {
    expect((await clone([], ctx(),)).systemMessage,).toContain("Usage: /clone",);
    expect((await clone(["location",], ctx(),)).systemMessage,).toContain("Usage: /clone",);
  });

  test("rejects a kind outside the v1 scope", async () => {
    const result = await clone(["character", "c1",], ctx(),);
    expect(result.systemMessage,).toContain('Unknown entity kind "character"',);
    expect(result.systemMessage,).toContain("location, item",);
  });

  test("previews a location copy with copied mutable fields and the (copy) suffix", async () => {
    const road = await insertLocations(db, worldId, "Cinder Road", {},);
    const gate = await insertLocations(db, worldId, "Ash Gate", {
      description: "A gate of black iron.",
      kind: "building" as never,
      mobility_mode: "static" as never,
      coord_x: 1,
      coord_z: 3,
    },);

    await db
      .updateTable("locations",)
      .set({ connections: JSON.stringify([road,],), },)
      .where("id", "=", gate,)
      .execute();

    const result = await clone(["location", gate,], ctx(),);

    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("clone-entity",);
    expect(result.actionPayload,).toMatchObject({
      kind: "location",
      sourceId: gate,
      name: "Ash Gate (copy)",
      worldId,
    },);

    const fields = (result.actionPayload!.fields ?? {}) as Record<string, unknown>;
    expect(fields.name,).toBe("Ash Gate (copy)",);
    expect(fields.description,).toBe("A gate of black iron.",);
    expect(fields.connections,).toEqual([road,],);
    expect(fields.coordX,).toBe(1,);
    expect(fields.coordZ,).toBe(3,);
    // The tree position is deliberately not copied.
    expect(fields.parentLocationId,).toBeUndefined();

    // Nothing is persisted by the command.
    const rows = await db.selectFrom("locations",).selectAll().where("world_id", "=", worldId,).execute();
    expect(rows.length,).toBe(2,);
  });

  test("an explicit name= override renames the copy", async () => {
    const gate = await insertLocations(db, worldId, "Ash Gate", {},);
    const result = await clone(["location", gate, 'name="Second Gate"',], ctx(),);

    expect(result.actionPayload!.name,).toBe("Second Gate",);
    expect((result.actionPayload!.fields as Record<string, unknown>).name,).toBe("Second Gate",);
    expect(result.systemMessage,).toContain("Second Gate",);
  });

  test("previews an item copy with the parsed properties object", async () => {
    const sword = await insertItems(db, worldId, "Iron Sword", ItemCategory.Weapon, {
      description: "A blunt blade.",
      rarity: "rare",
      value: 50,
      weight: 3,
      properties: '{"bonus":2}',
    },);

    const result = await clone(["item", sword,], ctx(),);

    expect(result.action,).toBe("clone-entity",);
    expect(result.actionPayload,).toMatchObject({
      kind: "item",
      sourceId: sword,
      name: "Iron Sword (copy)",
      worldId,
    },);

    expect(result.actionPayload!.fields,).toEqual({
      name: "Iron Sword (copy)",
      description: "A blunt blade.",
      category: ItemCategory.Weapon,
      rarity: "rare",
      value: 50,
      weight: 3,
      properties: { bonus: 2, },
    },);
  });

  test("refuses to clone from another world's rows, worded like a missing one", async () => {
    const foreignLoc = await insertLocations(db, otherWorldId, "Foreign Hall", {},);
    const foreignItem = await insertItems(db, otherWorldId, "Stolen Blade", ItemCategory.Weapon, {},);
    const missingLoc = `loc-${crypto.randomUUID()}`;
    const missingItem = `item-${crypto.randomUUID()}`;

    const locDenied = await clone(["location", foreignLoc,], ctx(),);
    const locAbsent = await clone(["location", missingLoc,], ctx(),);
    expect(locDenied.action,).toBeUndefined();
    expect(locDenied.systemMessage!.replace(foreignLoc, "<id>",),).toBe(
      locAbsent.systemMessage!.replace(missingLoc, "<id>",),
    );

    const itemDenied = await clone(["item", foreignItem,], ctx(),);
    const itemAbsent = await clone(["item", missingItem,], ctx(),);
    expect(itemDenied.action,).toBeUndefined();
    expect(itemDenied.systemMessage!.replace(foreignItem, "<id>",),).toBe(
      itemAbsent.systemMessage!.replace(missingItem, "<id>",),
    );
  });

  test("rejects unknown override fields", async () => {
    const gate = await insertLocations(db, worldId, "Ash Gate", {},);
    const result = await clone(["location", gate, "colour=red",], ctx(),);
    expect(result.systemMessage,).toContain("**Clone rejected:**",);
    expect(result.systemMessage,).toContain('Unknown location field "colour"',);
  });

  test("answers unavailable instead of throwing when ctx has no db", async () => {
    const result = await clone(["item", `item-${crypto.randomUUID()}`,], { chatId: "chat-1", userId: ownerId, },);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**Items unavailable:** command context missing database.",);
  });

  // ── Site-role parity with the routes ──────────────────────
  //
  // The guards branch on can(userRole, "admin.world"), which the matrix
  // grants to the wildcard roles (admin, solo, tester). One direction per
  // role class is enough here: the route-level suites own the full matrix.

  test("an admin-class caller patches another user's world", async () => {
    const id = `admin-${UserRole.Admin}-${crypto.randomUUID()}`;
    await insertUsers(db, id, "Admin", { id, role: UserRole.Admin, },);

    const result = await apply(
      ["world", otherWorldId, "name=Adminned",],
      ctx({ userId: id, userRole: UserRole.Admin, },),
    );

    expect(result.action,).toBe("apply-entity",);
    expect(result.actionPayload,).toMatchObject({ kind: "world", entityId: otherWorldId, name: "Hidden Keep", },);
  });

  test("an unprivileged role is refused on another user's world", async () => {
    const id = `plain-${UserRole.Player}-${crypto.randomUUID()}`;
    await insertUsers(db, id, "Player", { id, role: UserRole.Player, },);

    const result = await apply(["world", otherWorldId, "name=X",], ctx({ userId: id, userRole: UserRole.Player, },),);
    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("not found or not owned by you",);
  });
});
