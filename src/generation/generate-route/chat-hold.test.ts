// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression: per-chat hold on POST /api/v1/generation/generate.
 *
 * A paused chat (`story_state.isPaused`) refuses NEW generations at
 * `validateGenerateRequest` — before provider resolution, tracking, or
 * any LLM call. 409 + CONFLICT so the UI renders a disabled state.
 * Unpaused chats pass the gate (reaching the actor check, not the pause).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import type { GenerateRequest, } from "./types";
import { validateGenerateRequest, } from "./validate";

let testDb: Kysely<DB>;
let testSqlite: Database;

const USER = "user-hold";

beforeAll(async () => {
  const env = await createTestDb();
  testDb = env.db;
  testSqlite = env.sqlite;
  createLogger({ level: "error", },);
},);

afterAll(() => {
  testSqlite.close();
},);

/** Minimal generate request carrying the fields validate.ts reads. */
function makeInput(overrides?: Partial<GenerateRequest>,): GenerateRequest {
  return {
    chatId: "chat-paused",
    parentMessageId: randomUUID(),
    actorId: "actor-local",
    idempotencyKey: randomUUID(),
    ...overrides,
  } as GenerateRequest;
}

beforeEach(async () => {
  resetTestDb(testSqlite,);

  await testDb.insertInto("users",).values(
    { id: USER, username: "h", display_name: "H", role: "user", status: "active", settings: "{}", },
  ).execute();

  await testDb.insertInto("actors",).values([
    {
      id: USER,
      actor_type: "user",
      display_name: "H",
      agent_type: "none",
      settings: "{}",
      row_version: 0,
      import_spec: "{}",
    },
    {
      id: "actor-local",
      actor_type: "character",
      display_name: "Local",
      agent_type: "ai",
      settings: "{}",
      row_version: 0,
      import_spec: "{}",
    },
  ],).execute();

  await testDb.insertInto("chats",).values([
    {
      id: "chat-paused",
      name: "Paused",
      type: "direct",
      mode: "direct",
      created_by: USER,
      story_state: '{"isPaused":true}',
    },
    { id: "chat-live", name: "Live", type: "direct", mode: "direct", created_by: USER, },
  ],).execute();

  await testDb.insertInto("chat_participants",).values([
    { chat_id: "chat-paused", actor_id: USER, role_in_chat: "owner", },
    { chat_id: "chat-paused", actor_id: "actor-local", role_in_chat: "member", },
    { chat_id: "chat-live", actor_id: USER, role_in_chat: "owner", },
    { chat_id: "chat-live", actor_id: "actor-local", role_in_chat: "member", },
  ],).execute();
},);

describe("validateGenerateRequest - per-chat hold", () => {
  test("DENIES a new generation on a paused chat with 409", async () => {
    const rejected = await validateGenerateRequest({
      input: makeInput(),
      database: testDb,
      userId: USER,
    },);

    expect(rejected,).not.toBeNull();
    expect(rejected!.status,).toBe(409,);
    const body = await rejected!.json() as Record<string, unknown>;
    expect(body.code,).toBe("CONFLICT",);
  });

  test("ALLOWS a generation on an unpaused chat", async () => {
    const rejected = await validateGenerateRequest({
      input: makeInput({ chatId: "chat-live", },),
      database: testDb,
      userId: USER,
    },);

    expect(rejected,).toBeNull();
  });

  test("DENIES with 429 + headers past the per-user budget", async () => {
    const config = {
      generation: { flowControl: { rateLimitPerUser: 1, rateLimitWindowMs: 60_000, }, },
    } as never;

    const first = await validateGenerateRequest({
      input: makeInput({ chatId: "chat-live", },),
      database: testDb,
      userId: USER,
      config,
    },);

    expect(first,).toBeNull();

    const second = await validateGenerateRequest({
      input: makeInput({ chatId: "chat-live", },),
      database: testDb,
      userId: USER,
      config,
    },);

    expect(second,).not.toBeNull();
    expect(second!.status,).toBe(429,);
    expect(second!.headers.get("Retry-After",),).not.toBeNull();
    expect(second!.headers.get("X-RateLimit-Remaining",),).toBe("0",);
  });
});
