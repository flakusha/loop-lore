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

/** App with the branch routes mounted, deriving the session user. */
function makeApp(db: TestDb["db"], userId: string | null,) {
  const config = createConfigSchema().defaults as Config;
  return new Elysia()
    .derive(() => ({ userId, }))
    .use(chatBranchRoutes({ database: db, config, },),);
}
/** Issue a request as `userId` (null = no session) and return the response. */
function call(path: string, init?: RequestInit, userId: string | null = OWNER_ID,): Promise<Response> {
  return makeApp(tdb.db, userId,).handle(new Request(`http://localhost${path}`, init,),);
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

describe("branch merge consumes the source", () => {
  test("the merged branch is gone: 404 on detail, 404 on re-merge, no row survives", async () => {
    const rootId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "root",);
    const targetId = await fork(rootId, "Main",);
    const sourceId = await fork(rootId, "Alt",);
    const altLeafId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "alt leaf", {
      parent_id: rootId,
    },);
    await activate(targetId,);

    // What B saw before the merge — the branch must never report this after.
    const beforeRes = await makeApp(tdb.db, OWNER_ID,).handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/branches/${sourceId}`, { method: "GET", },),
    );
    const before = await beforeRes.json() as { data: { messagePath: string[] } };
    expect(before.data.messagePath,).toEqual([rootId,],);

    const merge = await makeApp(tdb.db, OWNER_ID,).handle(
      new Request(
        `http://localhost/api/chats/${CHAT_ID}/branches/${sourceId}/merge`,
        json("POST", { intoBranchId: targetId, },),
      ),
    );
    expect(merge.status,).toBe(200,);

    // Consumed: the detail route no longer resolves the source at all, so it
    // cannot report a main line the branch never contained.
    const after = await makeApp(tdb.db, OWNER_ID,).handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/branches/${sourceId}`, { method: "GET", },),
    );
    expect(after.status,).toBe(404,);
    const reMerge = await makeApp(tdb.db, OWNER_ID,).handle(
      new Request(
        `http://localhost/api/chats/${CHAT_ID}/branches/${sourceId}/merge`,
        json("POST", { intoBranchId: targetId, },),
      ),
    );
    expect(reMerge.status,).toBe(404,);
    const rows = await tdb.db
      .selectFrom("chat_branches",)
      .select(["id",],)
      .where("chat_id", "=", CHAT_ID,)
      .execute();
    expect(rows.map((r,) => r.id).sort(),).toEqual([targetId,],);
    // The folded messages now live on the target.
    const targetRes = await makeApp(tdb.db, OWNER_ID,).handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/branches/${targetId}`, { method: "GET", },),
    );
    const targetBody = await targetRes.json() as { data: { messagePath: string[] } };
    expect(targetBody.data.messagePath,).toEqual([rootId, altLeafId,],);
  });

  test("merging the chat's active branch is refused and the pointer is left intact", async () => {
    const rootId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "root",);
    const targetId = await fork(rootId, "Main",);
    const sourceId = await fork(rootId, "Alt",);
    await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "alt leaf", {
      parent_id: rootId,
    },);
    // `sourceId` is the newest fork and therefore the displayed branch.
    const chatBefore = await tdb.db
      .selectFrom("chats",)
      .select(["active_branch_id",],)
      .where("id", "=", CHAT_ID,)
      .executeTakeFirst();
    expect(chatBefore?.active_branch_id,).toBe(sourceId,);

    const res = await makeApp(tdb.db, OWNER_ID,).handle(
      new Request(
        `http://localhost/api/chats/${CHAT_ID}/branches/${sourceId}/merge`,
        json("POST", { intoBranchId: targetId, },),
      ),
    );
    expect(res.status,).toBe(400,);
    const parsed = await res.json() as { error: string };
    expect(parsed.error,).toContain("active branch",);
    // Nothing moved and nothing was consumed: the display still resolves.
    const chatAfter = await tdb.db
      .selectFrom("chats",)
      .select(["active_branch_id",],)
      .where("id", "=", CHAT_ID,)
      .executeTakeFirst();
    expect(chatAfter?.active_branch_id,).toBe(sourceId,);
    const sourceRow = await tdb.db
      .selectFrom("chat_branches",)
      .select(["id",],)
      .where("id", "=", sourceId,)
      .executeTakeFirst();
    expect(sourceRow?.id,).toBe(sourceId,);
  });

  test("a desynced active pointer still blocks the merge", async () => {
    const rootId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "root",);
    const targetId = await fork(rootId, "Main",);
    const sourceId = await fork(rootId, "Alt",);
    // The source row claims active while the chat pointer says otherwise —
    // the same desync `deleteBranch` refuses to walk past.
    await tdb.db
      .updateTable("chat_branches",)
      .set({ is_active: 1, },)
      .where("id", "=", sourceId,)
      .execute();
    await tdb.db
      .updateTable("chats",)
      .set({ active_branch_id: targetId, },)
      .where("id", "=", CHAT_ID,)
      .execute();

    const res = await makeApp(tdb.db, OWNER_ID,).handle(
      new Request(
        `http://localhost/api/chats/${CHAT_ID}/branches/${sourceId}/merge`,
        json("POST", { intoBranchId: targetId, },),
      ),
    );
    expect(res.status,).toBe(400,);
    const row = await tdb.db
      .selectFrom("chat_branches",)
      .select(["id",],)
      .where("id", "=", sourceId,)
      .executeTakeFirst();
    expect(row?.id,).toBe(sourceId,);
  });

  test("a subtree over the merge ceiling is rejected with zero messages re-parented", async () => {
    const rootId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "root",);
    const targetId = await fork(rootId, "Main",);
    const sourceId = await fork(rootId, "Alt",);
    await activate(targetId,);
    // 2100 exclusive descendants > the 2000-node ceiling. Bulk-inserted:
    // the ceiling walk, not the seeding, is what this exercises.
    const ids = Array.from({ length: 2100, }, () => randomUUID(),);
    const rows = ids.map((id, i,) => ({
      id,
      chat_id: CHAT_ID,
      actor_id: OWNER_ID,
      role: MessageRole.User,
      content: `bulk ${i}`,
      parent_id: i === 0 ? rootId : ids[i - 1]!,
    }));
    for (let i = 0; i < rows.length; i += 200) {
      await tdb.db.insertInto("messages",).values(rows.slice(i, i + 200,) as never,).execute();
    }

    const res = await makeApp(tdb.db, OWNER_ID,).handle(
      new Request(
        `http://localhost/api/chats/${CHAT_ID}/branches/${sourceId}/merge`,
        json("POST", { intoBranchId: targetId, },),
      ),
    );
    expect(res.status,).toBe(400,);
    const parsed = await res.json() as { code: string; error: string };
    expect(parsed.code,).toBe("bad_request",);
    expect(parsed.error,).toContain("ceiling",);

    // Rejected BEFORE the transaction: no re-parenting, no consumed row.
    const first = await tdb.db
      .selectFrom("messages",)
      .select(["parent_id",],)
      .where("id", "=", ids[0]!,)
      .executeTakeFirst();
    expect(first?.parent_id,).toBe(rootId,);
    const last = await tdb.db
      .selectFrom("messages",)
      .select(["parent_id",],)
      .where("id", "=", ids[ids.length - 1]!,)
      .executeTakeFirst();
    expect(last?.parent_id,).toBe(ids[ids.length - 2]!,);
    const targetRow = await tdb.db
      .selectFrom("chat_branches",)
      .select(["parent_message_id",],)
      .where("id", "=", targetId,)
      .executeTakeFirst();
    expect(targetRow?.parent_message_id,).toBe(rootId,);
    const sourceRow = await tdb.db
      .selectFrom("chat_branches",)
      .select(["id",],)
      .where("id", "=", sourceId,)
      .executeTakeFirst();
    expect(sourceRow?.id,).toBe(sourceId,);
  });
});
describe("branch merge default target", () => {
  test("a bodyless merge lands on the chat's active branch", async () => {
    const rootId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "root",);
    const targetId = await fork(rootId, "Main",);
    const sourceId = await fork(rootId, "Alt",);
    const altLeafId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "alt leaf", {
      parent_id: rootId,
    },);
    // `targetId` is now the active branch (the newest fork demoted it, so
    // point the display back at it to exercise the default resolution).
    await activate(targetId,);

    // No body at all: the documented default is the active branch.
    const res = await makeApp(tdb.db, OWNER_ID,).handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/branches/${sourceId}/merge`, { method: "POST", },),
    );
    expect(res.status,).toBe(200,);
    const parsed = await res.json() as { data: { targetBranchId: string; movedMessageIds: string[] } };
    expect(parsed.data.targetBranchId,).toBe(targetId,);
    expect(parsed.data.movedMessageIds,).toEqual([altLeafId,],);
    const moved = await tdb.db
      .selectFrom("messages",)
      .select(["parent_id",],)
      .where("id", "=", altLeafId,)
      .executeTakeFirst();
    expect(moved?.parent_id,).toBe(rootId,);
  });

  test("merging a branch into itself by default is refused, not silently a no-op", async () => {
    const rootId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "root",);
    const only = await fork(rootId, "Solo",);
    const res = await makeApp(tdb.db, OWNER_ID,).handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/branches/${only}/merge`, { method: "POST", },),
    );
    expect(res.status,).toBe(400,);
  });
});

