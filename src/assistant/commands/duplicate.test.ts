// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `/duplicate` and the entity adapters it loads through: guarded
 * loads for all four kinds, the `--with`/`--as` override grammar, the
 * preview action payload, and access denial for non-owned sources.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import type { CommandContext, CommandHandler, } from "./registry";
import { getCommand, } from "./registry";

// Side-effect import: the duplicate handler registers itself.
import "./duplicate";

function mustGet(name: string,): CommandHandler {
  const handler = getCommand(name,);
  if (!handler) { throw new Error(`command not registered: ${name}`,); }
  return handler;
}

const duplicate = mustGet("duplicate",);

describe("/duplicate", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let otherId: string;
  let worldId: string;
  let actorId: string;
  let locationId: string;
  let itemId: string;
  let worldName: string;

  const ownerCtx = (userId = ownerId,): CommandContext => ({
    chatId: "chat-1",
    db,
    userId,
    activeChat: { id: "chat-1", worldId, },
  });

  beforeAll(async () => {
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  beforeEach(async () => {
    for (
      const table of [
        "items",
        "locations",
        "actors",
        "worlds",
        "users",
      ] as const
    ) {
      await db.deleteFrom(table,).execute();
    }

    ownerId = `user-${crypto.randomUUID()}`;
    otherId = `user-${crypto.randomUUID()}`;
    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, },);
    await insertUsers(db, `other-${otherId}`, "Other", { id: otherId, },);

    worldName = "Source World";
    worldId = await insertWorlds(db, ownerId, worldName, { description: "A test world.", lore: "Ancient lore.", },);

    actorId = `actor-${crypto.randomUUID()}`;
    await db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "character",
        display_name: "Iria",
        owner_id: ownerId,
        agent_type: "none",
        settings: "{}",
        row_version: 0,
        visibility: "private",
        import_spec: "{}",
        description: "A guard.",
        personality: "Steadfast",
      },)
      .execute();

    locationId = `loc-${crypto.randomUUID()}`;
    await db
      .insertInto("locations",)
      .values({ id: locationId, world_id: worldId, name: "Tide Gate", kind: "building", mobility_mode: "static", },)
      .execute();

    itemId = `item-${crypto.randomUUID()}`;
    await db
      .insertInto("items",)
      .values({ id: itemId, world_id: worldId, name: "Tide Charm", category: "armor", rarity: "common", },)
      .execute();
  },);

  test("usage message without kind and id", async () => {
    const res = await duplicate([], ownerCtx(),);
    expect(res.systemMessage,).toContain("Usage",);
  });

  test("unknown kind is rejected", async () => {
    const res = await duplicate(["npc", "x",], ownerCtx(),);
    expect(res.systemMessage,).toContain("Unknown entity kind",);
  });

  test("duplicates a character with copied fields and --with override", async () => {
    const res = await duplicate(
      ["character", actorId, "--with", "personality=cautious", "--as", "Iria II",],
      ownerCtx(),
    );

    expect(res.handled,).toBe(true,);
    expect(res.action,).toBe("duplicate-entity",);
    expect(res.actionPayload?.kind,).toBe("character",);
    expect(res.actionPayload?.name,).toBe("Iria II",);
    expect(res.actionPayload?.worldId,).toBeNull();
    const fields = res.actionPayload?.fields as Record<string, unknown>;
    expect(fields.description,).toBe("A guard.",);
    expect(fields.personality,).toBe("cautious",);
    expect(res.systemMessage,).toContain("Overridden: `personality`",);
  });

  test("duplicates a world with copied lore and default copy name", async () => {
    const res = await duplicate(["world", worldId,], ownerCtx(),);
    expect(res.actionPayload?.name,).toBe(`${worldName} (copy)`,);
    const fields = res.actionPayload?.fields as Record<string, unknown>;
    expect(fields.lore,).toBe("Ancient lore.",);
    expect(res.systemMessage,).toContain("No overrides",);
  });

  test("duplicates a location without parentLocationId", async () => {
    const res = await duplicate(["location", locationId, "--as", "Mirror Gate",], ownerCtx(),);
    expect(res.actionPayload?.worldId,).toBe(worldId,);
    const fields = res.actionPayload?.fields as Record<string, unknown>;
    expect(fields.name,).toBe("Mirror Gate",);
    expect(Object.hasOwn(fields, "parentLocationId",),).toBe(false,);
  });

  test("duplicates an item with copied definition fields", async () => {
    const res = await duplicate(["item", itemId, "--with", "rarity=legendary",], ownerCtx(),);
    const fields = res.actionPayload?.fields as Record<string, unknown>;
    expect(fields.rarity,).toBe("legendary",);
    expect(fields.category,).toBe("armor",);
  });

  test("denies a non-owned source", async () => {
    const res = await duplicate(["world", worldId,], ownerCtx(otherId,),);
    expect(res.systemMessage,).toContain("not found or not owned by you",);
    expect(res.action,).toBeUndefined();
  });

  test("rejects an invalid override value", async () => {
    const res = await duplicate(["item", itemId, "--with", "rarity=not-a-rarity",], ownerCtx(),);
    expect(res.systemMessage,).toContain("Duplicate rejected",);
    expect(res.action,).toBeUndefined();
  });
});
