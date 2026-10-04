// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for `POST /chats/:id/branches`, the create alias of
 * `POST /chats/:id/fork` (FEAT-046). Behavioural, not wiring: each case
 * asserts the HTTP status plus the persisted state (branch row,
 * `chats.active_branch_id`), never the response echo.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { randomUUID, } from "node:crypto";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import { ChatParticipantRole, MessageRole, } from "../../db/enums";
import { createLogger, } from "../../logger";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { chatBranchRoutes, } from "./branches";

const OWNER_ID = randomUUID();
const STRANGER_ID = randomUUID();
const CHAT_ID = randomUUID();

let tdb: TestDb;

/** Issue a request as `userId` (null = no session) and return the response. */
function call(
  path: string,
  init?: RequestInit,
  userId: string | null = OWNER_ID,
  prefix = "/api",
): Promise<Response> {
  const config = createConfigSchema().defaults as Config;
  return new Elysia()
    .derive(() => ({ userId, }))
    .use(chatBranchRoutes({ database: tdb.db, config, }, prefix,),)
    .handle(new Request(`http://localhost${path}`, init,),);
}

/** JSON request init carrying `payload`. */
function json(method: string, payload: unknown,): RequestInit {
  return { method, headers: { "content-type": "application/json", }, body: JSON.stringify(payload,), };
}

/** Seed a message in the chat and return its id. */
function msg(role: MessageRole, content: string,): Promise<string> {
  return insertMessages(tdb.db, CHAT_ID, OWNER_ID, role, content,);
}

/** Fork through the legacy path and return the new branch id. */
async function fork(messageId: string, name?: string,): Promise<string> {
  const payload = name ? { messageId, name, } : { messageId, };
  const res = await call(`/api/chats/${CHAT_ID}/fork`, json("POST", payload,),);
  expect(res.status,).toBe(201,);
  return (await res.json() as { data: { branch: { id: string } } }).data.branch.id;
}

/** Create through the alias path and return the new branch id. */
async function createBranch(messageId: string, name?: string, prefix = "/api",): Promise<string> {
  const payload = name ? { messageId, name, } : { messageId, };
  const res = await call(`${prefix}/chats/${CHAT_ID}/branches`, json("POST", payload,), OWNER_ID, prefix,);
  expect(res.status,).toBe(201,);
  return (await res.json() as { data: { branch: { id: string } } }).data.branch.id;
}

/** A column value read straight from the DB, so state claims need no route echo. */
async function scalar(
  table: "chat_branches",
  column: "parent_message_id" | "name" | "is_active",
  id: string,
): Promise<string | undefined> {
  const row = await tdb.db.selectFrom(table,).select([column,],).where("id", "=", id,).executeTakeFirst();
  return row?.[column] == null ? undefined : String(row[column],);
}

/** Branch rows for the chat — a refused create must leave the count alone. */
async function branchCount(): Promise<number> {
  const rows = await tdb.db.selectFrom("chat_branches",).select("id",).where("chat_id", "=", CHAT_ID,).execute();
  return rows.length;
}

beforeEach(async () => {
  createLogger({ level: "error", },);
  tdb = await createTestDb();
  const { db, } = tdb;
  await insertUsers(db, `owner-${OWNER_ID}`, "Owner", { id: OWNER_ID, } as never,);
  await insertUsers(db, `stranger-${STRANGER_ID}`, "Stranger", { id: STRANGER_ID, } as never,);
  await insertActors(db, "Owner", { id: OWNER_ID, user_id: OWNER_ID, owner_id: OWNER_ID, } as never,);
  await insertActors(db, "Stranger", { id: STRANGER_ID, user_id: STRANGER_ID, owner_id: STRANGER_ID, } as never,);
  await insertChats(db, "Adventure", OWNER_ID, { id: CHAT_ID, type: "direct", mode: "direct", } as never,);
  await insertChatParticipants(db, CHAT_ID, OWNER_ID, { role_in_chat: ChatParticipantRole.Owner, } as never,);
},);

afterEach(async () => {
  await tdb.db.destroy();
},);

describe("POST /chats/:id/branches (fork alias)", () => {
  test("persists the same state as the fork route", async () => {
    const rootId = await msg(MessageRole.User, "root",);
    const forkedId = await fork(rootId, "ViaFork",);
    const aliasId = await createBranch(rootId, "ViaAlias",);

    expect(await scalar("chat_branches", "parent_message_id", aliasId,),).toBe(rootId,);
    expect(await scalar("chat_branches", "name", aliasId,),).toBe("ViaAlias",);
    expect(await scalar("chat_branches", "is_active", aliasId,),).toBe("1",);
    expect(await scalar("chat_branches", "parent_message_id", forkedId,),).toBe(rootId,);
    // Same display invariant as /fork: the newest branch holds the active row.
    expect(await scalar("chat_branches", "is_active", forkedId,),).toBe("0",);
  });

  test("auto-names a nameless create and rejects a blank one", async () => {
    const rootId = await msg(MessageRole.User, "root",);
    const autoId = await createBranch(rootId,);
    expect(await scalar("chat_branches", "name", autoId,),).toBe("Branch 1",);

    const res = await call(`/api/chats/${CHAT_ID}/branches`, json("POST", { messageId: rootId, name: "", },),);
    expect(res.status, "a blank name never reaches the service",).toBe(422,);
    expect(await branchCount(),).toBe(1,);
  });

  test("a non-participant is refused → 404 and nothing is created", async () => {
    const rootId = await msg(MessageRole.User, "root",);
    const res = await call(
      `/api/chats/${CHAT_ID}/branches`,
      json("POST", { messageId: rootId, name: "Hax", },),
      STRANGER_ID,
    );

    expect(res.status,).toBe(404,);
    expect(await branchCount(), "a refused create writes no branch row",).toBe(0,);
  });

  test("401 without a session user", async () => {
    const rootId = await msg(MessageRole.User, "root",);
    const res = await call(`/api/chats/${CHAT_ID}/branches`, json("POST", { messageId: rootId, },), null,);
    expect(res.status,).toBe(401,);
    expect(await branchCount(),).toBe(0,);
  });

  test("is reachable under the v1 mount too", async () => {
    const rootId = await msg(MessageRole.User, "root",);
    const aliasId = await createBranch(rootId, "V1", "/api/v1",);
    expect(await scalar("chat_branches", "parent_message_id", aliasId,),).toBe(rootId,);
    expect(await scalar("chat_branches", "name", aliasId,),).toBe("V1",);
  });
});
