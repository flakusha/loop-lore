// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the world access commands: /world-list, /world-get.
 *
 * The interesting behaviour is the visibility filter — owned, public, and
 * joined worlds are in; another user's private world is out — and the fact
 * that `/world-get` refuses the same world `/world-list` will not show.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ActorType, UserRole, WorldVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertLocations,
  insertUsers,
  insertWorldLoreEntries,
  insertWorldMembers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import type { CommandContext, CommandHandler, } from "./registry";
import { getCommand, } from "./registry";

// Side-effect import: the handlers register themselves on module load.
import "./worlds-access";

function mustGet(name: string,): CommandHandler {
  const handler = getCommand(name,);
  if (!handler) { throw new Error(`command not registered: ${name}`,); }
  return handler;
}

const worldList = mustGet("world-list",);
const worldGet = mustGet("world-get",);

describe("world access commands", () => {
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
    // world_members.actor_id references actors(id); requireWorldAccess compares
    // it against ctx.userId, so the caller needs an actor row with that id.
    await insertActors(db, "Owner", { id: ownerId, actor_type: ActorType.User, },);

    worldId = await insertWorlds(db, ownerId, "Emberfall", {
      description: "A world of cinders.",
      lore: "Long lore text.",
      difficulty_modifier: 2,
    },);
  },);

  // ── /world-list ───────────────────────────────────────────

  test("lists the worlds the caller owns", async () => {
    const result = await worldList([], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("world-list",);
    expect(result.systemMessage,).toContain("Emberfall",);
    expect(result.systemMessage,).toContain("_(yours)_",);
    expect(result.actionPayload!.worlds as unknown[],).toHaveLength(1,);
  });

  test("includes another user's public world but hides their private one", async () => {
    await insertWorlds(db, otherId, "Open Sky", { visibility: WorldVisibility.Public, },);
    await insertWorlds(db, otherId, "Hidden Keep", { visibility: WorldVisibility.Private, },);

    const result = await worldList([], ctx(),);
    expect(result.systemMessage,).toContain("Open Sky",);
    expect(result.systemMessage,).not.toContain("Hidden Keep",);
  });

  test("includes a private world the caller is a member of", async () => {
    const memberWorld = await insertWorlds(db, otherId, "Joined Hall", {
      visibility: WorldVisibility.Private,
    },);

    await insertWorldMembers(db, memberWorld, ownerId,);

    expect((await worldList([], ctx(),)).systemMessage,).toContain("Joined Hall",);
    // ...and a member who leaves the world stops seeing it.
    await db.deleteFrom("world_members",).execute();
    expect((await worldList([], ctx(),)).systemMessage,).not.toContain("Joined Hall",);
  });

  test("an unauthenticated caller sees public worlds only", async () => {
    await insertWorlds(db, otherId, "Open Sky", { visibility: WorldVisibility.Public, },);

    const result = await worldList([], ctx({ userId: undefined, },),);
    expect(result.systemMessage,).toContain("Open Sky",);
    expect(result.systemMessage,).not.toContain("Emberfall",);
  });

  test("reports an empty result", async () => {
    await db.deleteFrom("worlds",).execute();
    expect((await worldList([], ctx(),)).systemMessage,).toBe("No worlds found.",);
  });

  test("answers unavailable instead of throwing when ctx has no db", async () => {
    const result = await worldList([], { chatId: "chat-1", userId: ownerId, },);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**Worlds unavailable:** command context missing database.",);
  });

  // ── /world-get ────────────────────────────────────────────

  test("shows usage with no world id", async () => {
    expect((await worldGet([], ctx(),)).systemMessage,).toBe("Usage: /world-get <world-id>",);
  });

  test("returns world details, its locations and its lore entries", async () => {
    await insertLocations(db, worldId, "Ash Gate", {},);
    await insertWorldLoreEntries(db, worldId, "The tide turned to fire.", { name: "Tide", },);

    const result = await worldGet([worldId,], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("world-get",);
    expect(result.systemMessage,).toContain("Emberfall",);
    expect(result.systemMessage,).toContain("Difficulty:** 2",);
    expect(result.systemMessage,).toContain("A world of cinders.",);
    expect(result.systemMessage,).toContain("Ash Gate",);
    expect(result.systemMessage,).toContain("Tide",);
    expect(result.actionPayload!.locations as unknown[],).toHaveLength(1,);
  });

  test("renders the empty-state lists for a world with nothing in it", async () => {
    const result = await worldGet([worldId,], ctx(),);
    expect(result.systemMessage,).toContain("**Locations (0):**",);
    expect(result.systemMessage,).toContain("**Lore entries (0):**",);
  });

  test("denies a caller who cannot access the world", async () => {
    const hidden = await insertWorlds(db, otherId, "Hidden Keep", {
      visibility: WorldVisibility.Private,
    },);

    // ownerId owns a different world and is not a member of this one.
    const result = await worldGet([hidden,], ctx(),);
    expect(result.systemMessage,).toBe(`World ${hidden} not found or access denied.`,);
    expect(result.action,).toBeUndefined();
  });

  test("reports a missing world the same way as an inaccessible one", async () => {
    const missing = `world-${crypto.randomUUID()}`;
    const result = await worldGet([missing,], ctx(),);
    expect(result.systemMessage,).toBe(`World ${missing} not found or access denied.`,);
  });

  test("answers unavailable instead of throwing when ctx has no db", async () => {
    const result = await worldGet([worldId,], { chatId: "chat-1", userId: ownerId, },);
    expect(result.systemMessage,).toContain("**Worlds unavailable:** command context missing database.",);
  });

  // ── Site role (requireWorldAccess) ─────────────────────────
  //
  // requireWorldAccess grants its privileged branch on
  // can(userRole, "admin.world"), which the permission matrix grants only to
  // the roles carrying the wildcard grant (admin, solo, tester). Every level
  // is asserted in BOTH directions — allowed AND refused — so widening the
  // matrix, or losing the role on the way into the command, cannot pass
  // unnoticed.

  /** A private world owned by `otherId`; nobody but its owner can read it. */
  const sealedWorld = async (): Promise<string> =>
    await insertWorlds(db, otherId, "Sealed Vault", { visibility: WorldVisibility.Private, },);

  test("admin-class roles read a private world; that same world is refused to everyone else", async () => {
    const secret = await sealedWorld();
    const DENIAL = `World ${secret} not found or access denied.`;

    for (const role of [UserRole.Admin, UserRole.Solo, UserRole.Tester,]) {
      const callerId = `admin-${role}-${crypto.randomUUID()}`;
      await insertUsers(db, `admin-${role}`, "Admin", { id: callerId, role, },);

      const result = await worldGet([secret,], ctx({ userId: callerId, userRole: role, },),);
      expect(result.action,).toBe("world-get",);
      expect(result.systemMessage,).toContain("Sealed Vault",);
    }

    // DENY: every role the matrix does not bless, on that same world id.
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

      const denied = await worldGet([secret,], ctx({ userId: callerId, userRole: role, },),);
      expect(denied.systemMessage,).toBe(DENIAL,);
      expect(denied.action,).toBeUndefined();
    }

    // DENY: no resolved role at all — the fail-closed default for anonymous,
    // deactivated, and unresolvable callers. ownerId owns a different world,
    // so ownership cannot carry this one; only the role ever could have.
    const nobody = await worldGet([secret,], ctx({ userId: ownerId, userRole: null, },),);
    expect(nobody.systemMessage,).toBe(DENIAL,);
    expect(nobody.action,).toBeUndefined();

    // DENY: a role string outside the enum. can() has no entry for it, so it
    // must behave exactly like no role at all.
    const bogus = await worldGet([secret,], ctx({ userId: ownerId, userRole: "wizard", },),);
    expect(bogus.systemMessage,).toBe(DENIAL,);
    expect(bogus.action,).toBeUndefined();
  });

  test("still lets the world owner in with no role resolved", async () => {
    // Ownership is compared against userId, not the role, so a caller who
    // owns the world keeps access even when their role cannot be resolved.
    const result = await worldGet([worldId,], ctx({ userId: ownerId, userRole: null, },),);
    expect(result.action,).toBe("world-get",);
    expect(result.systemMessage,).toContain("Emberfall",);
  });
});
