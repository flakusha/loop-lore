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
 *
 * A second describe block covers the TASK-chat-room-filters server-side
 * filter params (type / archived / world / min-maxMessages / updatedSince /
 * sort / AND composition) on the same route, in its own DB.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { AsyncStore, } from "../../async/store";
import { ChatType, MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { v1Routes, } from "../v1";

interface Paginated {
  data: { id: string; name?: string }[];
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

// ── Filter dimensions (TASK-chat-room-filters) ────────────
//
// GET /api/v1/chats accepts optional AND-composed filter params. These tests
// pin each dimension plus one composition case, so the client-side filter bar
// (chat-filters.ts -> _filterParams()) can rely on the server contract.

const F_USER = "filter-user";

const F_DIRECT = "chat-filter-direct";
const F_GROUP_W1 = "chat-filter-group-w1";
const F_GROUP_W2 = "chat-filter-group-w2";
const F_ARCHIVED = "chat-filter-archived";
const F_NOISY = "chat-filter-noisy";
const F_QUIET = "chat-filter-quiet";
const F_STALE = "chat-filter-stale";

const OLD_ISO = "2026-01-01T00:00:00.000Z";
const RECENT_ISO = "2026-06-01T00:00:00.000Z";

describe("GET /api/v1/chats — filter dimensions", () => {
  let db: Kysely<DB>;
  let world1: string;
  let world2: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await insertUsers(db, F_USER, F_USER, { id: F_USER as never, },);
    await insertActors(db, F_USER, { id: F_USER as never, user_id: F_USER as never, owner_id: F_USER as never, },);

    world1 = await insertWorlds(db, F_USER, "Filter World One",);
    world2 = await insertWorlds(db, F_USER, "Filter World Two",);

    await insertChats(db, "Direct", F_USER, { id: F_DIRECT as never, type: ChatType.Direct, },);
    await insertChats(db, "Group W1", F_USER, { id: F_GROUP_W1 as never, type: ChatType.Group, world_id: world1, },);
    await insertChats(db, "Group W2", F_USER, { id: F_GROUP_W2 as never, type: ChatType.Group, world_id: world2, },);
    await insertChats(db, "Archived", F_USER, {
      id: F_ARCHIVED as never,
      type: ChatType.Direct,
      is_pinned: "archived",
    },);

    await insertChats(db, "Noisy", F_USER, { id: F_NOISY as never, },);
    await insertChats(db, "Quiet", F_USER, { id: F_QUIET as never, },);
    await insertChats(db, "Stale", F_USER, { id: F_STALE as never, updated_at: OLD_ISO, },);

    for (let i = 0; i < 15; i++) {
      await insertMessages(db, F_NOISY, F_USER, MessageRole.User, `noisy ${i}`,);
    }

    for (let i = 0; i < 2; i++) {
      await insertMessages(db, F_QUIET, F_USER, MessageRole.User, `quiet ${i}`,);
    }
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("type=group narrows to group chats", async () => {
    const res = await listChats(db, F_USER, `?type=${ChatType.Group}`,);
    expect([...res.data,].map((c,) => c.id).sort(),).toEqual([F_GROUP_W1, F_GROUP_W2,].sort(),);
    expect(res.pagination.total,).toBe(2,);
  });

  test("archived=true returns only archived chats", async () => {
    const res = await listChats(db, F_USER, "?archived=true",);
    expect(res.data.map((c,) => c.id),).toEqual([F_ARCHIVED,],);
  });

  test("archived=false excludes archived chats", async () => {
    const res = await listChats(db, F_USER, "?archived=false",);
    const ids = res.data.map((c,) => c.id);
    expect(ids,).not.toContain(F_ARCHIVED,);
    expect(ids,).toContain(F_DIRECT,);
  });

  test("world narrows to chats linked to that world", async () => {
    const res = await listChats(db, F_USER, `?world=${world1}`,);
    expect(res.data.map((c,) => c.id),).toEqual([F_GROUP_W1,],);
  });

  test("minMessages excludes chats below the visible-message floor", async () => {
    const res = await listChats(db, F_USER, "?minMessages=10",);
    expect(res.data.map((c,) => c.id),).toEqual([F_NOISY,],);
  });

  test("maxMessages caps the visible-message count", async () => {
    const res = await listChats(db, F_USER, "?maxMessages=5",);
    const ids = res.data.map((c,) => c.id);
    expect(ids,).toContain(F_QUIET,);
    expect(ids,).not.toContain(F_NOISY,);
  });

  test("updatedSince excludes chats untouched before the cutoff", async () => {
    const res = await listChats(db, F_USER, `?updatedSince=${encodeURIComponent(RECENT_ISO,)}`,);
    const ids = res.data.map((c,) => c.id);
    expect(ids,).not.toContain(F_STALE,);
    expect(ids,).toContain(F_DIRECT,);
  });

  test("filters compose with AND logic", async () => {
    const res = await listChats(db, F_USER, `?type=${ChatType.Group}&world=${world2}`,);
    expect(res.data.map((c,) => c.id),).toEqual([F_GROUP_W2,],);
  });

  test("sort=name orders alphabetically", async () => {
    const res = await listChats(db, F_USER, `?type=${ChatType.Group}&sort=name`,);
    expect(res.data.map((c,) => c.name),).toEqual(["Group W1", "Group W2",],);
  });

  test("filter pagination reports the filtered total, not the page size", async () => {
    const paged = await listChats(db, F_USER, `?type=${ChatType.Group}&pageSize=1`,);
    expect(paged.data.length,).toBe(1,);
    expect(paged.pagination.total,).toBe(2,);
  });
});
