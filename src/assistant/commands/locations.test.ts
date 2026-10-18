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
import { UserRole, } from "../../db/enums";
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

  // ── Site role (requireWorldAccess) ─────────────────────────
  //
  // Both command sites (locations.ts:29 and :96) branch on
  // can(userRole, "admin.world"), which the matrix grants only to the wildcard
  // roles (admin, solo, tester). Every level is asserted in BOTH directions on
  // ONE existing world, so a regression that dropped the bypass — or the role on
  // the way into the command — cannot pass. The world is created in beforeEach,
  // so the refusals below cannot be passing merely because the world is missing.

  const UNPRIVILEGED = [
    UserRole.Moderator,
    UserRole.Creator,
    UserRole.Player,
    UserRole.User,
    UserRole.Viewer,
    UserRole.Guest,
    UserRole.Bot,
    UserRole.Custom,
  ];

  const caller = async (prefix: string, role: UserRole,): Promise<string> => {
    const id = `${prefix}-${role}-${crypto.randomUUID()}`;
    // username is unique per row, so it has to carry the uuid too.
    await insertUsers(db, id, "Caller", { id, role, },);
    return id;
  };

  test("admin-class roles list another world's locations", async () => {
    await insertLocations(db, otherWorldId, "Foreign Hall", {},);

    for (const role of [UserRole.Admin, UserRole.Solo, UserRole.Tester,]) {
      const callerId = await caller("admin", role,);
      const result = await locList([otherWorldId,], ctx({ userId: callerId, userRole: role, },),);

      expect(result.action,).toBe("loc-list",);
      expect(result.systemMessage,).toContain("Foreign Hall",);
    }
  });

  test("admin-class roles read a location in another world", async () => {
    const foreign = await insertLocations(db, otherWorldId, "Foreign Hall", {},);

    for (const role of [UserRole.Admin, UserRole.Solo, UserRole.Tester,]) {
      const callerId = await caller("admin", role,);
      const result = await locGet([foreign,], ctx({ userId: callerId, userRole: role, },),);

      expect(result.action,).toBe("loc-get",);
      expect(result.systemMessage,).toContain("Foreign Hall",);
    }
  });

  test("/loc-list refuses every unprivileged role the world the admins read", async () => {
    await insertLocations(db, otherWorldId, "Foreign Hall", {},);
    const DENIAL = `World ${otherWorldId} not found or access denied.`;

    for (const role of UNPRIVILEGED) {
      const callerId = await caller("plain", role,);
      const denied = await locList([otherWorldId,], ctx({ userId: callerId, userRole: role, },),);

      expect(denied.systemMessage,).toBe(DENIAL,);
      expect(denied.systemMessage,).not.toContain("Foreign Hall",);
      expect(denied.action,).toBeUndefined();
    }
  });

  test("/loc-get refuses every unprivileged role the world the admins read", async () => {
    const foreign = await insertLocations(db, otherWorldId, "Foreign Hall", {},);
    const DENIAL = `Location ${foreign} not found or access denied.`;

    for (const role of UNPRIVILEGED) {
      const callerId = await caller("plain", role,);
      const denied = await locGet([foreign,], ctx({ userId: callerId, userRole: role, },),);

      expect(denied.systemMessage,).toBe(DENIAL,);
      expect(denied.systemMessage,).not.toContain("Foreign Hall",);
      expect(denied.action,).toBeUndefined();
    }
  });

  test("refuses a null and an unknown role, worded exactly like a missing world or location", async () => {
    const foreign = await insertLocations(db, otherWorldId, "Foreign Hall", {},);
    const missingWorld = `world-${crypto.randomUUID()}`;
    const missingLoc = `loc-${crypto.randomUUID()}`;

    for (const userRole of [null, "wizard",]) {
      const asNothing = ctx({ userId: ownerId, userRole, },);

      // Normalise the id before comparing, exactly as the existence-oracle test
      // above does — the wording is identical, the id is the only difference.
      const listDenied = await locList([otherWorldId,], asNothing,);
      const listAbsent = await locList([missingWorld,], asNothing,);
      expect(listDenied.systemMessage!.replace(otherWorldId, "<id>",),).toBe(
        listAbsent.systemMessage!.replace(missingWorld, "<id>",),
      );

      expect(listDenied.action,).toBeUndefined();

      const getDenied = await locGet([foreign,], asNothing,);
      const getAbsent = await locGet([missingLoc,], asNothing,);
      expect(getDenied.systemMessage!.replace(foreign, "<id>",),).toBe(
        getAbsent.systemMessage!.replace(missingLoc, "<id>",),
      );

      expect(getDenied.systemMessage,).not.toContain("Foreign Hall",);
      expect(getDenied.action,).toBeUndefined();
    }
  });
});
