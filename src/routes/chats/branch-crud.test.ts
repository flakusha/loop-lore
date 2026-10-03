// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for chat branch CRUD (FEAT-046). Behavioural, not wiring:
 * each case asserts the HTTP status plus the persisted state (branch row,
 * message `parent_id`, `chats.active_branch_id`).
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
const OTHER_CHAT_ID = randomUUID();

let tdb: TestDb;

/** Issue a request as `userId` (null = no session) and return the response. */
function call(path: string, init?: RequestInit, userId: string | null = OWNER_ID,): Promise<Response> {
  const config = createConfigSchema().defaults as Config;
  return new Elysia()
    .derive(() => ({ userId, }))
    .use(chatBranchRoutes({ database: tdb.db, config, },),)
    .handle(new Request(`http://localhost${path}`, init,),);
}

/** JSON request init carrying `payload`. */
function json(method: string, payload: unknown,): RequestInit {
  return { method, headers: { "content-type": "application/json", }, body: JSON.stringify(payload,), };
}

/** Seed a message in the main chat and return its id. */
function msg(role: MessageRole, content: string, parentId?: string,): Promise<string> {
  return insertMessages(tdb.db, CHAT_ID, OWNER_ID, role, content, parentId ? { parent_id: parentId, } : undefined,);
}

/** Fork through the API and return the new branch id. */
async function fork(messageId: string, name?: string, chatId = CHAT_ID,): Promise<string> {
  const payload = name ? { messageId, name, } : { messageId, };
  const res = await call(`/api/chats/${chatId}/fork`, json("POST", payload,),);
  expect(res.status,).toBe(201,);
  return (await res.json() as { data: { branch: { id: string } } }).data.branch.id;
}

/** Point the chat's display at a branch (the newest fork always wins). */
async function activate(branchId: string,): Promise<void> {
  const path = `/api/chats/${CHAT_ID}/active-branch`;
  expect((await call(path, json("PATCH", { branchId, },),)).status,).toBe(200,);
}

/** A column value read straight from the DB, so state claims need no route echo. */
async function scalar(
  table: "chat_branches" | "chats" | "messages",
  column: "parent_message_id" | "active_branch_id" | "name" | "parent_id" | "is_active",
  id: string,
): Promise<string | undefined> {
  const row = await tdb.db.selectFrom(table,).select([column,],).where("id", "=", id,).executeTakeFirst();
  return row?.[column] == null ? undefined : String(row[column],);
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
  await insertChats(db, "Side Chat", OWNER_ID, { id: OTHER_CHAT_ID, type: "direct", mode: "direct", } as never,);
  await insertChatParticipants(db, CHAT_ID, OWNER_ID, { role_in_chat: ChatParticipantRole.Owner, } as never,);
},);

afterEach(async () => {
  await tdb.db.destroy();
},);

describe("branch detail", () => {
  test("GET returns the branch and its root-to-tip message path", async () => {
    const rootId = await msg(MessageRole.User, "root",);
    const midId = await msg(MessageRole.Assistant, "mid", rootId,);
    await msg(MessageRole.User, "leaf", midId,);
    const branchId = await fork(midId,);

    const res = await call(`/api/chats/${CHAT_ID}/branches/${branchId}`, { method: "GET", },);
    expect(res.status,).toBe(200,);
    const parsed = await res.json() as {
      data: { branch: { id: string; messageCount: number }; messagePath: string[] };
    };
    expect(parsed.data.branch.id,).toBe(branchId,);
    expect(parsed.data.messagePath,).toEqual([rootId, midId,],);
    expect(parsed.data.branch.messageCount,).toBe(2,);
  });

  test("a branch from another chat is indistinguishable from a missing one → 404", async () => {
    const otherRoot = await insertMessages(tdb.db, OTHER_CHAT_ID, OWNER_ID, MessageRole.User, "o",);
    const branchId = await fork(otherRoot, undefined, OTHER_CHAT_ID,);
    const res = await call(`/api/chats/${CHAT_ID}/branches/${branchId}`, { method: "GET", },);
    expect(res.status,).toBe(404,);
  });
});