describe("branch route error paths", () => {
  test("every CRUD endpoint 404s on an unknown branchId", async () => {
    const rootId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "root",);
    const survivor = await fork(rootId, "Survivor",);
    const ghost = randomUUID();
    const base = `http://localhost/api/chats/${CHAT_ID}/branches/${ghost}`;
    const app = makeApp(tdb.db, OWNER_ID,);
    for (
      const res of [
        await app.handle(new Request(base, { method: "GET", },),),
        await app.handle(new Request(base, json("PATCH", { name: "x", },),),),
        await app.handle(new Request(base, { method: "DELETE", },),),
      ]
    ) {
      expect(res.status,).toBe(404,);
      const parsed = await res.json() as { code: string };
      expect(parsed.code,).toBe("not_found",);
    }
    const merge = await app.handle(new Request(`${base}/merge`, { method: "POST", },),);
    expect(merge.status,).toBe(404,);
    // None of the 404s may have mutated the chat's branch set.
    const only = await tdb.db
      .selectFrom("chat_branches",)
      .select(["id",],)
      .where("chat_id", "=", CHAT_ID,)
      .executeTakeFirst();
    expect(only?.id,).toBe(survivor,);
  });
});

describe("branch list limit parsing", () => {
  test("a non-numeric or non-positive limit is rejected → 400, not silently defaulted", async () => {
    const rootId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "root",);
    for (let i = 0; i < 5; i++) { await fork(rootId, `N${i}`,); }
    const app = makeApp(tdb.db, OWNER_ID,);
    for (const query of ["limit=abc", "limit=0", "limit=-5", "limit=2.9", "limit=1e3", "limit=%20",]) {
      const res = await app.handle(
        new Request(`http://localhost/api/chats/${CHAT_ID}/branches?${query}`, { method: "GET", },),
      );
      expect(res.status, `${query} must be rejected`,).toBe(400,);
    }
  });

  test("an absent limit uses the default page size", async () => {
    const rootId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "root",);
    for (let i = 0; i < 25; i++) { await fork(rootId, `N${i}`,); }
    const res = await makeApp(tdb.db, OWNER_ID,).handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/branches`, { method: "GET", },),
    );
    expect(res.status,).toBe(200,);
    const parsed = await res.json() as { data: { branches: unknown[] } };
    expect(parsed.data.branches.length,).toBe(20,);
  });

  test("limit above the 100-row ceiling returns exactly 100 rows, not all of them", async () => {
    const rootId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "root",);
    // 120 > the 100 ceiling, so a clamped page is distinguishable from an
    // unclamped one: 100 rows, not 120.
    for (let i = 0; i < 120; i++) { await fork(rootId, `C${i}`,); }
    const res = await makeApp(tdb.db, OWNER_ID,).handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/branches?limit=9999`, { method: "GET", },),
    );
    expect(res.status,).toBe(200,);
    const parsed = await res.json() as { data: { branches: unknown[]; nextCursor: string | null } };
    expect(parsed.data.branches.length,).toBe(100,);
    // A truncated page must offer the rest, or the tail is unreachable.
    expect(parsed.data.nextCursor,).toBeTruthy();
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

