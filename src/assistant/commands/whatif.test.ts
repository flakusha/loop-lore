// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /whatif slash command — hypothetical beat simulation on the chat's bound
 * world timeline. Mirrors the /timeline test scope: error paths (no db, no
 * hypothetical, chat without a bound world, no world access), the happy path
 * rendering simulated beats, and the divergence summary on a non-prime branch.
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
  insertWorlds,
  insertWorldTimelines,
} from "../../test-utils/insert-helpers";
import type { CommandContext, CommandHandler, } from "./registry";
import { getCommand, } from "./registry";

// Side-effect import: the handler registers itself on module load.
import "./whatif";

function mustGet(name: string,): CommandHandler {
  const handler = getCommand(name,);
  if (!handler) { throw new Error(`command not registered: ${name}`,); }
  return handler;
}

const whatif = mustGet("whatif",);

describe("whatif command", () => {
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
    const result = await whatif([], { chatId: "chat-1", },);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("missing database",);
  });

  test("missing hypothetical prints usage", async () => {
    const result = await whatif([], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("Usage: /whatif",);
  });

  test("chat without a bound world is refused", async () => {
    await db
      .updateTable("chats",)
      .set({ world_id: null, },)
      .where("id", "=", "chat-1",)
      .execute();

    const result = await whatif(["the dragon wins",], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("no world bound",);
  });

  test("simulation is denied to a user without world access", async () => {
    const result = await whatif(["the dragon wins",], ctx({ userId: otherId, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("do not have access",);
  });

  test("simulates beats and reports them as a system message", async () => {
    const result = await whatif(["the dragon wins", "2",], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**What-if:**",);
    expect(result.systemMessage,).toContain("the dragon wins",);
    expect(result.action,).toBe("whatif",);
    const payload = result.actionPayload as { worldId: string; timelineId: string; beats: unknown[] };
    expect(payload.worldId,).toBe(worldId,);
    expect(payload.timelineId,).toBe("prime",);
    expect(payload.beats.length,).toBeGreaterThan(0,);
  });

  test("non-prime branch adds a divergence summary", async () => {
    await db
      .updateTable("chats",)
      .set({ timeline_id: forkId, },)
      .where("id", "=", "chat-1",)
      .execute();

    const result = await whatif(["the dark age never ends",], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("Branch divergence vs prime",);
    const payload = result.actionPayload as { timelineId: string; diff: Record<string, number> };
    expect(payload.timelineId,).toBe(forkId,);
    expect(typeof payload.diff.shared,).toBe("number",);
  });
});
