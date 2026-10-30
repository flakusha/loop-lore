// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /reunite command tests (C7 party-merge auto-execution).
 *
 * Seeds a real split (via splitParty) so the command merges live branch
 * chats: happy path (messages merged, secondary archived, count reported),
 * usage grammar, the service-level ownership guard, and the unknown-secondary
 * rejection — all surfaced as system messages.
 *
 * Resource contract (parallel-safe):
 * - Each test owns a FRESH in-memory SQLite DB (`createTestDb` in
 *   beforeEach) — `:memory:` handles are per-instance, never a shared
 *   file, so concurrent runners cannot collide.
 * - Teardown is deterministic: `destroyTestDb` runs in `afterEach`, which
 *   Bun executes even when an assertion throws, so a failed test cannot
 *   leak an open handle into the next one.
 * - No ordering dependence: every test performs its own split, so the
 *   primary/secondary branch chats it merges are its own; no test reads
 *   the archive state left behind by another test.
 * - No process globals are set: this file never calls `setTestDatabase`,
 *   never registers a provider, opens a port or writes a file.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { splitParty, } from "../../chat/service/split";
import { ChatParticipantRole, MessageRole, PinnedState, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import {
  createTestDb,
  destroyTestDb,
  type TestDb,
} from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { type CommandContext, getCommand, } from "./registry";
import "./index"; // register all slash commands (self-registering)

const WORLD_ID = "reunite-cmd-world";

describe("/reunite", () => {
  let fixture: TestDb | undefined;
  let db: Kysely<DB>;
  let ownerId: string;
  let heroId: string;
  let rogueId: string;
  let primaryChatId: string;
  let secondaryChatId: string;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    fixture = await createTestDb();
    db = fixture.db;

    ownerId = crypto.randomUUID();
    heroId = crypto.randomUUID();
    rogueId = crypto.randomUUID();

    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, } as never,);
    await insertActors(db, "Owner", { id: ownerId, user_id: ownerId, owner_id: ownerId, } as never,);
    await insertActors(db, "Hero", { id: heroId, user_id: ownerId, owner_id: ownerId, } as never,);
    await insertActors(db, "Rogue", { id: rogueId, user_id: ownerId, owner_id: ownerId, } as never,);
    await insertActors(
      db,
      "Narrator",
      {
        id: crypto.randomUUID(),
        user_id: ownerId,
        owner_id: ownerId,
        actor_type: "narrator",
        agent_type: "narrator",
      } as never,
    );

    await db.insertInto("worlds",).values({ id: WORLD_ID, name: "Reunite World", owner_id: ownerId, },).execute();
    await db.insertInto("locations",).values({ id: "forest", world_id: WORLD_ID, name: "Forest", },).execute();
    await db.insertInto("locations",).values({ id: "cave", world_id: WORLD_ID, name: "Cave", },).execute();

    const sourceChatId = crypto.randomUUID();
    await insertChats(db, "Reunite Party", ownerId, {
      id: sourceChatId,
      type: "group",
      mode: "group",
      world_id: WORLD_ID,
    } as never,);

    await insertChatParticipants(db, sourceChatId, ownerId, { role_in_chat: ChatParticipantRole.Owner, } as never,);
    await insertChatParticipants(db, sourceChatId, heroId, { role_in_chat: ChatParticipantRole.Member, } as never,);
    await insertChatParticipants(db, sourceChatId, rogueId, { role_in_chat: ChatParticipantRole.Member, } as never,);

    // A real split: the command then merges the cave branch into the forest
    // branch (the chat the command runs in).
    const split = await splitParty(db, {
      chatId: sourceChatId,
      actorId: ownerId,
      branches: [
        { locationId: "forest", actorIds: [heroId,], name: "Forest Team", },
        { locationId: "cave", actorIds: [rogueId,], name: "Cave Team", },
      ],
    },);

    if ("code" in split) {
      throw new Error(`Split setup failed: ${split.code} ${split.message}`,);
    }

    primaryChatId = split.branches[0]!.chatId;
    secondaryChatId = split.branches[1]!.chatId;
    await insertMessages(db, secondaryChatId, rogueId, MessageRole.User, "We cleared the cave!",);
  },);

  afterEach(async () => {
    const current = fixture;
    fixture = undefined;
    if (current) {
      await destroyTestDb(current,);
    }
  },);

  /** Build a /reunite context in the primary (forest) branch chat. */
  function ctxFor(over: Partial<CommandContext> = {},): CommandContext {
    return { chatId: primaryChatId, db, userId: ownerId, ...over, };
  }

  test("registers the /reunite command", () => {
    expect(getCommand("reunite",),).toBeDefined();
  });

  test("merges the secondary chat and archives it", async () => {
    const handler = getCommand("reunite",)!;
    const result = await handler([secondaryChatId,], ctxFor(),);

    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("party-reunited",);
    expect(result.systemMessage,).toContain("**Party reunited**",);
    expect(result.systemMessage,).toContain("merged",);
    expect(result.systemMessage,).toContain(secondaryChatId,);

    const secondary = await db
      .selectFrom("chats",)
      .select("is_pinned",)
      .where("id", "=", secondaryChatId,)
      .executeTakeFirst();

    expect(secondary?.is_pinned,).toBe(PinnedState.Archived,);

    const merged = await db
      .selectFrom("messages",)
      .select("content",)
      .where("chat_id", "=", primaryChatId,)
      .where("content", "=", "We cleared the cave!",)
      .executeTakeFirst();

    expect(merged,).toBeDefined();
  });

  test("shows usage without a secondary chat id", async () => {
    const handler = getCommand("reunite",)!;
    const result = await handler([], ctxFor(),);

    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toBe("Usage: `/reunite <secondaryChatId>`",);
  });

  test("reports missing database or user context instead of throwing", async () => {
    const handler = getCommand("reunite",)!;
    expect((await handler([], { chatId: primaryChatId, },)).systemMessage,).toContain("missing database",);
    expect((await handler([], { chatId: primaryChatId, db, },)).systemMessage,).toContain("missing user context",);
  });

  test("non-owner caller is rejected by the ownership guard", async () => {
    const handler = getCommand("reunite",)!;
    // Both chats must exist before the ownership guards fire; this test owns
    // its own split, so the secondary is fresh — heroId is not the
    // primary's creator.
    const result = await handler([secondaryChatId,], ctxFor({ userId: heroId, },),);

    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("Only the primary chat owner can initiate a reunion",);
  });

  test("surfaces an unknown secondary chat as a system message", async () => {
    const handler = getCommand("reunite",)!;
    const result = await handler(["missing-branch-chat",], ctxFor(),);

    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**Reunite failed:** Secondary chat not found",);
  });
});