describe("branch rename", () => {
  test("PATCH persists the new name", async () => {
    const branchId = await fork(await msg(MessageRole.User, "root",), "Before",);
    const res = await call(`/api/chats/${CHAT_ID}/branches/${branchId}`, json("PATCH", { name: "Renamed", },),);
    expect(res.status,).toBe(200,);
    expect((await res.json() as { data: { branch: { name: string } } }).data.branch.name,).toBe("Renamed",);
    expect(await scalar("chat_branches", "name", branchId,),).toBe("Renamed",);
  });

  test("activate:true moves the display pointer and demotes the other row", async () => {
    const rootId = await msg(MessageRole.User, "root",);
    const first = await fork(rootId, "First",);
    const second = await fork(rootId, "Second",);
    const res = await call(`/api/chats/${CHAT_ID}/branches/${first}`, json("PATCH", { activate: true, },),);
    expect(res.status,).toBe(200,);
    expect(await scalar("chats", "active_branch_id", CHAT_ID,),).toBe(first,);
    expect(await scalar("chat_branches", "is_active", second,),).toBe("0",);
  });
});

describe("branch delete", () => {
  test("refuses the active branch → 400 and the row survives", async () => {
    const rootId = await msg(MessageRole.User, "root",);
    const active = await fork(rootId, "Active",);
    const res = await call(`/api/chats/${CHAT_ID}/branches/${active}`, { method: "DELETE", },);
    expect(res.status,).toBe(400,);
    expect(await scalar("chat_branches", "parent_message_id", active,),).toBe(rootId,);
  });

  test("removes an inactive branch and leaves its sibling alone", async () => {
    const rootId = await msg(MessageRole.User, "root",);
    const keeper = await fork(rootId, "Keeper",);
    const doomed = await fork(rootId, "Doomed",);
    await activate(keeper,);

    const res = await call(`/api/chats/${CHAT_ID}/branches/${doomed}`, { method: "DELETE", },);
    expect(res.status,).toBe(200,);
    expect((await res.json() as { data: { deletedBranchId: string } }).data.deletedBranchId,).toBe(doomed,);
    expect(await scalar("chat_branches", "parent_message_id", doomed,),).toBeUndefined();
    expect(await scalar("chat_branches", "parent_message_id", keeper,),).toBe(rootId,);
  });
});

describe("branch merge", () => {
  test("re-parents the source's exclusive descendants and consumes the source", async () => {
    const rootId = await msg(MessageRole.User, "root",);
    const sharedId = await msg(MessageRole.Assistant, "shared", rootId,);
    // A branch row's tip is its fork point, so the target must be forked AT
    // its own continuation to have anything past the shared node.
    const targetLeaf = await msg(MessageRole.User, "main leaf", sharedId,);
    const targetId = await fork(targetLeaf, "Main",);
    const sourceId = await fork(sharedId, "Alt",);
    const altLeaf = await msg(MessageRole.User, "alt leaf", sharedId,);
    await activate(targetId,);
    const path = `/api/chats/${CHAT_ID}/branches/${sourceId}/merge`;
    const res = await call(path, json("POST", { intoBranchId: targetId, },),);
    expect(res.status,).toBe(200,);
    const parsed = await res.json() as {
      data: {
        movedMessageIds: string[];
        sourceBranchId: string;
        targetBranchId: string;
        deletedSourceBranchId: string;
      };
    };
    expect(parsed.data.sourceBranchId,).toBe(sourceId,);
    expect(parsed.data.targetBranchId,).toBe(targetId,);
    // The shared fork point is already on the target path: only the alt leaf moves.
    expect(parsed.data.movedMessageIds,).toEqual([altLeaf,],);
    expect(parsed.data.deletedSourceBranchId,).toBe(sourceId,);
    expect(await scalar("chat_branches", "parent_message_id", targetId,),).toBe(altLeaf,);
    expect(await scalar("chat_branches", "parent_message_id", sourceId,),).toBeUndefined();
    expect(await scalar("messages", "parent_id", altLeaf,),).toBe(targetLeaf,);
  });

  test("into a branch from another chat → 404 and nothing moves", async () => {
    const rootId = await msg(MessageRole.User, "root",);
    const sourceId = await fork(rootId, "Src",);
    const foreignRoot = await insertMessages(tdb.db, OTHER_CHAT_ID, OWNER_ID, MessageRole.User, "o",);
    const foreign = await fork(foreignRoot, undefined, OTHER_CHAT_ID,);
    const path = `/api/chats/${CHAT_ID}/branches/${sourceId}/merge`;
    const res = await call(path, json("POST", { intoBranchId: foreign, },),);
    expect(res.status,).toBe(404,);
    expect(await scalar("chat_branches", "parent_message_id", sourceId,),).toBe(rootId,);
  });
});

