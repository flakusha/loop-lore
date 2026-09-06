// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Quest route tests — world quest list/create, quest get/update/abandon,
 * and quest progress lookup.
 *
 * Mounts questsRoutes behind the same derive-auth harness as stats.test.ts
 * over a real in-memory DB. Covers success round-trips, Elysia validation
 * failures (422), and not-found paths (404) for missing rows, foreign
 * owners, and unauthenticated callers.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertQuestProgress,
  insertQuests,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { questsRoutes, } from "./index";

const WORLD_ID = "11111111-1111-4111-8111-111111111111";
const QUEST_ID = "44444444-4444-4444-8444-444444444444";
const DOOMED_ID = "66666666-6666-4666-8666-666666666666";
const CHAT_ID = "55555555-5555-4555-8555-555555555555";
const MISSING_ID = "99999999-9999-4999-8999-999999999999";

interface QuestRow {
  id: string;
  name: string;
  status: string;
}

interface QuestList {
  data: QuestRow[];
  pagination: { total: number };
}

/**
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  const app = new Elysia({ name: "test-quests", },);
  if (userId) {
    app.derive(() => ({ userId, userRole, }));
  }
  return app.use(questsRoutes({ database: db, },),);
}

/**
 * @param url
 * @param body
 */
function postJson(url: string, body: unknown,): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

/**
 * @param url
 * @param body
 */
