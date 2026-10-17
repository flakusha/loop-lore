// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the location read commands: /loc-list, /loc-get.
 *
 * Both commands resolve a world and then run `requireWorldAccess`, so the tests
 * pin the same guard the world routes use: a caller who cannot read the world
 * is refused, and "no such location" is worded identically to "no access" so
 * location ids cannot be probed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import type { CommandContext, CommandHandler, } from "./registry";
import { getCommand, } from "./registry";

// Side-effect import: the handlers register themselves on module load.
import "./locations";

function mustGet(name: string,): CommandHandler {
  const handler = getCommand(name,);
  if (!handler) { throw new Error(`command not registered: ${name}`,); }
  return handler;
}

const locList = mustGet("loc-list",);
const locGet = mustGet("loc-get",);

describe("location commands", () => {
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
    for (const table of ["locations", "worlds", "users",] as const) {
      await db.deleteFrom(table,).execute();
    }

    ownerId = `user-${crypto.randomUUID()}`;
    otherId = `user-${crypto.randomUUID()}`;
    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, },);
    await insertUsers(db, `other-${otherId}`, "Other", { id: otherId, },);

    worldId = await insertWorlds(db, ownerId, "Emberfall", {},);
    otherWorldId = await insertWorlds(db, otherId, "Hidden Keep", {},);
  },);

  // ── /loc-list ─────────────────────────────────────────────

  test("defaults to the chat's world", async () => {
    await insertLocations(db, worldId, "Ash Gate", {},);
    await insertLocations(db, otherWorldId, "Foreign Hall", {},);

    const result = await locList([], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("loc-list",);
    expect(result.systemMessage,).toContain("Ash Gate",);
    expect(result.systemMessage,).not.toContain("Foreign Hall",);
  });

  test("an explicit world id overrides the chat's world", async () => {
    await insertLocations(db, worldId, "Ash Gate", {},);
    await insertLocations(db, otherWorldId, "Foreign Hall", {},);

    // ownerId does not own otherWorldId, so this is also the denial case.
    const denied = await locList([otherWorldId,], ctx(),);
    expect(denied.systemMessage,).toBe(`World ${otherWorldId} not found or access denied.`,);

    const owned = await locList([worldId,], ctx(),);
    expect(owned.systemMessage,).toContain("Ash Gate",);
  });

  test("shows usage when there is neither an argument nor a chat world", async () => {
    const result = await locList([], ctx({ activeChat: undefined, },),);
    expect(result.systemMessage,).toContain("Usage: /loc-list [world-id]",);
  });

  test("denies a caller who cannot access the world", async () => {
    await insertLocations(db, otherWorldId, "Foreign Hall", {},);
    const result = await locList([otherWorldId,], ctx(),);
    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("access denied",);
  });

  test("reports a world with no locations", async () => {
    expect((await locList([worldId,], ctx(),)).systemMessage,).toBe(`No locations in world ${worldId}.`,);
  });

  test("answers unavailable instead of throwing when ctx has no db", async () => {
    const result = await locList([], { chatId: "chat-1", userId: ownerId, activeChat: { id: "c", worldId, }, },);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**Locations unavailable:** command context missing database.",);
  });

  // ── /loc-get ──────────────────────────────────────────────

  test("shows usage with no location id", async () => {
    expect((await locGet([], ctx(),)).systemMessage,).toBe("Usage: /loc-get <loc-id>",);
  });

  test("returns the location card with its parsed connections", async () => {
    const hall = await insertLocations(db, worldId, "Ash Gate", {
      description: "A gate of black iron.",
      coord_x: 3,
      coord_y: 4,
      coord_z: 0,
    },);

    const road = await insertLocations(db, worldId, "Cinder Road", {},);
    await db
      .updateTable("locations",)
      .set({ connections: JSON.stringify([road,],), },)
      .where("id", "=", hall,)
      .execute();

    const result = await locGet([hall,], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("loc-get",);
    expect(result.systemMessage,).toContain("Ash Gate",);
    expect(result.systemMessage,).toContain("A gate of black iron.",);
    expect(result.systemMessage,).toContain("**Coords:** (3, 4, 0)",);
    expect(result.systemMessage,).toContain("**Connections (1):**",);
    expect(result.actionPayload!.connections as string[],).toEqual([road,],);
  });

  test("renders the empty-state for a location with no coordinates or connections", async () => {
    const hall = await insertLocations(db, worldId, "Ash Gate", {},);
    const result = await locGet([hall,], ctx(),);
    expect(result.systemMessage,).toContain("**Connections (0):**",);
    expect(result.systemMessage,).not.toContain("**Coords:**",);
  });

  test("denies a caller who cannot access the location's world", async () => {
    const foreign = await insertLocations(db, otherWorldId, "Foreign Hall", {},);
    const result = await locGet([foreign,], ctx(),);
    expect(result.systemMessage,).toBe(`Location ${foreign} not found or access denied.`,);
    expect(result.action,).toBeUndefined();
  });

  test("a missing location is worded identically to a denied one", async () => {
    const missing = `loc-${crypto.randomUUID()}`;
    const foreign = await insertLocations(db, otherWorldId, "Foreign Hall", {},);

    const denied = await locGet([foreign,], ctx(),);
    const absent = await locGet([missing,], ctx(),);

    // Same wording, so the id is the only thing that distinguishes the two
    // responses — that is what stops `/loc-get` being an existence oracle.
    expect(absent.systemMessage!.replace(missing, "<id>",),).toBe(denied.systemMessage!.replace(foreign, "<id>",),);
    expect(denied.systemMessage,).toContain("not found or access denied",);
  });

  test("answers unavailable instead of throwing when ctx has no db", async () => {
    const result = await locGet([`loc-${crypto.randomUUID()}`,], { chatId: "chat-1", userId: ownerId, },);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**Locations unavailable:** command context missing database.",);
  });
});
