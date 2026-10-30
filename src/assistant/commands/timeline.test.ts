// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /timeline slash command — list/fork/switch of the chat world's timeline
 * branches. The interesting behaviour is the error paths (no db, unknown
 * subcommand, chat without a bound world, non-owner fork/switch) and that a
 * switch rewrites `chats.timeline_id` — the shared generation branch — using
 * the `prime` slug for the prime row.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ActorType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertUsers,
  insertWorldMembers,
  insertWorlds,
  insertWorldTimelines,
} from "../../test-utils/insert-helpers";
import type { CommandContext, CommandHandler, } from "./registry";
import { getCommand, } from "./registry";

// Side-effect import: the handler registers itself on module load.
import "./timeline";

function mustGet(name: string,): CommandHandler {
  const handler = getCommand(name,);
  if (!handler) { throw new Error(`command not registered: ${name}`,); }
  return handler;
}

const timeline = mustGet("timeline",);

describe("timeline command", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let otherId: string;
  let worldId: string;
  let forkId: string;

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
    for (
      const table of [
        "chats",
        "world_timelines",
        "world_members",
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
    // world_members.actor_id references actors(id); the access guards compare
    // it against ctx.userId, so each caller needs an actor row with that id.
    await insertActors(db, "Owner", { id: ownerId, actor_type: ActorType.User, },);
    await insertActors(db, "Other", { id: otherId, actor_type: ActorType.User, },);

    worldId = await insertWorlds(db, ownerId, "Emberfall", {
      description: "A world of cinders.",
    },);

    await insertWorldTimelines(db, worldId, "Prime", { is_prime: 1, },);
    forkId = await insertWorldTimelines(db, worldId, "Dark-age fork", { is_prime: 0, },);
    await insertChats(db, "Test chat", ownerId, {
      id: "chat-1",
      world_id: worldId,
      timeline_id: "prime",
    },);
  },);

  test("missing db fails closed", async () => {
    const result = await timeline([], { chatId: "chat-1", },);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("missing database",);
  });

  test("unknown subcommand prints usage", async () => {
    const result = await timeline(["merge",], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("Usage",);
  });

  test("chat without a bound world is refused", async () => {
    await insertChats(db, "Free chat", ownerId, { id: "chat-2", world_id: null, },);
    const result = await timeline([], ctx({ chatId: "chat-2", },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("no world bound",);
  });

  test("list marks the active branch and reports the selection", async () => {
    const result = await timeline(["list",], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("timeline-list",);
    expect(result.actionPayload!.worldId,).toBe(worldId,);
    expect(result.actionPayload!.activeTimelineId,).toBe("prime",);
    expect(result.systemMessage,).toContain("Dark-age fork",);
    // The prime row is listed even though the chat uses the `prime` slug.
    expect(result.systemMessage,).toContain("Prime",);
  });

  test("list is denied to a user without world access", async () => {
    const result = await timeline([], ctx({ userId: otherId, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("do not have access",);
  });

  test("fork as owner creates a world_timelines branch", async () => {
    const result = await timeline(["fork", "Second", "age",], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("timeline-fork",);
    const row = await db
      .selectFrom("world_timelines",)
      .select(["id", "name", "is_prime",],)
      .where("id", "=", result.actionPayload!.timelineId as string,)
      .executeTakeFirst();

    expect(row,).toBeDefined();
    expect(row!.name,).toBe("Second age",);
    expect(row!.is_prime,).toBe(0,);
  });

  test("fork is denied to a non-owner with world access", async () => {
    await insertWorldMembers(db, worldId, otherId,);
    const result = await timeline(["fork",], ctx({ userId: otherId, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("only the world owner",);
  });

  test("switch moves the chat's generation branch to the fork", async () => {
    const result = await timeline(["switch", forkId,], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("timeline-switch",);
    expect(result.actionPayload!.timelineId,).toBe(forkId,);
    const chat = await db
      .selectFrom("chats",)
      .select("timeline_id",)
      .where("id", "=", "chat-1",)
      .executeTakeFirst();

    expect(chat!.timeline_id,).toBe(forkId,);
  });

  test("switch back to the prime row uses the prime slug", async () => {
    await db.updateTable("chats",).set({ timeline_id: forkId, },).where("id", "=", "chat-1",).execute();
    const primeRow = await db
      .selectFrom("world_timelines",)
      .select("id",)
      .where("world_id", "=", worldId,)
      .where("is_prime", "=", 1,)
      .executeTakeFirst();

    expect(primeRow,).toBeDefined();
    const result = await timeline(["switch", primeRow!.id,], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.actionPayload!.timelineId,).toBe("prime",);
    const chat = await db
      .selectFrom("chats",)
      .select("timeline_id",)
      .where("id", "=", "chat-1",)
      .executeTakeFirst();

    expect(chat!.timeline_id,).toBe("prime",);
  });

  test("switch with an unknown id is refused", async () => {
    const result = await timeline(["switch", "nope",], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("unknown timeline id",);
  });

  test("switch without an id prints usage", async () => {
    const result = await timeline(["switch",], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("Usage",);
  });
});
