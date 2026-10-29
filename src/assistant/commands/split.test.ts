// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /split command tests (C7 party-split auto-execution).
 *
 * Drives the registered handler over a migrated test DB: branch-group
 * grammar parsing, the happy path (system message lists the created chat
 * ids), the service-level ownership guard, and branch-spec validation
 * surfaced as a system message. One case goes through the full slash
 * dispatch to pin the owner role gate and system-message persistence.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ChatParticipantRole, MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { dispatchCommand, } from "../../routes/messages/command";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { type CommandContext, getCommand, } from "./registry";
import "./index"; // register all slash commands (self-registering)

const WORLD_ID = "split-cmd-world";

describe("/split", () => {
  let db: Kysely<DB>;
  let chatId: string;
  let ownerId: string;
  let heroId: string;
  let rogueId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    ownerId = crypto.randomUUID();
    heroId = crypto.randomUUID();
    rogueId = crypto.randomUUID();

    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, } as never,);
    await insertActors(db, "Owner", { id: ownerId, user_id: ownerId, owner_id: ownerId, } as never,);
    await insertActors(db, "Hero", { id: heroId, user_id: ownerId, owner_id: ownerId, } as never,);
    await insertActors(db, "Rogue", { id: rogueId, user_id: ownerId, owner_id: ownerId, } as never,);
    // Narrator actor so injectNarration actually posts the branch narration.
    await insertActors(
      db,
      "Narrator",
      {
        id: "split-narrator",
        user_id: ownerId,
        owner_id: ownerId,
        actor_type: "narrator",
        agent_type: "narrator",
      } as never,
    );

    await db.insertInto("worlds",).values({ id: WORLD_ID, name: "Split World", owner_id: ownerId, },).execute();
    await db.insertInto("locations",).values({ id: "forest", world_id: WORLD_ID, name: "Forest", },).execute();
    await db.insertInto("locations",).values({ id: "cave", world_id: WORLD_ID, name: "Cave", },).execute();

    chatId = crypto.randomUUID();
    await insertChats(db, "Split Party", ownerId, {
      id: chatId,
      type: "group",
      mode: "group",
      world_id: WORLD_ID,
    } as never,);

    await insertChatParticipants(db, chatId, ownerId, { role_in_chat: ChatParticipantRole.Owner, } as never,);
    await insertChatParticipants(db, chatId, heroId, { role_in_chat: ChatParticipantRole.Member, } as never,);
    await insertChatParticipants(db, chatId, rogueId, { role_in_chat: ChatParticipantRole.Member, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  /** Build a /split command context, defaulting to the chat owner. */
  function ctxFor(over: Partial<CommandContext> = {},): CommandContext {
    return { chatId, db, userId: ownerId, ...over, };
  }

  test("registers the /split command", () => {
    expect(getCommand("split",),).toBeDefined();
  });

  test("splits into two branches and lists the created chat ids", async () => {
    const handler = getCommand("split",)!;
    const result = await handler([`forest:${heroId}`, `cave:${ownerId},${rogueId}`,], ctxFor(),);

    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("party-split",);

    const branchChats = await db
      .selectFrom("chats",)
      .select(["id", "current_location_id",],)
      .where("parent_chat_id", "=", chatId,)
      .orderBy("current_location_id",)
      .execute();

    expect(branchChats,).toHaveLength(2,);
    expect(branchChats.map((row,) => row.current_location_id),).toEqual(["cave", "forest",],);
    for (const branch of branchChats) {
      expect(result.systemMessage,).toContain(branch.id,);
    }
  });

  test("shows usage for malformed grammar", async () => {
    const handler = getCommand("split",)!;
    const cases: string[][] = [
      [],
      [`forest:${heroId}`,],
      ["forest",],
      [`forest:`,],
      [`:${heroId}`, `cave:${rogueId}`,],
    ];

    for (const args of cases) {
      const result = await handler(args, ctxFor(),);
      expect(result.handled,).toBe(true,);
      expect(result.systemMessage,).toContain("Usage: `/split",);
    }
  });

  test("reports missing database or user context instead of throwing", async () => {
    const handler = getCommand("split",)!;
    expect((await handler([], { chatId, },)).systemMessage,).toContain("missing database",);
    expect((await handler([], { chatId, db, },)).systemMessage,).toContain("missing user context",);
  });

  test("non-owner caller is rejected by the ownership guard", async () => {
    const handler = getCommand("split",)!;
    const result = await handler([`forest:${heroId}`, `cave:${rogueId}`,], ctxFor({ userId: heroId, },),);

    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("Only the chat owner can split the party",);
  });

  test("surfaces branch-spec validation failures as system messages", async () => {
    const handler = getCommand("split",)!;

    const unknownLocation = await handler([`swamp:${heroId}`, `cave:${rogueId}`,], ctxFor(),);
    expect(unknownLocation.systemMessage,).toContain("**Split failed:**",);
    expect(unknownLocation.systemMessage,).toContain("Locations not found in this chat's world: swamp",);

    const outsiderId = crypto.randomUUID();
    await insertActors(db, "Outsider", { id: outsiderId, user_id: ownerId, owner_id: ownerId, } as never,);
    const unknownActor = await handler([`forest:${outsiderId}`, `cave:${rogueId}`,], ctxFor(),);
    expect(unknownActor.systemMessage,).toContain("Actors are not participants of this chat",);
    expect(unknownActor.systemMessage,).toContain(outsiderId,);
  });

  describe("via slash dispatch", () => {
    /** Dispatch a slash command, failing the test when it goes unhandled. */
    async function dispatch(content: string, actorId: string,): Promise<Response> {
      const outcome = await dispatchCommand(db, {} as never, actorId, chatId, content,);
      if (!outcome.handled) {
        throw new Error(`Expected command to be handled: ${content}`,);
      }

      return outcome.response;
    }

    test("persists the split system message", async () => {
      const res = await dispatch(`/split forest:${heroId} cave:${rogueId}`, ownerId,);
      const body = await res.json() as { systemMessage?: string };
      expect(body.systemMessage,).toContain("**Party split**",);

      const row = await db
        .selectFrom("messages",)
        .select("content",)
        .where("chat_id", "=", chatId,)
        .where("role", "=", MessageRole.System as never,)
        .orderBy("created_at", "desc",)
        .executeTakeFirst();

      expect(row?.content,).toContain("branches created",);
    });

    test("denies a member-role participant before the handler runs", async () => {
      const res = await dispatch(`/split forest:${heroId} cave:${rogueId}`, heroId,);
      const body = await res.json() as { systemMessage?: string };
      expect(body.systemMessage,).toContain("Permission denied",);
    });
  });
});
