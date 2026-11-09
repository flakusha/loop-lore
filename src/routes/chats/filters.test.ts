// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the per-user chat-list filter persistence + enforcement
 * (TASK-server-side-room-filter-enforcement).
 *
 * - GET/PUT /api/v1/chats/filters (src/routes/chats/filters.ts): defaults,
 *   upsert replace, auth gate, closed-DTO rejections.
 * - Enforcement: after a PUT, GET /api/v1/chats applies the stored snapshot
 *   for every dimension the request omits; an explicit query param always
 *   wins (src/routes/chats/list.ts via resolveChatListFilters).
 *
 * Driven through the real v1 barrel (/api/v1/chats, what the frontend hits)
 * with the same resource contract as list.test.ts: one private in-memory
 * SQLite DB per describe block, no ports, no cross-test ordering.
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
  insertChats,
  insertMessages,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { ChatListFiltersBody, } from "../../validation/schemas";
import { v1Routes, } from "../v1";
import {
  chatFilterRoutes,
  type ChatListFilterSnapshot,
  loadChatListFilters,
  resolveChatListFilters,
} from "./filters";

interface Paginated {
  data: { id: string; name?: string }[];
  pagination: { total: number; page: number; pageSize: number; totalPages: number };
}

interface FiltersBody {
  data: {
    type: string;
    status: string;
    sort: string;
    world: string | null;
    minMessages: number | null;
    maxMessages: number | null;
    updatedSince: string | null;
  };
}

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
 * @param userId session identity (null = no derive — exercises the 401 gate)
 */
function createV1App(db: Kysely<DB>, userId: string | null,): Elysia {
  const app = new Elysia({ name: `test-chats-filters-${userId ?? "anon"}`, },);
  if (userId !== null) {
    const t = (k: string,) => k;
    app.derive(() => ({ userId, userRole: "user", sessionId: null, locale: "en", t, }));
  }

  return app.use(
    v1Routes({ database: db, config: {} as never, asyncStore: stubAsyncStore(), },),
  ) as unknown as Elysia;
}

async function getFilters(db: Kysely<DB>, userId: string | null,): Promise<Response> {
  return createV1App(db, userId,).handle(
    new Request("http://localhost/api/v1/chats/filters",),
  );
}