describe("branch name validation", () => {
  test("an over-long name is rejected on create and rename, and nothing is stored", async () => {
    const rootId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "root",);
    const branchId = await fork(rootId, "Short",);
    const tooLong = "x".repeat(10_000,);
    const createRes = await makeApp(tdb.db, OWNER_ID,).handle(
      new Request(
        `http://localhost/api/chats/${CHAT_ID}/branches`,
        json("POST", { messageId: rootId, name: tooLong, },),
      ),
    );
    expect(createRes.status,).toBe(422,);
    const renameRes = await makeApp(tdb.db, OWNER_ID,).handle(
      new Request(
        `http://localhost/api/chats/${CHAT_ID}/branches/${branchId}`,
        json("PATCH", { name: tooLong, },),
      ),
    );
    expect(renameRes.status,).toBe(422,);
    const row = await tdb.db
      .selectFrom("chat_branches",)
      .select(["name",],)
      .where("id", "=", branchId,)
      .executeTakeFirst();
    expect(row?.name,).toBe("Short",);
  });

  test("a name with control characters is rejected and the stored name survives", async () => {
    const rootId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "root",);
    const branchId = await fork(rootId, "Keep Me",);
    const res = await makeApp(tdb.db, OWNER_ID,).handle(
      new Request(
        `http://localhost/api/chats/${CHAT_ID}/branches/${branchId}`,
        json("PATCH", { name: "bad\u0000name", },),
      ),
    );
    expect(res.status,).toBe(422,);
    const row = await tdb.db
      .selectFrom("chat_branches",)
      .select(["name",],)
      .where("id", "=", branchId,)
      .executeTakeFirst();
    expect(row?.name,).toBe("Keep Me",);
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
