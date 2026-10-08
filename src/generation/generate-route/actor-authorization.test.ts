// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression: `actorId` authorization on POST /api/v1/generation/generate.
 *
 * `checkChatAccess` authorized only `chatId`; the caller picked `actorId`
 * freely. A participant of chat A could therefore (a) make any actor in the
 * deployment speak inside chat A and (b) reach `gatePluginToolsByRole(null)`,
 * which hands back the FULL plugin tool list for an actor with no persona.
 *
 * Owns: one in-memory SQLite DB and its rows, seeded per test in `beforeEach`.
 * No shared mutable module state — the plugin registry is process-global but
 * this file never mutates it (tool-surface widening is asserted through the
 * `validateGenerateRequest` denial, which happens before provider dispatch).
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

const USER_A = "user-a";
const USER_B = "user-b";

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
    chatId: "chat-a",
    parentMessageId: randomUUID(),
    actorId: "actor-local",
    idempotencyKey: randomUUID(),
    ...overrides,
  } as GenerateRequest;
}

beforeEach(async () => {
  resetTestDb(testSqlite,);

  await testDb.insertInto("users",).values([
    { id: USER_A, username: "a", display_name: "A", role: "user", status: "active", settings: "{}", },
    { id: USER_B, username: "b", display_name: "B", role: "user", status: "active", settings: "{}", },
  ],).execute();

  // Each user owns an actor row with the same id (chat/invites/code.ts).
  await testDb.insertInto("actors",).values([
    {
      id: USER_A,
      actor_type: "user",
      display_name: "A",
      agent_type: "none",
      settings: "{}",
      format_version: 0,
      import_spec: "{}",
    },
    {
      id: USER_B,
      actor_type: "user",
      display_name: "B",
      agent_type: "none",
      settings: "{}",
      format_version: 0,
      import_spec: "{}",
    },
    {
      id: "actor-local",
      actor_type: "character",
      display_name: "Local",
      agent_type: "ai",
      settings: "{}",
      format_version: 0,
      import_spec: "{}",
    },
    // Belongs to chat B only, and carries a narrow plugin agent role.
    {
      id: "actor-foreign",
      actor_type: "character",
      display_name: "Foreign",
      agent_type: "ai",
      agent_role: "core-only-role",
      settings: "{}",
      format_version: 0,
      import_spec: "{}",
    },
    // In no chat at all, no agent role.
    {
      id: "actor-orphan",
      actor_type: "character",
      display_name: "Orphan",
      agent_type: "ai",
      settings: "{}",
      format_version: 0,
      import_spec: "{}",
    },
  ],).execute();

  await testDb.insertInto("chats",).values([
    { id: "chat-a", name: "Chat A", type: "direct", mode: "direct", created_by: USER_A, },
    { id: "chat-b", name: "Chat B", type: "direct", mode: "direct", created_by: USER_B, },
  ],).execute();

  await testDb.insertInto("chat_participants",).values([
    { chat_id: "chat-a", actor_id: USER_A, role_in_chat: "owner", },
    { chat_id: "chat-a", actor_id: "actor-local", role_in_chat: "member", },
    { chat_id: "chat-b", actor_id: USER_B, role_in_chat: "owner", },
    { chat_id: "chat-b", actor_id: "actor-foreign", role_in_chat: "member", },
  ],).execute();
},);

describe("validateGenerateRequest — actorId authorization", () => {
  test("accepts an actorId that is a participant of the authorized chat", async () => {
    const rejected = await validateGenerateRequest({
      input: makeInput(),
      database: testDb,
      userId: USER_A,
      userRole: null,
    },);

    expect(rejected,).toBeNull();
  });

  test("DENIES an actorId belonging to another chat (cross-chat impersonation)", async () => {
    const rejected = await validateGenerateRequest({
      input: makeInput({ actorId: "actor-foreign", },),
      database: testDb,
      userId: USER_A,
      userRole: null,
    },);

    // Assert the DENIAL, not an absence: a 4xx Response with a body.
    expect(rejected,).not.toBeNull();
    expect(rejected!.status,).toBe(404,);
    expect(((await rejected!.json()) as Record<string, unknown>).error,).toContain("not a participant",);
  });

  test("DENIES an actorId that is an actor row in no chat (full-tool-surface widening)", async () => {
    // This is the case that reached gatePluginToolsByRole(null) and exposed
    // every registered plugin tool, including community-origin ones.
    const rejected = await validateGenerateRequest({
      input: makeInput({ actorId: "actor-orphan", },),
      database: testDb,
      userId: USER_A,
      userRole: null,
    },);

    expect(rejected,).not.toBeNull();
    expect(rejected!.status,).toBe(404,);
  });

  test("DENIES ANOTHER user's own actor row while the caller owns chat A", async () => {
    const rejected = await validateGenerateRequest({
      input: makeInput({ actorId: USER_B, },),
      database: testDb,
      userId: USER_A,
      userRole: null,
    },);

    expect(rejected,).not.toBeNull();
    expect(rejected!.status,).toBe(404,);
  });

  test("DENIES an actorId that does not exist at all", async () => {
    const rejected = await validateGenerateRequest({
      input: makeInput({ actorId: randomUUID(), },),
      database: testDb,
      userId: USER_A,
      userRole: null,
    },);

    expect(rejected,).not.toBeNull();
    expect(rejected!.status,).toBe(404,);
  });

  test("still DENIES before the actor check when the caller has no chat access", async () => {
    // Ordering matters: chat authorization runs first, so an outsider cannot
    // use the actor probe to learn whether a given actor exists.
    const rejected = await validateGenerateRequest({
      input: makeInput({ actorId: "actor-local", },),
      database: testDb,
      userId: USER_B,
      userRole: null,
    },);

    expect(rejected,).not.toBeNull();
    expect(rejected!.status,).toBe(403,);
  });

  test("allows an admin.chat caller to target any participant of the chat", async () => {
    // Membership, not ownership: the admin gate must not lock admins out of
    // group casts they are allowed to drive.
    const rejected = await validateGenerateRequest({
      input: makeInput({ actorId: "actor-local", },),
      database: testDb,
      userId: USER_B,
      userRole: "admin",
    },);

    expect(rejected,).toBeNull();
  });
});
