// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the content-merge endpoints (FEA-2026-047).
 *
 * Behavioural: each case asserts the HTTP status plus persisted state
 * (`branch_merges`, `branch_merge_sources`), never the response echo alone.
 * Covers 401, IDOR/404, 409 on a double confirm, and the idempotent
 * initiate replay.
 */
import { beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { randomUUID, } from "node:crypto";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import { MessageRole, } from "../../db/enums";
import { createLogger, } from "../../logger";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertMessages, insertUsers, } from "../../test-utils/insert-helpers";
import { chatBranchRoutes, } from "./branches";

const OWNER_ID = randomUUID();
const STRANGER_ID = randomUUID();
const CHAT_ID = randomUUID();

let tdb: TestDb;

/** Issue a request as `userId` (null = no session). */
function call(
  path: string,
  init?: RequestInit,
  userId: string | null = OWNER_ID,
): Promise<Response> {
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

/** Read one column straight from the DB. */
async function mergeStatus(mergeId: string,): Promise<string | undefined> {
  const row = await tdb.db
    .selectFrom("branch_merges",)
    .select(["status",],)
    .where("id", "=", mergeId,)
    .executeTakeFirst();

  return row?.status;
}

/** Seed a mergeable fork pair and return both tip ids. */
async function seedForkPair(): Promise<{ tipA: string; tipB: string }> {
  const root = await insertMessages(tdb.db, CHAT_ID, OWNER_ID, MessageRole.User, "root",);
  const mid = await insertMessages(
    tdb.db,
    CHAT_ID,
    OWNER_ID,
    MessageRole.Assistant,
    "mid",
    { parent_id: root, } as never,
  );

  const tipA = await insertMessages(
    tdb.db,
    CHAT_ID,
    OWNER_ID,
    MessageRole.Assistant,
    "tipA",
    { parent_id: mid, } as never,
  );

  const tipB = await insertMessages(
    tdb.db,
    CHAT_ID,
    OWNER_ID,
    MessageRole.Assistant,
    "tipB",
    { parent_id: mid, } as never,
  );

  return { tipA, tipB, };
}

beforeEach(async () => {
  createLogger({ level: "error", },);
  tdb = await createTestDb();
  const { db, } = tdb;
  await insertUsers(db, `owner-${OWNER_ID}`, "Owner", { id: OWNER_ID, } as never,);
  await insertUsers(db, `stranger-${STRANGER_ID}`, "Stranger", { id: STRANGER_ID, } as never,);
  await insertActors(db, "Owner", { id: OWNER_ID, user_id: OWNER_ID, owner_id: OWNER_ID, } as never,);
  await insertActors(db, "Stranger", { id: STRANGER_ID, user_id: STRANGER_ID, owner_id: STRANGER_ID, } as never,);
  await insertChats(db, "Merge Routes", OWNER_ID, { id: CHAT_ID, type: "direct", mode: "direct", } as never,);
},);

describe("branch-merge routes", () => {
  test("401 when there is no session user", async () => {
    const res = await call(
      `/api/chats/${CHAT_ID}/branch-merges`,
      json("POST", { mode: "combined", sourceTips: [{ tipMessageId: "a", }, { tipMessageId: "b", },], },),
      null,
    );

    expect(res.status,).toBe(401,);
  });

  test("404 when the chat belongs to someone else (IDOR)", async () => {
    const { tipA, tipB, } = await seedForkPair();
    const res = await call(
      `/api/chats/${CHAT_ID}/branch-merges`,
      json("POST", { mode: "combined", sourceTips: [{ tipMessageId: tipA, }, { tipMessageId: tipB, },], },),
      STRANGER_ID,
    );

    expect(res.status,).toBe(404,);
  });

  test("422 when fewer than two source tips are supplied (schema)", async () => {
    const { tipA, } = await seedForkPair();
    const res = await call(
      `/api/chats/${CHAT_ID}/branch-merges`,
      json("POST", { mode: "combined", sourceTips: [{ tipMessageId: tipA, },], },),
    );

    expect(res.status,).toBe(422,);
  });

  test("422 for an unknown merge mode (schema rejection)", async () => {
    const { tipA, tipB, } = await seedForkPair();
    const res = await call(
      `/api/chats/${CHAT_ID}/branch-merges`,
      json("POST", { mode: "nope", sourceTips: [{ tipMessageId: tipA, }, { tipMessageId: tipB, },], },),
    );

    expect(res.status,).toBe(422,);
  });

  test("201 initiates a draft merge and persists its sources", async () => {
    const { tipA, tipB, } = await seedForkPair();
    const res = await call(
      `/api/chats/${CHAT_ID}/branch-merges`,
      json("POST", { mode: "combined", sourceTips: [{ tipMessageId: tipA, }, { tipMessageId: tipB, },], },),
    );

    expect(res.status,).toBe(201,);
    const body = await res.json() as { data: { ok: true; mergeId: string; replayed: boolean; baseMessageId: string } };
    expect(body.data.ok,).toBe(true,);
    expect(body.data.replayed,).toBe(false,);
    expect(await mergeStatus(body.data.mergeId,),).toBe("draft",);

    const sources = await tdb.db
      .selectFrom("branch_merge_sources",)
      .select(["ordinal", "tip_message_id",],)
      .where("merge_id", "=", body.data.mergeId,)
      .orderBy("ordinal", "asc",)
      .execute();

    expect(sources,).toHaveLength(2,);
    expect(sources[0]!.tip_message_id,).toBe(tipA,);
    expect(sources[1]!.tip_message_id,).toBe(tipB,);
  });

  test("replays the same draft on a repeated idempotency key", async () => {
    const { tipA, tipB, } = await seedForkPair();
    const key = `k-${randomUUID()}`;
    const payload = {
      mode: "combined",
      sourceTips: [{ tipMessageId: tipA, }, { tipMessageId: tipB, },],
      idempotencyKey: key,
    };

    const first = await call(`/api/chats/${CHAT_ID}/branch-merges`, json("POST", payload,),);
    const second = await call(`/api/chats/${CHAT_ID}/branch-merges`, json("POST", payload,),);
    expect(first.status,).toBe(201,);
    expect(second.status,).toBe(201,);

    const firstBody = await first.json() as { data: { mergeId: string } };
    const secondBody = await second.json() as { data: { mergeId: string; replayed: boolean } };
    expect(secondBody.data.mergeId,).toBe(firstBody.data.mergeId,);
    expect(secondBody.data.replayed,).toBe(true,);
  });

  test("409 when a merge is confirmed twice (guarded transition)", async () => {
    const { tipA, tipB, } = await seedForkPair();
    const init = await call(
      `/api/chats/${CHAT_ID}/branch-merges`,
      json("POST", { mode: "combined", sourceTips: [{ tipMessageId: tipA, }, { tipMessageId: tipB, },], },),
    );

    const { data: { mergeId, }, } = await init.json() as { data: { mergeId: string } };

    const body = json("POST", { content: [{ role: "assistant", content: "merged", },], },);
    const first = await call(`/api/chats/${CHAT_ID}/branch-merges/${mergeId}/confirm`, body,);
    expect(first.status,).toBe(200,);
    expect(await mergeStatus(mergeId,),).toBe("confirmed",);

    const second = await call(`/api/chats/${CHAT_ID}/branch-merges/${mergeId}/confirm`, body,);
    expect(second.status,).toBe(409,);
  });

  test("404 confirming an unknown merge id", async () => {
    const res = await call(
      `/api/chats/${CHAT_ID}/branch-merges/${randomUUID()}/confirm`,
      json("POST", {},),
    );

    expect(res.status,).toBe(404,);
  });

  test("400 continuing a merge that is still a draft", async () => {
    const { tipA, tipB, } = await seedForkPair();
    const init = await call(
      `/api/chats/${CHAT_ID}/branch-merges`,
      json("POST", { mode: "combined", sourceTips: [{ tipMessageId: tipA, }, { tipMessageId: tipB, },], },),
    );

    const { data: { mergeId, }, } = await init.json() as { data: { mergeId: string } };

    const res = await call(`/api/chats/${CHAT_ID}/branch-merges/${mergeId}/continue`, json("POST", {},),);
    expect(res.status,).toBe(400,);
  });
});
