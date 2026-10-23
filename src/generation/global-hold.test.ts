// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression: global generation hold (`generation_paused` KV).
 *
 * Engaged: `validateGenerateRequest` refuses with 409 BEFORE provider
 * resolution/tracking (no attempt row, no LLM call); unheld (missing key
 * or `"false"`) lets the request through the hold. `isGenerationHeld`
 * fail-opens when the KV read throws.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { setConfig, } from "../admin/config";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, resetTestDb, } from "../test-utils/create-test-db";
import type { GenerateRequest, } from "./generate-route/types";
import { validateGenerateRequest, } from "./generate-route/validate";
import { GENERATION_PAUSED_KEY, isGenerationHeld, } from "./global-hold";

let testDb: Kysely<DB>;
let testSqlite: Database;

const USER = "user-global-hold";

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
function makeInput(): GenerateRequest {
  return {
    chatId: "chat-live",
    parentMessageId: randomUUID(),
    actorId: "actor-local",
    idempotencyKey: randomUUID(),
  } as GenerateRequest;
}

beforeEach(async () => {
  resetTestDb(testSqlite,);

  await testDb.insertInto("users",).values(
    { id: USER, username: "g", display_name: "G", role: "user", status: "active", settings: "{}", },
  ).execute();

  await testDb.insertInto("actors",).values([
    {
      id: USER,
      actor_type: "user",
      display_name: "G",
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

  await testDb.insertInto("chats",).values(
    { id: "chat-live", name: "Live", type: "direct", mode: "direct", created_by: USER, },
  ).execute();

  await testDb.insertInto("chat_participants",).values([
    { chat_id: "chat-live", actor_id: USER, role_in_chat: "owner", },
    { chat_id: "chat-live", actor_id: "actor-local", role_in_chat: "member", },
  ],).execute();
},);

describe("isGenerationHeld", () => {
  test("unheld when the key was never written", async () => {
    await expect(isGenerationHeld(testDb,),).resolves.toBe(false,);
  });

  test('held when the key is "true"', async () => {
    await setConfig(testDb, GENERATION_PAUSED_KEY, "true", "test hold",);
    await expect(isGenerationHeld(testDb,),).resolves.toBe(true,);
  });

  test('unheld when the key is "false"', async () => {
    await setConfig(testDb, GENERATION_PAUSED_KEY, "false", "test hold",);
    await expect(isGenerationHeld(testDb,),).resolves.toBe(false,);
  });

  test("fail-opens when the KV read throws", async () => {
    const broken = {
      selectFrom: () => {
        throw new Error("db down",);
      },
    } as unknown as Kysely<DB>;

    await expect(isGenerationHeld(broken,),).resolves.toBe(false,);
  });
});

describe("validateGenerateRequest - global hold", () => {
  test("DENIES with 409 when the hold is engaged", async () => {
    await setConfig(testDb, GENERATION_PAUSED_KEY, "true", "test hold",);

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

  test("ALLOWS when the hold is not engaged", async () => {
    const rejected = await validateGenerateRequest({
      input: makeInput(),
      database: testDb,
      userId: USER,
    },);

    expect(rejected,).toBeNull();
  });
});