async function putFilters(db: Kysely<DB>, userId: string, body: unknown,): Promise<Response> {
  return createV1App(db, userId,).handle(
    new Request("http://localhost/api/v1/chats/filters", {
      method: "PUT",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

async function listChats(db: Kysely<DB>, userId: string, query = "",): Promise<Paginated> {
  const res = await createV1App(db, userId,).handle(
    new Request(`http://localhost/api/v1/chats${query}`,),
  );

  if (res.status !== 200) {
    throw new Error(`GET /api/v1/chats${query} answered ${res.status}`,);
  }

  return await res.json() as Paginated;
}

const FULL_SNAPSHOT: FiltersBody["data"] = {
  type: "group",
  status: "active",
  sort: "name",
  world: null,
  minMessages: null,
  maxMessages: null,
  updatedSince: null,
};

/** The all-clear snapshot the GET route serves users with no saved row. */
const ALL_CLEAR_FILTERS: ChatListFilterSnapshot = {
  type: "all",
  status: "all",
  sort: "recent",
  world: null,
  minMessages: null,
  maxMessages: null,
  updatedSince: null,
};

describe("GET/PUT /api/v1/chats/filters — persistence", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, "cfs-user", "cfs-user", { id: "cfs-user" as never, },);
    await insertActors(db, "cfs-user", {
      id: "cfs-user" as never,
      user_id: "cfs-user" as never,
      owner_id: "cfs-user" as never,
    },);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("unauthenticated GET is a 401", async () => {
    const res = await getFilters(db, null,);
    expect(res.status,).toBe(401,);
  });

  test("the standalone plugin mount serves the same GET defaults", async () => {
    // Direct chatFilterRoutes mount (no v1 barrel): pins the module's own
    // route surface, not just its wiring through the chats plugin chain.
    const app = new Elysia()
      .derive(() => ({ userId: "cfs-user", userRole: "user", sessionId: null, locale: "en", t: (k: string,) => k, }))
      .use(chatFilterRoutes({ database: db, config: {} as never, }, "/api",),);

    const res = await app.handle(new Request("http://localhost/api/chats/filters",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as FiltersBody;
    expect(body.data,).toEqual(ALL_CLEAR_FILTERS,);
  });

  test("a user with no saved row gets the all-clear defaults", async () => {
    const res = await getFilters(db, "cfs-user",);
    expect(res.status,).toBe(200,);
    const body = await res.json() as FiltersBody;
    expect(body.data,).toEqual(ALL_CLEAR_FILTERS,);
  });

  test("PUT stores the snapshot and GET returns it", async () => {
    const put = await putFilters(db, "cfs-user", FULL_SNAPSHOT,);
    expect(put.status,).toBe(200,);

    const res = await getFilters(db, "cfs-user",);
    const body = await res.json() as FiltersBody;
    expect(body.data,).toEqual(FULL_SNAPSHOT,);
  });

  test("PUT replaces the snapshot in place (one row per user)", async () => {
    const put = await putFilters(db, "cfs-user", {
      ...FULL_SNAPSHOT,
      type: "direct",
      status: "archived",
      world: null,
    },);

    expect(put.status,).toBe(200,);

    const rows = await db.selectFrom("chat_list_filters",).selectAll().execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.chat_type,).toBe("direct",);
    expect(rows[0]?.archived,).toBe("archived",);

    const body = await (await getFilters(db, "cfs-user",)).json() as FiltersBody;
    expect(body.data.type,).toBe("direct",);
    expect(body.data.status,).toBe("archived",);
  });

  test("PUT stores a world uuid and numeric bounds, and clears via empty string", async () => {
    const world = await insertWorlds(db, "cfs-user", "CFS World",);
    const put = await putFilters(db, "cfs-user", {
      type: "all",
      status: "all",
      sort: "recent",
      world,
      minMessages: 5,
      maxMessages: 100,
      updatedSince: "2026-01-01T00:00:00.000Z",
    },);

    expect(put.status,).toBe(200,);

    const body = await (await getFilters(db, "cfs-user",)).json() as FiltersBody;
    expect(body.data.world,).toBe(world,);
    expect(body.data.minMessages,).toBe(5,);
    expect(body.data.maxMessages,).toBe(100,);
    expect(body.data.updatedSince,).toBe("2026-01-01T00:00:00.000Z",);

    const clear = await putFilters(db, "cfs-user", {
      type: "all",
      status: "all",
      sort: "recent",
      world: "",
      minMessages: null,
      maxMessages: null,
      updatedSince: null,
    },);

    expect(clear.status,).toBe(200,);
    const cleared = await (await getFilters(db, "cfs-user",)).json() as FiltersBody;
    expect(cleared.data,).toEqual(ALL_CLEAR_FILTERS,);
  });

  test("the DTO is closed: an unknown key is a 422, not a silent strip", async () => {
    expect((ChatListFiltersBody as { additionalProperties?: boolean }).additionalProperties,).toBe(false,);
    const res = await putFilters(db, "cfs-user", {
      ...FULL_SNAPSHOT,
      isAdmin: true,
    },);

    expect(res.status,).toBe(422,);
  });

  test("invalid enum values and negative bounds are 422", async () => {
    const badType = await putFilters(db, "cfs-user", { ...FULL_SNAPSHOT, type: "secret", },);
    const badSort = await putFilters(db, "cfs-user", { ...FULL_SNAPSHOT, sort: "newest", },);
    const badMin = await putFilters(db, "cfs-user", { ...FULL_SNAPSHOT, minMessages: -1, },);
    const badWorld = await putFilters(db, "cfs-user", { ...FULL_SNAPSHOT, world: "not-a-uuid", },);
    for (const res of [badType, badSort, badMin, badWorld,]) {
      expect(res.status,).toBe(422,);
    }
  });
});

// ── Enforcement (stored snapshot fills omitted list dimensions) ──

const E_USER = "cfs-enforce-user";

const E_DIRECT = "cfs-e-direct";
const E_GROUP_W1 = "cfs-e-group-w1";
const E_GROUP_W2 = "cfs-e-group-w2";
const E_ARCHIVED = "cfs-e-archived";
const E_NOISY = "cfs-e-noisy";
const E_QUIET = "cfs-e-quiet";

const OLD_ISO = "2026-01-01T00:00:00.000Z";
const RECENT_ISO = "2026-06-01T00:00:00.000Z";

const ALL_CLEAR_SNAPSHOT: FiltersBody["data"] = {
  type: "all",
  status: "all",
  sort: "recent",
  world: null,
  minMessages: null,
  maxMessages: null,
  updatedSince: null,
};

async function snapshotAll(
  world: string | null,
  overrides: Partial<FiltersBody["data"]> = {},
): Promise<FiltersBody["data"]> {
  return { ...FULL_SNAPSHOT, world, ...overrides, };
}

/** PUT a snapshot, asserting the server accepted it (upsert must not fail silently). */
async function putSnapshot(db: Kysely<DB>, body: FiltersBody["data"],): Promise<void> {
  const put = await putFilters(db, E_USER, body,);
  expect(put.status,).toBe(200,);
}

describe("GET /api/v1/chats — stored-filter enforcement", () => {
  let db: Kysely<DB>;
  let world1: string;
  let world2: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await insertUsers(db, E_USER, E_USER, { id: E_USER as never, },);
    await insertActors(db, E_USER, { id: E_USER as never, user_id: E_USER as never, owner_id: E_USER as never, },);

    world1 = await insertWorlds(db, E_USER, "Enforce World One",);
    world2 = await insertWorlds(db, E_USER, "Enforce World Two",);

    await insertChats(db, "E Direct", E_USER, { id: E_DIRECT as never, type: ChatType.Direct, },);
    await insertChats(db, "E Group W1", E_USER, { id: E_GROUP_W1 as never, type: ChatType.Group, world_id: world1, },);
    await insertChats(db, "E Group W2", E_USER, { id: E_GROUP_W2 as never, type: ChatType.Group, world_id: world2, },);
    await insertChats(db, "E Archived", E_USER, {
      id: E_ARCHIVED as never,
      type: ChatType.Direct,
      is_pinned: "archived",
    },);

    await insertChats(db, "E Noisy", E_USER, { id: E_NOISY as never, },);
    await insertChats(db, "E Quiet", E_USER, { id: E_QUIET as never, },);

    for (let i = 0; i < 15; i++) {
      await insertMessages(db, E_NOISY, E_USER, MessageRole.User, `noisy ${i}`,);
    }

    for (let i = 0; i < 2; i++) {
      await insertMessages(db, E_QUIET, E_USER, MessageRole.User, `quiet ${i}`,);
    }

    await db.updateTable("chats",).set({ updated_at: OLD_ISO, },).where("id", "=", E_QUIET,).execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("a user with no stored snapshot keeps the unfiltered list", async () => {
    const res = await listChats(db, E_USER,);
    expect(res.pagination.total,).toBe(6,);
  });

  test("a stored type filter applies when the request omits it", async () => {
    await putSnapshot(db, await snapshotAll(null, { type: "group", status: "all", },),);
    const res = await listChats(db, E_USER,);
    expect([...res.data,].map((c,) => c.id).sort(),).toEqual([E_GROUP_W1, E_GROUP_W2,].sort(),);
    expect(res.pagination.total,).toBe(2,);
  });

  test("an explicit query param beats the stored snapshot", async () => {
    const res = await listChats(db, E_USER, `?type=${ChatType.Direct}`,);
    expect([...res.data,].map((c,) => c.id).sort(),).toEqual(
      [E_DIRECT, E_ARCHIVED, E_NOISY, E_QUIET,].sort(),
    );
  });

  test("a stored archived=archived filter narrows to archived chats", async () => {
    await putSnapshot(db, await snapshotAll(null, { status: "archived", type: "all", },),);
    const res = await listChats(db, E_USER,);
    expect(res.data.map((c,) => c.id),).toEqual([E_ARCHIVED,],);
  });

  test("an explicit archived=false beats the stored archived=archived", async () => {
    const res = await listChats(db, E_USER, "?archived=false",);
    expect(res.data.map((c,) => c.id),).not.toContain(E_ARCHIVED,);
  });

  test("a stored world filter narrows to that world's chats", async () => {
    await putSnapshot(db, await snapshotAll(world1, { type: "all", status: "all", },),);
    expect((await loadChatListFilters(db, E_USER,))?.world,).toBe(world1,);
    const res = await listChats(db, E_USER,);
    expect(res.data.map((c,) => c.id),).toEqual([E_GROUP_W1,],);
  });

  test("stored message bounds apply without explicit params", async () => {
    await putSnapshot(
      db,
      await snapshotAll(null, {
        type: "all",
        status: "all",
        minMessages: 10,
      },),
    );

    const res = await listChats(db, E_USER,);
    expect(res.data.map((c,) => c.id),).toEqual([E_NOISY,],);
  });

  test("a stored updatedSince cutoff applies without explicit params", async () => {
    await putSnapshot(
      db,
      await snapshotAll(null, {
        type: "all",
        status: "all",
        updatedSince: RECENT_ISO,
      },),
    );

    const res = await listChats(db, E_USER,);
    expect(res.data.map((c,) => c.id),).not.toContain(E_QUIET,);
    expect(res.data.map((c,) => c.id),).toContain(E_DIRECT,);
  });

  test("a stored sort applies when the request omits it", async () => {
    await putSnapshot(
      db,
      await snapshotAll(null, {
        type: "all",
        status: "all",
        sort: "name",
      },),
    );

    const res = await listChats(db, E_USER,);
    expect(res.data.map((c,) => c.name),).toEqual([...res.data,].map((c,) => c.name).sort(),);
  });

  test("clearing the snapshot (all-clear PUT) restores the unfiltered list", async () => {
    await putSnapshot(db, { ...ALL_CLEAR_SNAPSHOT, },);
    const res = await listChats(db, E_USER,);
    expect(res.pagination.total,).toBe(6,);
  });
});

describe("resolveChatListFilters — merge rules", () => {
  test("every omitted dimension falls back to the stored snapshot", () => {
    const resolved = resolveChatListFilters({}, {
      type: "direct",
      status: "active",
      sort: "unread",
      world: "w-1",
      minMessages: 3,
      maxMessages: 9,
      updatedSince: "2026-02-02T00:00:00.000Z",
    },);

    expect(resolved,).toEqual({
      type: "direct",
      archived: "false",
      sort: "unread",
      world: "w-1",
      minMessages: 3,
      maxMessages: 9,
      updatedSince: "2026-02-02T00:00:00.000Z",
    },);
  });

  test("all-clear stored values mean no filter", () => {
    const resolved = resolveChatListFilters({}, ALL_CLEAR_FILTERS,);
    expect(resolved,).toEqual({
      type: undefined,
      archived: undefined,
      sort: "recent",
      world: undefined,
      minMessages: undefined,
      maxMessages: undefined,
      updatedSince: undefined,
    },);
  });

  test("explicit values win per dimension and null snapshots change nothing", () => {
    const resolved = resolveChatListFilters({ type: "group", sort: "name", }, null,);
    expect(resolved.type,).toBe("group",);
    expect(resolved.sort,).toBe("name",);
    expect(resolved.archived,).toBeUndefined();
    expect(resolved.world,).toBeUndefined();
  });

  test("loadChatListFilters returns null for a user with no row", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    expect(await loadChatListFilters(db, "nobody",),).toBeNull();
    await db.destroy();
  });
});
