// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression test for the chat-list scoping predicate (B11).
 *
 * `GET /chats` is served by `src/routes/chats/list.ts` and previously filtered
 * `chats.created_by` only, so a chat you were INVITED to was reachable from
 * htmx (`visibleChatsTo` in src/routes/views/access.ts) but missing from the
 * JSON list the egui frontend calls — the list silently under-reports.
 *
 * Driven through the real v1 barrel (`/api/v1/chats`, the URL
 * `api::chats_list_url` builds) rather than the unversioned handler, so the
 * mount the frontend actually hits is the one under test.
 *
 * Resource contract: one private in-memory SQLite DB (`createTestDb()` returns
 * a fresh `:memory:` handle per call). No ports, no temp paths, no ordering
 * dependence between tests.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { AsyncStore, } from "../../async/store";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { v1Routes, } from "../v1";

interface Paginated {
  data: { id: string }[];
  pagination: { total: number; page: number; pageSize: number; totalPages: number };
}

const VIEWER = "viewer-b11";
const STRANGER = "stranger-b11";

const OWN_CHAT = "chat-b11-own";
const JOINED_CHAT = "chat-b11-joined";
const FOREIGN_CHAT = "chat-b11-foreign";

/** @returns a session store stub — the barrel only stores async job state. */
function stubAsyncStore(): AsyncStore {
  return {
    track() {},
    progress() {},
    complete() {},
    fail() {},
    config: { maxInlineBytes: 65536, defaultTtlMs: 24 * 60 * 60 * 1000, queueLimit: 10_000, },
    async flush() {},
    async read() {
      return null;
    },
    destroy() {},
  };
}

/**
 * @param db
 * @param userId session identity the request runs as
 */
function createV1App(db: Kysely<DB>, userId: string,): Elysia {
  const t = (k: string,) => k;
  return new Elysia({ name: "test-chats-list-scoping", },)
    .derive(() => ({ userId, userRole: "user", sessionId: null, locale: "en", t, }))
    .use(v1Routes({ database: db, config: {} as never, asyncStore: stubAsyncStore(), },),) as unknown as Elysia;
}

/**
 * @param db
 * @param userId session identity the request runs as
 * @param query string appended after `/api/v1/chats`
 * @throws {Error} when the route answers non-200
 * @returns the paginated body the frontend receives
 */
async function listChats(db: Kysely<DB>, userId: string, query = "",): Promise<Paginated> {
  const res = await createV1App(db, userId,)
    .handle(new Request(`http://localhost/api/v1/chats${query}`,),);

  if (res.status !== 200) {
    throw new Error(`GET /api/v1/chats${query} answered ${res.status}`,);
  }

  return await res.json() as Paginated;
}

describe("GET /api/v1/chats — viewer scoping", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    for (const id of [VIEWER, STRANGER,]) {
      await insertUsers(db, id, id, { id: id as never, },);
      await insertActors(db, id, { id: id as never, user_id: id as never, owner_id: id as never, },);
    }

    await insertChats(db, "Own", VIEWER, { id: OWN_CHAT as never, },);
    await insertChatParticipants(db, OWN_CHAT, VIEWER,);

    await insertChats(db, "Joined", STRANGER, { id: JOINED_CHAT as never, },);
    await insertChatParticipants(db, JOINED_CHAT, VIEWER,);
    await insertChatParticipants(db, JOINED_CHAT, STRANGER,);

    await insertChats(db, "Foreign", STRANGER, { id: FOREIGN_CHAT as never, },);
    await insertChatParticipants(db, FOREIGN_CHAT, STRANGER,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("a chat the viewer created is listed", async () => {
    const ids = (await listChats(db, VIEWER,)).data.map((c,) => c.id);
    expect(ids,).toContain(OWN_CHAT,);
  });

  test("a chat the viewer was added to as a participant is listed", async () => {
    const ids = (await listChats(db, VIEWER,)).data.map((c,) => c.id);
    expect(ids,).toContain(JOINED_CHAT,);
  });

  test("a chat the viewer has no relationship to is not listed", async () => {
    const ids = (await listChats(db, VIEWER,)).data.map((c,) => c.id);
    expect(ids,).not.toContain(FOREIGN_CHAT,);
    expect([...ids,].sort(),).toEqual([JOINED_CHAT, OWN_CHAT,].sort(),);
  });

  test("the stranger sees only the chats they created or joined", async () => {
    const ids = (await listChats(db, STRANGER,)).data.map((c,) => c.id);
    expect([...ids,].sort(),).toEqual([FOREIGN_CHAT, JOINED_CHAT,].sort(),);
  });

  test("the count query agrees with the list query", async () => {
    const full = await listChats(db, VIEWER,);
    expect(full.pagination.total,).toBe(full.data.length,);
    expect(full.pagination.total,).toBe(2,);

    // Paging must not change `total`: it comes from the same predicate, so a
    // page of 1 still reports both visible chats rather than the page length.
    const paged = await listChats(db, VIEWER, "?page=1&pageSize=1",);
    expect(paged.data.length,).toBe(1,);
    expect(paged.pagination.total,).toBe(full.pagination.total,);
    expect(paged.pagination.total,).toBe(2,);
  });
});
