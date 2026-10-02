// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for chat branches (FEAT-045).
 *
 * Pins the trust-boundary contract that branch ownership is derived from
 * the SESSION user, never a client-supplied identity. The service layer
 * already enforces `checkChatAccess`; these tests prove the route layer
 * forwards the resolved userId (not a body field) into that check.
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
const MEMBER_ID = randomUUID();
const STRANGER_ID = randomUUID();
const CHAT_ID = randomUUID();
const OTHER_CHAT_ID = randomUUID();

let tdb: TestDb;

function makeApp(db: TestDb["db"], userId: string | null,) {
  const config = createConfigSchema().defaults as Config;
  return new Elysia()
    .derive(() => ({ userId, }))
    .use(chatBranchRoutes({ database: db, config, },),);
}

beforeEach(async () => {
  createLogger({ level: "error", },);
  tdb = await createTestDb();
  const { db, } = tdb;

  await insertUsers(db, `owner-${OWNER_ID}`, "Owner", { id: OWNER_ID, } as never,);
  await insertUsers(db, `member-${MEMBER_ID}`, "Member", { id: MEMBER_ID, } as never,);
  await insertUsers(db, `stranger-${STRANGER_ID}`, "Stranger", { id: STRANGER_ID, } as never,);
  await insertActors(db, "Owner", { id: OWNER_ID, user_id: OWNER_ID, owner_id: OWNER_ID, } as never,);
  await insertActors(db, "Member", { id: MEMBER_ID, user_id: MEMBER_ID, owner_id: MEMBER_ID, } as never,);
  await insertActors(db, "Stranger", { id: STRANGER_ID, user_id: STRANGER_ID, owner_id: STRANGER_ID, } as never,);

  await insertChats(db, "Adventure", OWNER_ID, { id: CHAT_ID, type: "direct", mode: "direct", } as never,);
  await insertChats(db, "Side Chat", OWNER_ID, { id: OTHER_CHAT_ID, type: "direct", mode: "direct", } as never,);
  await insertChatParticipants(db, CHAT_ID, OWNER_ID, { role_in_chat: ChatParticipantRole.Owner, } as never,);
  await insertChatParticipants(db, CHAT_ID, MEMBER_ID, { role_in_chat: ChatParticipantRole.Member, } as never,);
},);

afterEach(async () => {
  await tdb.db.destroy();
},);

