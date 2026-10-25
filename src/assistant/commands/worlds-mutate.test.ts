// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the world mutation commands: /world-update, /world-delete.
 *
 * The contract under test: ownership is enforced through `requireWorldOwner`,
 * and nothing is persisted by the commands themselves — they only return
 * preview actions the frontend confirms before calling the REST routes.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ActorType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertLocations,
  insertUsers,
  insertWorldLoreEntries,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { type CommandContext, type CommandHandler, getCommand, } from "./registry";
// Importing a named binding from ./worlds-mutate also executes the module and
// registers its command handlers (no separate side-effect import needed).
import { parseWorldUpdates, } from "./worlds-mutate";

function mustGet(name: string,): CommandHandler {
  const handler = getCommand(name,);
  if (!handler) { throw new Error(`command not registered: ${name}`,); }
  return handler;
}

const worldUpdate = mustGet("world-update",);
const worldDelete = mustGet("world-delete",);

describe("world mutation commands", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let otherId: string;
  let worldId: string;

  const ctx = (overrides?: Partial<CommandContext>,): CommandContext => ({
    chatId: "chat-1",
    db,
    userId: ownerId,
    ...overrides,
  });

  beforeAll(async () => {
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  beforeEach(async () => {
    for (const table of ["world_lore_entries", "world_members", "locations", "actors", "worlds", "users",] as const) {
      await db.deleteFrom(table,).execute();
    }

    ownerId = `user-${crypto.randomUUID()}`;
    otherId = `user-${crypto.randomUUID()}`;
    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, },);
    await insertUsers(db, `other-${otherId}`, "Other", { id: otherId, },);
    await insertActors(db, "Owner", { id: ownerId, actor_type: ActorType.User, },);

    worldId = await insertWorlds(db, ownerId, "Emberfall", {
      description: "A world of cinders.",
      lore: "Long lore text.",
      difficulty_modifier: 2,
    },);
  },);

  // ── /world-update ─────────────────────────────────────────

  test("shows usage with no world id", async () => {
    expect((await worldUpdate([], ctx(),)).systemMessage,).toContain("Usage: /world-update",);
  });

  test("returns an update preview carrying the parsed patch, without persisting it", async () => {
    const result = await worldUpdate(
      [worldId, "description=Colder,", "difficultyModifier=3",],
      ctx(),
    );

    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("world-update",);
    expect(result.actionPayload,).toEqual({
      worldId,
      updates: { description: "Colder,", difficultyModifier: 3, },
    },);

    expect(result.systemMessage,).toContain("Emberfall",);
    expect(result.systemMessage,).toContain("**description** → Colder,",);

    // Nothing is persisted by the command — the confirm dialog applies the
    // patch through PUT /api/worlds/:worldId.
    const row = await db.selectFrom("worlds",).selectAll().where("id", "=", worldId,).executeTakeFirst();
    expect(row?.description,).toBe("A world of cinders.",);
    expect(row?.difficulty_modifier,).toBe(2,);
  });

  test("parses quoted values and multiple pairs", () => {
    const parsed = parseWorldUpdates('name="New Name" lore=Short',);
    expect(parsed.ok,).toBe(true,);
    if (parsed.ok) {
      expect(parsed.updates,).toEqual({ name: "New Name", lore: "Short", },);
    }
  });

  test("rejects unknown fields, bad numbers, and bad visibility values", () => {
    for (
      const [input, fragment,] of [
        ["owner_id=x", "Unknown world field",],
        ["difficultyModifier=high", "expects a number",],
        ["visibility=shiny", "Invalid visibility",],
        ["no pairs here", "No updates parsed",],
      ] as const
    ) {
      const parsed = parseWorldUpdates(input,);

      expect(parsed.ok,).toBe(false,);
      if (!parsed.ok) { expect(parsed.error,).toContain(fragment,); }
    }
  });

  test("rejects a caller who does not own the world", async () => {
    const result = await worldUpdate([worldId, "description=nope",], ctx({ userId: otherId, },),);
    expect(result.systemMessage,).toBe(`World ${worldId} not found or not owned by you.`,);
    expect(result.action,).toBeUndefined();
  });

  test("reports a missing world the same way as one the caller does not own", async () => {
    const missing = `world-${crypto.randomUUID()}`;
    const result = await worldUpdate([missing, "description=x",], ctx(),);
    expect(result.systemMessage,).toBe(`World ${missing} not found or not owned by you.`,);
  });

  // ── /world-delete ─────────────────────────────────────────

  test("shows usage with no world id", async () => {
    expect((await worldDelete([], ctx(),)).systemMessage,).toBe("Usage: /world-delete <world-id>",);
  });

  test("returns a delete preview with cascade counts, without deleting anything", async () => {
    await insertLocations(db, worldId, "Ash Gate", {},);
    await insertWorldLoreEntries(db, worldId, "The tide turned to fire.", { name: "Tide", },);

    const result = await worldDelete([worldId,], ctx(),);

    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("world-delete",);
    expect(result.actionPayload,).toEqual({
      worldId,
      cascade: { locations: 1, loreEntries: 1, quests: 0, items: 0, },
    },);

    expect(result.systemMessage,).toContain("removed permanently",);
    expect(result.systemMessage,).toContain("- 1 locations",);
    expect(result.systemMessage,).toContain("- 1 loreEntries",);

    const stillThere = await db.selectFrom("worlds",).select("id",).where("id", "=", worldId,).execute();
    expect(stillThere,).toHaveLength(1,);
  });

  test("reports the empty-cascade note for a bare world", async () => {
    const result = await worldDelete([worldId,], ctx(),);
    expect(result.systemMessage,).toContain("No locations, lore, quests, or items are attached.",);
  });

  test("rejects a caller who does not own the world", async () => {
    const result = await worldDelete([worldId,], ctx({ userId: otherId, },),);
    expect(result.systemMessage,).toBe(`World ${worldId} not found or not owned by you.`,);
    expect(result.action,).toBeUndefined();
  });
});