describe("branch list pagination", () => {
  test("the last page reports no cursor", async () => {
    const rootId = await msg(MessageRole.User, "root",);
    for (let i = 1; i <= 3; i++) { await fork(rootId, `Paged ${i}`,); }
    const firstRes = await call(`/api/chats/${CHAT_ID}/branches?limit=2`, { method: "GET", },);
    expect(firstRes.status,).toBe(200,);
    const first = await firstRes.json() as {
      data: { branches: { id: string; messageCount: number }[]; nextCursor: string | null };
    };
    expect(first.data.branches.length,).toBe(2,);
    expect(first.data.branches[0]!.messageCount,).toBeGreaterThan(0,);
    expect(first.data.nextCursor,).toBeTruthy();
    const cursor = encodeURIComponent(first.data.nextCursor ?? "",);
    const lastRes = await call(`/api/chats/${CHAT_ID}/branches?limit=2&cursor=${cursor}`, { method: "GET", },);
    expect(lastRes.status,).toBe(200,);
    const last = await lastRes.json() as { data: { branches: unknown[]; nextCursor: string | null } };
    expect(last.data.branches.length,).toBe(1,);
    expect(last.data.nextCursor,).toBeNull();
  });

  test("a malformed limit is a 400, not a silent default", async () => {
    await fork(await msg(MessageRole.User, "root",),);
    for (const query of ["limit=abc", "limit=0", "limit=-5", "limit=2.9",]) {
      const res = await call(`/api/chats/${CHAT_ID}/branches?${query}`, { method: "GET", },);
      expect(res.status, `${query} must be rejected`,).toBe(400,);
    }
  });
});

describe("branch route trust boundary", () => {
  test("a non-participant is refused on every CRUD endpoint and mutates nothing", async () => {
    const branchId = await fork(await msg(MessageRole.User, "root",), "Owned",);
    const base = `/api/chats/${CHAT_ID}/branches/${branchId}`;
    expect((await call(base, { method: "GET", }, STRANGER_ID,)).status,).toBe(404,);
    expect((await call(base, json("PATCH", { name: "Hax", },), STRANGER_ID,)).status,).toBe(404,);
    expect((await call(base, { method: "DELETE", }, STRANGER_ID,)).status,).toBe(404,);
    expect((await call(`${base}/merge`, json("POST", {},), STRANGER_ID,)).status,).toBe(404,);
    expect(await scalar("chat_branches", "name", branchId,),).toBe("Owned",);
  });

  test("401 without a session user", async () => {
    const branchId = await fork(await msg(MessageRole.User, "root",),);
    const base = `/api/chats/${CHAT_ID}/branches/${branchId}`;
    expect((await call(base, { method: "GET", }, null,)).status,).toBe(401,);
    expect((await call(base, json("PATCH", { name: "x", },), null,)).status,).toBe(401,);
    expect((await call(base, { method: "DELETE", }, null,)).status,).toBe(401,);
    expect((await call(`${base}/merge`, { method: "POST", }, null,)).status,).toBe(401,);
  });
});
