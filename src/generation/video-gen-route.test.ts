// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for handleVideoGeneration (generation/video-gen-route.ts):
 * the auth + validation matrix that runs BEFORE the generation engine
 * (401 / 400 / 404 / 403 / 501). Engine dispatch, timeout mapping, and BYO
 * key behavior live in video-engine.test.ts; the happy path through the
 * template seam is covered by routes/templates/modality.test.ts.
 *
 * Resource contract (parallel-safe): one :memory: SQLite per FILE (never a
 * shared db file), torn down in afterAll; fixed row ids (video-route-user,
 * route-chat-1, route-msg-1) are file-local; no ports, no sleeps, no
 * module mocks — tests are order-independent and never reach the engine.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { insertActors, insertChats, insertMessages, insertUsers, } from "../test-utils/insert-helpers";
import { handleVideoGeneration, } from "./video-gen-route";

describe("handleVideoGeneration — pre-engine gates", () => {
  let testDb: TestDb;
  let db: Kysely<DB>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    await insertUsers(db, "video-route-user", "Video Route User", { id: "video-route-user", } as never,);
  },);

  afterAll(() => destroyTestDb(testDb,));

  test("401 without an authenticated user", async () => {
    const res = await handleVideoGeneration({ prompt: "x", }, db,);
    expect(res.status,).toBe(401,);
  });

  test("400 when neither prompt nor template renders one", async () => {
    const res = await handleVideoGeneration({}, db, "video-route-user", "user",);
    expect(res.status,).toBe(400,);
  });

  test("501 when no video provider is configured", async () => {
    const res = await handleVideoGeneration({ prompt: "a clip", }, db, "video-route-user", "user",);
    expect(res.status,).toBe(501,);
    const body = (await res.json()) as { error: string };
    expect(body.error,).toContain("No video generation provider configured",);
  });

  test("403 when the linked chat is unknown to this user (IDOR write guard)", async () => {
    const res = await handleVideoGeneration(
      { prompt: "a clip", chatId: "no-such-chat", },
      db,
      "video-route-user",
      "user",
    );

    expect(res.status,).toBe(403,);
  });

  test("404 when the linked message does not exist", async () => {
    const res = await handleVideoGeneration(
      { prompt: "a clip", messageId: "no-such-message", },
      db,
      "video-route-user",
      "user",
    );

    expect(res.status,).toBe(404,);
  });

  test("400 when the messageId belongs to a different chat than chatId", async () => {
    await insertChats(db, "Route chat", "video-route-user", { id: "route-chat-1", } as never,);
    await insertActors(db, "Route Actor", { id: "route-actor-1", },);
    await insertMessages(db, "route-chat-1", "route-actor-1", "user", "hello", { id: "route-msg-1", },);

    const res = await handleVideoGeneration(
      { prompt: "a clip", messageId: "route-msg-1", chatId: "route-chat-other", },
      db,
      "video-route-user",
      "user",
    );

    expect(res.status,).toBe(400,);
  });
});