function putJson(url: string, body: unknown,): Request {
  return new Request(url, {
    method: "PUT",
    headers: { "content-type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

describe("quest routes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
    await insertUsers(db, "stranger", "Stranger", { id: "stranger" as never, },);
    await insertActors(db, "Owner", { id: "owner" as never, actor_type: "user" as never, },);
    await insertWorlds(db, "owner", "Quest World", { id: WORLD_ID as never, },);
    await insertChats(db, "Quest Chat", "owner", { id: CHAT_ID as never, world_id: WORLD_ID, },);
    await insertQuests(db, WORLD_ID, "owner", "Find sword", "collection", 10, {
      id: QUEST_ID as never,
    },);
    await insertQuests(db, WORLD_ID, "owner", "Doomed quest", "collection", 5, {
      id: DOOMED_ID as never,
    },);
    await insertQuestProgress(db, QUEST_ID, CHAT_ID, { progress: 4, },);
  },);

  afterAll(() => sqlite.close());

  test("GET world quests lists active quests with a total", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/worlds/${WORLD_ID}/quests`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as QuestList;
    expect(body.pagination.total,).toBe(2,);
    expect(body.data.map((quest,) => quest.name).sort(),).toEqual(
      ["Doomed quest", "Find sword",],
    );
  });

  test("GET world quests returns 404 for unknown, foreign, and anon callers", async () => {
    const missing = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/worlds/${MISSING_ID}/quests`,),
    );
    expect(missing.status,).toBe(404,);
    const foreign = await makeApp(db, "stranger", "user",).handle(
      new Request(`http://localhost/api/worlds/${WORLD_ID}/quests`,),
    );
    expect(foreign.status,).toBe(404,);
    const anon = await makeApp(db,).handle(
      new Request(`http://localhost/api/worlds/${WORLD_ID}/quests`,),
    );
    expect(anon.status,).toBe(404,);
  });

  test("POST world quests creates a quest listed afterwards", async () => {
    const authed = makeApp(db, "owner", "user",);
    const created = await authed.handle(
      postJson(`http://localhost/api/worlds/${WORLD_ID}/quests`, {
        name: "Rescue the bard",
        type: "rescue",
        category: "side",
      },),
    );
    expect(created.status,).toBe(201,);
    const createdBody = await created.json() as { id: string };
    expect(typeof createdBody.id,).toBe("string",);

    const listed = await authed.handle(
      new Request(`http://localhost/api/worlds/${WORLD_ID}/quests`,),
    );
    const listedBody = await listed.json() as QuestList;
    expect(listedBody.pagination.total,).toBe(3,);
    expect(listedBody.data.some((quest,) => quest.id === createdBody.id),).toBe(true,);
  });

  test("POST world quests rejects a missing name (422) and unknown worlds (404)", async () => {
    const bad = await makeApp(db, "owner", "user",).handle(
      postJson(`http://localhost/api/worlds/${WORLD_ID}/quests`, {},),
    );
    expect(bad.status,).toBe(422,);
    const missing = await makeApp(db, "owner", "user",).handle(
      postJson(`http://localhost/api/worlds/${MISSING_ID}/quests`, { name: "Ghost", },),
    );
    expect(missing.status,).toBe(404,);
  });

  test("GET quest returns the seeded quest", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/quests/${QUEST_ID}`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as QuestRow;
    expect(body.id,).toBe(QUEST_ID,);
    expect(body.name,).toBe("Find sword",);
    expect(body.status,).toBe("active",);
  });

  test("GET quest returns 404 for unknown, foreign, and anon callers", async () => {
    const missing = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/quests/${MISSING_ID}`,),
    );
    expect(missing.status,).toBe(404,);
    const foreign = await makeApp(db, "stranger", "user",).handle(
      new Request(`http://localhost/api/quests/${QUEST_ID}`,),
    );
    expect(foreign.status,).toBe(404,);
    const anon = await makeApp(db,).handle(
      new Request(`http://localhost/api/quests/${QUEST_ID}`,),
    );
    expect(anon.status,).toBe(404,);
  });

  test("PUT quest renames the quest persistently", async () => {
    const authed = makeApp(db, "owner", "user",);
    const updated = await authed.handle(
      putJson(`http://localhost/api/quests/${QUEST_ID}`, { name: "Find the axe", },),
    );
    expect(updated.status,).toBe(200,);
    const updatedBody = await updated.json() as QuestRow;
    expect(updatedBody.name,).toBe("Find the axe",);

    const refetched = await authed.handle(
      new Request(`http://localhost/api/quests/${QUEST_ID}`,),
    );
    const refetchedBody = await refetched.json() as QuestRow;
    expect(refetchedBody.name,).toBe("Find the axe",);
  });

  test("PUT quest returns 404 for unknown quests", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      putJson(`http://localhost/api/quests/${MISSING_ID}`, { name: "Ghost", },),
    );
    expect(res.status,).toBe(404,);
  });

  test("GET quest progress returns the seeded entry", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/quests/${QUEST_ID}/progress/${CHAT_ID}`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { quest_id: string; chat_id: string; progress: number };
    expect(body.quest_id,).toBe(QUEST_ID,);
    expect(body.chat_id,).toBe(CHAT_ID,);
    expect(body.progress,).toBe(4,);
  });

  test("GET quest progress defaults to zero without a row", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(
        `http://localhost/api/quests/${DOOMED_ID}/progress/${CHAT_ID}`,
      ),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { questId: string; chatId: string; progress: number };
    expect(body.questId,).toBe(DOOMED_ID,);
    expect(body.chatId,).toBe(CHAT_ID,);
    expect(body.progress,).toBe(0,);
  });

  test("POST quest progress rejects an empty body (422)", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      postJson(`http://localhost/api/quests/${QUEST_ID}/progress`, {},),
    );
    expect(res.status,).toBe(422,);
  });

  test("GET quest progress returns 404 for unknown quests", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/quests/${MISSING_ID}/progress/${CHAT_ID}`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("DELETE quest abandons it and drops it from the active list", async () => {
    const authed = makeApp(db, "owner", "user",);
    const deleted = await authed.handle(
      new Request(`http://localhost/api/quests/${DOOMED_ID}`, { method: "DELETE", },),
    );
    expect(deleted.status,).toBe(204,);
    const refetched = await authed.handle(
      new Request(`http://localhost/api/quests/${DOOMED_ID}`,),
    );
    expect(refetched.status,).toBe(200,);
    const refetchedBody = await refetched.json() as QuestRow;
    expect(refetchedBody.status,).toBe("abandoned",);
    const listed = await authed.handle(
      new Request(`http://localhost/api/worlds/${WORLD_ID}/quests`,),
    );
    const listedBody = await listed.json() as QuestList;
    expect(listedBody.pagination.total,).toBe(2,);
    expect(listedBody.data.some((quest,) => quest.id === DOOMED_ID),).toBe(false,);
  });

  test("DELETE quest returns 404 for unknown quests", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/quests/${MISSING_ID}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(404,);
  });
});
