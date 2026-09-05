// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * eventSection integration tests — persisted random-event injection.
 *
 * `applyPostStoreEffects` persists fired random events into
 * `chat_random_events`; `eventSection.build` surfaces the active (non-expired)
 * ones in the `<events>` system message so the LLM sees what happened on the
 * previous turn. These tests drive the real section build against a migrated
 * test DB:
 *   - a persisted random event is injected as `[random]`;
 *   - an expired event is excluded;
 *   - the section stays disabled when the chat has no world.
 */
import { describe, expect, test, } from "bun:test";
import { sql, } from "kysely";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertUsers,
  insertWorlds,
} from "../../../test-utils/insert-helpers";
import type { AssembleContext, } from "../types";
import { eventSection, } from "./events";

describe("eventSection — persisted random-event injection", () => {
  /**
   * @param db
   */
  async function setupWorld(
    db: Kysely<DB>,
  ): Promise<{ worldId: string; chatId: string; actorId: string }> {
    await insertUsers(db, "gm", "GM",);
    const user = await db.selectFrom("users",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
    await insertActors(db, "Hero",);
    const actor = await db.selectFrom("actors",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
    await insertWorlds(db, user.id, "Event World",);
    const world = await db.selectFrom("worlds",).select(["id",],).limit(1,).executeTakeFirstOrThrow();

    const chatId = "chat-events-1";
    await insertChats(db, "Event Chat", user.id, { id: chatId as never, world_id: world.id, },);

    return { actorId: actor.id, chatId, worldId: world.id, };
  }

  /**
   * @param db
   * @param worldId
   * @param chatId
   * @param actorId
   */
  function ctxFor(
    db: Kysely<DB>,
    worldId: string,
    chatId: string,
    actorId: string,
  ): AssembleContext {
    return {
      db,
      actor: {
        id: actorId,
        display_name: "Hero",
        system_prompt: null,
        description: null,
        personality: null,
        scenario: null,
        post_history_instructions: null,
        mes_example: null,
        agent_role: null,
      },
      chat: { id: chatId, mode: "story", world_id: worldId, current_location_id: null, },
      params: { actorId, chatId, modelId: "test-model", },
      isStory: true,
      tokenBudget: 4000,
    };
  }

  test("injects active persisted random events into the events section", async () => {
    try {
      createLogger({ level: "error", },);
    } catch { /* already initialized */ }

    const { db, sqlite, } = await createTestDb();
    try {
      const { actorId, chatId, worldId, } = await setupWorld(db,);
      const now = Date.now();

      await db.insertInto("chat_random_events",).values({
        id: "re-1",
        chat_id: chatId,
        event_id: "evt-1",
        category: "weather",
        content: "The weather shifts — a chill settles in the air.",
        token_count: 12,
        fired_at: now - 60_000,
        expires_at: now + 60 * 60 * 1000,
      },).execute();

      const built = await eventSection.build(ctxFor(db, worldId, chatId, actorId,),);
      const text = built.map((m,) => m.content).join("\n",);

      expect(text,).toContain("[random]",);
      expect(text,).toContain("a chill settles in the air",);
      expect(built.some((m,) => m.content.includes("<events>",)),).toBe(true,);
    } finally {
      sqlite.close();
    }
  });

  test("expired persisted random events are excluded", async () => {
    try {
      createLogger({ level: "error", },);
    } catch { /* already initialized */ }

    const { db, sqlite, } = await createTestDb();
    try {
      const { actorId, chatId, worldId, } = await setupWorld(db,);
      const now = Date.now();

      await db.insertInto("chat_random_events",).values({
        id: "re-2",
        chat_id: chatId,
        event_id: "evt-2",
        category: "ambient",
        content: "A rustling leaves echoes through the area.",
        token_count: 10,
        fired_at: now - 2 * 60 * 60 * 1000,
        expires_at: now - 60 * 60 * 1000,
      },).execute();

      const built = await eventSection.build(ctxFor(db, worldId, chatId, actorId,),);
      const text = built.map((m,) => m.content).join("\n",);

      expect(text,).not.toContain("[random]",);
      expect(text,).not.toContain("rustling leaves",);
    } finally {
      sqlite.close();
    }
  });

  test("events from another chat are never injected", async () => {
    try {
      createLogger({ level: "error", },);
    } catch { /* already initialized */ }

    const { db, sqlite, } = await createTestDb();
    try {
      const { actorId, chatId, worldId, } = await setupWorld(db,);
      const now = Date.now();

      // The other chat must exist (FK on chat_id); give it its own user owner.
      await insertUsers(db, "other", "Other",);
      const otherUser = await db.selectFrom("users",)
        .select(["id",],)
        .where("username", "=", "other",)
        .executeTakeFirstOrThrow();
      await insertChats(db, "Other Chat", otherUser.id, { id: "chat-other" as never, world_id: worldId, },);

      // Same event content, but bound to a different chat.
      await db.insertInto("chat_random_events",).values({
        id: "re-3",
        chat_id: "chat-other",
        event_id: "evt-3",
        category: "npc",
        content: "A traveler passes by, glancing briefly.",
        token_count: 10,
        fired_at: now,
        expires_at: now + 60 * 60 * 1000,
      },).execute();

      const built = await eventSection.build(ctxFor(db, worldId, chatId, actorId,),);
      const text = built.map((m,) => m.content).join("\n",);

      expect(text,).not.toContain("A traveler passes by",);
    } finally {
      sqlite.close();
    }
  });

  test("section is disabled when the chat has no world", async () => {
    try {
      createLogger({ level: "error", },);
    } catch { /* already initialized */ }

    const { db, sqlite, } = await createTestDb();
    try {
      await insertUsers(db, "gm2", "GM2",);
      const user = await db.selectFrom("users",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
      await insertActors(db, "Hero2",);
      const actor = await db.selectFrom("actors",).select(["id",],).limit(1,).executeTakeFirstOrThrow();

      // No world on the chat → eventSection.enabled must be false.
      const chatId = "chat-events-noworld";
      await insertChats(db, "No World Chat", user.id, { id: chatId as never, },);

      const ctx = ctxFor(db, undefined as never, chatId, actor.id,);
      expect(eventSection.enabled(ctx,),).toBe(false,);
    } finally {
      sqlite.close();
    }
  });
});

/**
 * `fireRandomEvent` uses `insertInto.onConflict(doUpdateSet)` with
 * `fired_count = sql\`fired_count + 1\``.  This test exercises that exact
 * upsert path directly (mirrors the SQL shape from fire-random-event.ts) so
 * the increment contract is covered in CI even when generateRandomEvent is
 * mocked out in post-store tests.
 */
describe("chat_random_events upsert — fired_count increment", () => {
  test("onConflict doUpdateSet increments fired_count on same (chat_id, event_id)", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await insertUsers(db, "upsert", "Upsert",);
      const user = await db.selectFrom("users",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
      await insertWorlds(db, user.id, "Upsert World",);
      const world = await db.selectFrom("worlds",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
      const chatId = "chat-upsert";
      await insertChats(db, "Upsert Chat", user.id, { id: chatId as never, world_id: world.id, },);

      // First insert: fired_count defaults to 1.
      await db
        .insertInto("chat_random_events",)
        .values({
          id: "re-upsert-1",
          chat_id: chatId,
          event_id: "evt-upsert-1",
          category: "ambient",
          content: "First fire",
          token_count: 5,
          fired_at: 1_000,
          expires_at: 2_000,
        },)
        .execute();

      // Second insert with same (chat_id, event_id): unique constraint fires,
      // doUpdateSet runs — fired_count increments, no duplicate row.
      await db
        .insertInto("chat_random_events",)
        .values({
          id: "re-upsert-2",
          chat_id: chatId,
          event_id: "evt-upsert-1",
          category: "ambient",
          content: "Second fire",
          token_count: 7,
          fired_at: 3_000,
          expires_at: 4_000,
        },)
        .onConflict((oc,) =>
          oc.columns(["chat_id", "event_id",],).doUpdateSet({
            content: "Second fire",
            fired_at: 3_000,
            expires_at: 4_000,
            token_count: 7,
            fired_count: sql`fired_count + 1`,
          },)
        )
        .execute();

      const rows = await db
        .selectFrom("chat_random_events",)
        .select(["id", "event_id", "content", "fired_count",],)
        .where("chat_id", "=", chatId,)
        .where("event_id", "=", "evt-upsert-1",)
        .execute();

      expect(rows,).toHaveLength(1,);
      expect(rows[0]!.fired_count,).toBe(2,);
      expect(rows[0]!.content,).toBe("Second fire",);
    } finally {
      sqlite.close();
    }
  });
});
