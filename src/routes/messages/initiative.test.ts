/**
 * Tests for routes/messages/initiative.ts — persistInitiative.
 *
 * Covers the persistence contract: first call inserts score=1, subsequent
 * calls for the same (chat, scene, actor) increment by 1. Scene is
 * resolved from the chat's story_state.currentSceneId, falling back to
 * "main" when story_state is empty, missing, or unparseable JSON
 * (BUG-chat-persist-init-hardcoded-scene).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { persistInitiative, } from "./initiative";

// The insert-helpers (`insertUsers`, `insertChats`, `insertActors`) overwrite
// opts.id with a fresh uuid, so we cannot pin row ids. Direct kysely inserts
// are simpler here and let us pick stable, known ids.

describe("persistInitiative", () => {
  let db: Kysely<DB>;
  const userId = "user-1";
  const actorId = "actor-1";
  const labels = {
    first: "init-first",
    increment: "init-increment",
    emptyState: "init-empty-state",
    validState: "init-valid-state",
    brokenState: "init-broken-state",
    multiScene: "init-multi-scene",
  } as const;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, } = await createTestDb());
    await db.insertInto("users",).values({
      id: userId,
      username: "alice",
      display_name: "Alice",
      role: "solo",
      status: "active",
      settings: "{}",
    },).execute();
    await db.insertInto("actors",).values({
      id: actorId,
      actor_type: "user",
      display_name: "Aria",
      user_id: userId,
      owner_id: userId,
      settings: "{}",
      import_spec: "raw",
      content_rating: "sfw",
      template_overrides: "{}",
      growth_mode: "dynamic",
      llm_assist_enabled: 0,
    },).execute();
    for (const name of Object.values(labels,)) {
      await db.insertInto("chats",).values({
        id: `chat-${name}`,
        name,
        created_by: userId,
      },).execute();
    }
    await db.updateTable("chats",).set({ story_state: "", },).where("id", "=", `chat-${labels.emptyState}`,).execute();
    await db.updateTable("chats",)
      .set({ story_state: JSON.stringify({ currentSceneId: "tavern-brawl", },), },)
      .where("id", "=", `chat-${labels.validState}`,)
      .execute();
    await db.updateTable("chats",).set({ story_state: "{this is not json", },).where(
      "id",
      "=",
      `chat-${labels.brokenState}`,
    ).execute();
    await db.updateTable("chats",)
      .set({ story_state: JSON.stringify({ currentSceneId: "scene-A", },), },)
      .where("id", "=", `chat-${labels.multiScene}`,)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("first call inserts a row with score=1 in scene=main", async () => {
    const chat = `chat-${labels.first}`;
    await persistInitiative(db, chat, actorId,);
    const row = await db
      .selectFrom("group_initiatives",)
      .selectAll()
      .where("chat_id", "=", chat,)
      .where("scene_id", "=", "main",)
      .where("actor_id", "=", actorId,)
      .executeTakeFirst();
    expect(row?.score,).toBe(1,);
  });

  test("second + third call for the same (chat, scene, actor) increment the score", async () => {
    const chat = `chat-${labels.increment}`;
    await persistInitiative(db, chat, actorId,);
    await persistInitiative(db, chat, actorId,);
    await persistInitiative(db, chat, actorId,);
    const row = await db
      .selectFrom("group_initiatives",)
      .select("score",)
      .where("chat_id", "=", chat,)
      .where("scene_id", "=", "main",)
      .where("actor_id", "=", actorId,)
      .executeTakeFirst();
    expect(row?.score,).toBe(3,);
  });

  test("falls back to scene=main when story_state is empty string", async () => {
    const chat = `chat-${labels.emptyState}`;
    await persistInitiative(db, chat, actorId,);
    const row = await db
      .selectFrom("group_initiatives",)
      .selectAll()
      .where("chat_id", "=", chat,)
      .executeTakeFirst();
    expect(row?.scene_id,).toBe("main",);
    expect(row?.score,).toBe(1,);
  });

  test("uses currentSceneId from valid JSON story_state", async () => {
    const chat = `chat-${labels.validState}`;
    await persistInitiative(db, chat, actorId,);
    const row = await db
      .selectFrom("group_initiatives",)
      .selectAll()
      .where("chat_id", "=", chat,)
      .executeTakeFirst();
    expect(row?.scene_id,).toBe("tavern-brawl",);
    expect(row?.score,).toBe(1,);
  });

  test("falls back to scene=main when story_state is unparseable JSON", async () => {
    const chat = `chat-${labels.brokenState}`;
    await persistInitiative(db, chat, actorId,);
    const row = await db
      .selectFrom("group_initiatives",)
      .selectAll()
      .where("chat_id", "=", chat,)
      .executeTakeFirst();
    expect(row?.scene_id,).toBe("main",);
    expect(row?.score,).toBe(1,);
  });

  test("same actor in different scenes produces independent rows", async () => {
    const chat = `chat-${labels.multiScene}`;
    await persistInitiative(db, chat, actorId,);
    await db.updateTable("chats",)
      .set({ story_state: JSON.stringify({ currentSceneId: "scene-B", },), },)
      .where("id", "=", chat,)
      .execute();
    await persistInitiative(db, chat, actorId,);
    const rows = await db
      .selectFrom("group_initiatives",)
      .selectAll()
      .where("chat_id", "=", chat,)
      .where("actor_id", "=", actorId,)
      .orderBy("scene_id",)
      .execute();
    expect(rows.length,).toBe(2,);
    expect(rows.map((r,) => r.scene_id).sort(),).toEqual(["scene-A", "scene-B",],);
    expect(rows.every((r,) => r.score === 1),).toBe(true,);
  });
});