describe("chatBranchRoutes", () => {
  test("401 when no session user", async () => {
    const rootId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "hi",);
    const app = makeApp(tdb.db, null,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/fork`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ messageId: rootId, },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  test("non-participant gets 404 on fork", async () => {
    const rootId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "hi",);
    const app = makeApp(tdb.db, STRANGER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/fork`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ messageId: rootId, },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("non-participant gets 404 on list", async () => {
    const app = makeApp(tdb.db, STRANGER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/branches`, { method: "GET", },),
    );
    expect(res.status,).toBe(404,);
  });

  test("owner creates branch → 201", async () => {
    const rootId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "hi",);
    const app = makeApp(tdb.db, OWNER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/fork`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ messageId: rootId, name: "Custom", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const body = await res.json() as { data: { branch: { name: string }; messagePath: string[] } };
    expect(body.data.branch.name,).toBe("Custom",);
    expect(body.data.messagePath,).toEqual([rootId,],);
  });

  test("auto-naming: Branch 1, Branch 2", async () => {
    const rootId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "hi",);
    const app = makeApp(tdb.db, OWNER_ID,);
    for (let i = 1; i <= 2; i++) {
      const res = await app.handle(
        new Request(`http://localhost/api/chats/${CHAT_ID}/fork`, {
          method: "POST",
          headers: { "content-type": "application/json", },
          body: JSON.stringify({ messageId: rootId, },),
        },),
      );
      expect(res.status,).toBe(201,);
      const body = await res.json() as { data: { branch: { name: string } } };
      expect(body.data.branch.name,).toBe(`Branch ${i}`,);
    }
  });

  test("fork from a different chat's message → 404", async () => {
    const otherMsgId = await insertMessages(tdb.db, OTHER_CHAT_ID, OWNER_ID, MessageRole.User, "other",);
    const app = makeApp(tdb.db, OWNER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/fork`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ messageId: otherMsgId, },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("switch active branch → 200 and updates chat", async () => {
    const rootId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "hi",);
    const app = makeApp(tdb.db, OWNER_ID,);
    const createRes = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/fork`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ messageId: rootId, },),
      },),
    );
    expect(createRes.status,).toBe(201,);
    const createBody = await createRes.json() as { data: { branch: { id: string } } };
    const branchId = createBody.data.branch.id;

    const switchRes = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/active-branch`, {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ branchId, },),
      },),
    );
    expect(switchRes.status,).toBe(200,);
    const switchBody = await switchRes.json() as { data: { activeBranchId: string } };
    expect(switchBody.data.activeBranchId,).toBe(branchId,);
    // The response only echoes the request; the DB is the contract. Without
    // this read, a no-op service that never persists still passes.
    const chat = await tdb.db
      .selectFrom("chats",)
      .select(["active_branch_id",],)
      .where("id", "=", CHAT_ID,)
      .executeTakeFirst();
    expect(chat?.active_branch_id,).toBe(branchId,);
  });

  test("switch rejects a branch from a different chat → 404", async () => {
    const rootId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "hi",);
    const app = makeApp(tdb.db, OWNER_ID,);
    const createRes = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/fork`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ messageId: rootId, },),
      },),
    );
    const createBody = await createRes.json() as { data: { branch: { id: string } } };
    const branchId = createBody.data.branch.id;

    const res = await app.handle(
      new Request(`http://localhost/api/chats/${OTHER_CHAT_ID}/active-branch`, {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ branchId, },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("list returns exact per-branch metadata → 200", async () => {
    const stamp = "2026-01-01T00:00:00.000Z";
    const rootId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "hi", {
      created_at: stamp,
    },);
    const midId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.Assistant, "mid", {
      parent_id: rootId,
      created_at: stamp,
    });
    const tipId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "tip", {
      parent_id: midId,
      created_at: stamp,
    });
    const app = makeApp(tdb.db, OWNER_ID,);
    for (const messageId of [rootId, midId, tipId,]) {
      const forkRes = await app.handle(
        new Request(`http://localhost/api/chats/${CHAT_ID}/fork`, {
          method: "POST",
          headers: { "content-type": "application/json", },
          body: JSON.stringify({ messageId, },),
        },),
      );
      expect(forkRes.status,).toBe(201,);
    }
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/branches`, { method: "GET", },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      data: { branches: { id: string; parentMessageId: string; messageCount: number; lastActivity: string | null }[] };
    };
    // Exact counts, not "greater than zero": the walk is root→tip, so the
    // fork at `tipId` sees all three messages and the one at `rootId` sees one.
    const byTip = new Map(body.data.branches.map((b,) => [b.parentMessageId, b,],),);
    expect(body.data.branches.length,).toBe(3,);
    expect(byTip.get(rootId,)?.messageCount,).toBe(1,);
    expect(byTip.get(midId,)?.messageCount,).toBe(2,);
    expect(byTip.get(tipId,)?.messageCount,).toBe(3,);
    // lastActivity is the TIP message's created_at, not merely present.
    expect(byTip.get(tipId,)?.lastActivity,).toBe(stamp,);
    expect(byTip.get(rootId,)?.lastActivity,).toBe(stamp,);
  });

  test("non-owner participant can fork → 201", async () => {
    const rootId = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "hi",);
    const app = makeApp(tdb.db, MEMBER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/fork`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ messageId: rootId, },),
      },),
    );
    expect(res.status,).toBe(201,);
  });
});
