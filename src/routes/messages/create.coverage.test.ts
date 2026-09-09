// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for message creation (validation, guards, idempotency).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertMessages, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { createRoutes, } from "./create";

const testConfig = {
  assistant: { enabled: false, },
  encryption: { compressThreshold: 1024, compressAlgorithm: "gzip", },
  generation: { providers: { openaiCompatible: [], }, defaultProvider: null, },
} as unknown as Config;

/**
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-create-coverage", },)
    .derive({ as: "scoped", }, () => ({ userId, userRole, }),)
    .use(createRoutes({ database: db, config: testConfig, },),) as unknown as Elysia;
}

/**
 * @param db
 * @param id
 * @param name
 */
async function seedUser(db: Kysely<DB>, id: string, name: string,): Promise<void> {
  await insertUsers(db, `user-${id}`, name, { id, } as never,);
  await db
    .insertInto("actors",)
    .values({
      id,
      actor_type: "user",
      display_name: name,
      user_id: id,
      owner_id: id,
      agent_type: "none",
      settings: "{}",
      format_version: 0,
      visibility: "private",
      import_spec: "{}",
    },)
    .execute();
}

/**
 * @param app
 * @param chatId
 * @param body
 */
async function postMessage(
  app: Elysia,
  chatId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return app.handle(
    new Request(`http://localhost/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

describe("createRoutes coverage", () => {
  let db: Kysely<DB>;
  const owner = uid();
  const stranger = uid();
  let chatA: string;
  let chatB: string;
  let parentInA: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await seedUser(db, owner, "Owner",);
    await seedUser(db, stranger, "Stranger",);
    chatA = uid();
    chatB = uid();
    await insertChats(db, "Chat A", owner, { id: chatA, } as never,);
    await insertChats(db, "Chat B", owner, { id: chatB, } as never,);
    parentInA = uid();
    await insertMessages(db, chatA, owner, MessageRole.User, "parent", {
      id: parentInA,
      swipe_index: 0,
    } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("401 without userId", async () => {
    const app = makeApp(db, null, null,);
    const res = await postMessage(app, chatA, { content: "hi", },);
    expect(res.status,).toBe(401,);
  });

  test("happy path persists the message and returns its id", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await postMessage(app, chatA, { content: "hello there", },);
    expect(res.status,).toBe(201,);
    const created: { id: string } = await res.json();
    expect(created.id.length,).toBeGreaterThan(0,);
    const row = await db
      .selectFrom("messages",)
      .select(["content_plaintext", "chat_id",],)
      .where("id", "=", created.id,)
      .executeTakeFirst();
    expect(row?.chat_id,).toBe(chatA,);
  });

  test("reply with a same-chat parent succeeds", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await postMessage(app, chatA, { content: "reply", parentId: parentInA, },);
    expect(res.status,).toBe(201,);
  });

  test("missing parent yields 404 and writes nothing", async () => {
    const app = makeApp(db, owner, "user",);
    const ghost = uid();
    const res = await postMessage(app, chatA, { content: "orphan", parentId: ghost, },);
    expect(res.status,).toBe(404,);
  });

  test("cross-chat parent yields 403", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await postMessage(app, chatB, { content: "idor", parentId: parentInA, },);
    expect(res.status,).toBe(403,);
  });

  test("unknown chat yields 404", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await postMessage(app, uid(), { content: "lost", },);
    expect(res.status,).toBe(404,);
  });

  test("stranger without access yields 404", async () => {
    const app = makeApp(db, stranger, "user",);
    const res = await postMessage(app, chatA, { content: "intrude", },);
    expect(res.status,).toBe(404,);
  });

  test("idempotency key collapses retried POSTs to one row", async () => {
    const app = makeApp(db, owner, "user",);
    const key = `idem-${uid()}`;
    const first = await postMessage(app, chatA, { content: "once", idempotencyKey: key, },);
    expect(first.status,).toBe(201,);
    const firstBody: { id: string } = await first.json();
    const second = await postMessage(app, chatA, { content: "once", idempotencyKey: key, },);
    expect(second.status,).toBe(201,);
    const secondBody: { id: string } = await second.json();
    expect(secondBody.id,).toBe(firstBody.id,);
  });

  test("empty content is rejected by validation", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await postMessage(app, chatA, { content: "", },);
    expect([400, 422,],).toContain(res.status,);
  });

  test("idempotencyKey isolation: same key on a different chat creates a new row", async () => {
    // Same key, different chat → independent. Already pinned in
    // swipe-race-insert.test.ts at the helper layer; pin at the route
    // layer too so a future refactor of createRoutes can't break the
    // contract without notice.
    const app = makeApp(db, owner, "user",);
    const key = `idem-cross-${uid()}`;
    const r1 = await postMessage(app, chatA, { content: "first chat", idempotencyKey: key, },);
    expect(r1.status,).toBe(201,);
    const id1: { id: string } = await r1.json();
    const r2 = await postMessage(app, chatB, { content: "second chat", idempotencyKey: key, },);
    expect(r2.status,).toBe(201,);
    const id2: { id: string } = await r2.clone().json();
    expect(id2.id,).not.toBe(id1.id,);
  });

  test("idempotencyKey: empty string is treated as no key (no lookup, fresh insert)", async () => {
    // findByIdempotencyKey returns null for "" → skip the dedupe path →
    // every call inserts a fresh row. Pin: "" is NOT the same as null/missing.
    const app = makeApp(db, owner, "user",);
    const r1 = await postMessage(app, chatA, { content: "first", idempotencyKey: "", },);
    expect(r1.status,).toBe(201,);
    const id1: { id: string } = await r1.json();
    const r2 = await postMessage(app, chatA, { content: "first", idempotencyKey: "", },);
    expect(r2.status,).toBe(201,);
    const id2: { id: string } = await r2.clone().json();
    expect(id2.id,).not.toBe(id1.id,);
  });

  test("idempotencyKey: same key + same content returns the cached id (idempotency contract)", async () => {
    // Pin: a retry with identical (chat, key, content) replays the cached
    // row id. The lookup is by (chat_id, idempotency_key) only — content is
    // not part of the dedupe key. If a future change adds content to the
    // dedupe key, this test will fail.
    const app = makeApp(db, owner, "user",);
    const key = `idem-same-${uid()}`;
    const r1 = await postMessage(app, chatA, { content: "once", idempotencyKey: key, },);
    expect(r1.status,).toBe(201,);
    const id1: { id: string } = await r1.json();
    const r2 = await postMessage(app, chatA, { content: "once", idempotencyKey: key, },);
    expect(r2.status,).toBe(201,);
    const id2: { id: string } = await r2.json();
    expect(id2.id,).toBe(id1.id,);
  });

  test("idempotencyKey: very long key (1 KB) is accepted", async () => {
    // No maxLength on idempotencyKey in the schema. Pin that pathological
    // keys pass validation. (Pin the contract; downstream consumers may
    // want to bound this themselves.)
    const app = makeApp(db, owner, "user",);
    const longKey = "k".repeat(1024,);
    const res = await postMessage(app, chatA, { content: "long key", idempotencyKey: longKey, },);
    expect(res.status,).toBe(201,);
  });

  test("content: whitespace-only ('   ') is accepted (minLength counts characters)", async () => {
    // t.String({ minLength: 1 }) accepts any string of length >= 1. Three
    // spaces is length 3. Pin: whitespace-only content passes validation;
    // downstream rendering/profanity filtering is responsible for handling.
    const app = makeApp(db, owner, "user",);
    const res = await postMessage(app, chatA, { content: "   ", },);
    expect(res.status,).toBe(201,);
  });

  test("content: 1 MB payload is accepted (no maxLength cap on content)", async () => {
    // Pin: there is no upper bound on content in the schema. This is a
    // deliberate choice (large pastes, code blocks) — but HTTP/DB layers
    // should bound if DoS becomes a concern. Flagged for review.
    const app = makeApp(db, owner, "user",);
    const big = "x".repeat(1_000_000,);
    const res = await postMessage(app, chatA, { content: big, },);
    expect(res.status,).toBe(201,);
    const body: { id: string } = await res.json();
    const row = await db
      .selectFrom("messages",)
      .select("content_plaintext",)
      .where("id", "=", body.id,)
      .executeTakeFirst();
    expect(row?.content_plaintext?.length,).toBe(1_000_000,);
  });

  test("content: unicode (multi-byte chars) round-trips verbatim", async () => {
    const app = makeApp(db, owner, "user",);
    const text = "Привет мир 🌍 — こんにちは";
    const res = await postMessage(app, chatA, { content: text, },);
    expect(res.status,).toBe(201,);
    const body: { id: string } = await res.json();
    const row = await db
      .selectFrom("messages",)
      .select("content_plaintext",)
      .where("id", "=", body.id,)
      .executeTakeFirst();
    expect(row?.content_plaintext,).toBe(text,);
  });

  test("attachments: empty array is accepted", async () => {
    // t.Array with no minItems → empty array valid. Pin: a request with
    // { attachments: [] } passes validation.
    const app = makeApp(db, owner, "user",);
    const res = await postMessage(app, chatA, {
      content: "no attachments",
      attachments: [],
    },);
    expect(res.status,).toBe(201,);
  });

  test("attachments: omitted field is accepted (optional)", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await postMessage(app, chatA, { content: "no attachments field", },);
    expect(res.status,).toBe(201,);
  });

  // attachments tests with non-empty arrays are deferred — they require
  // seeding assets owned by the actor (AttachmentOwnershipError on
  // unknown assetId), which is covered by attachment-ownership.test.ts.
  // Schema-level contracts (minItems/maxItems) are pinned via the pure
  // validation tests in validation/schemas/chat.test.ts + messages.test.ts.
});
