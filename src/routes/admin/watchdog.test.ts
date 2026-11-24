// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Parallel-safe: per-test in-memory DB and random user ids. Verifies the
// admin guard, newest-first ordering, decision details, the limit cap and the
// server-side `since`/`state` filters on the real Elysia plugin.

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { UserRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { watchdogRoutes, } from "./watchdog";

const PREFIX = "/api/v1";
const ADMIN = `wd-admin-${crypto.randomUUID().slice(0, 8,)}`;
const USER = `wd-user-${crypto.randomUUID().slice(0, 8,)}`;

let testDb: TestDb;
let db: Kysely<DB>;

beforeEach(async () => {
  createLogger({ level: "error", },);
  testDb = await createTestDb();
  db = testDb.db;
  await insertUsers(db, ADMIN, "Admin Watchdog", { id: ADMIN, role: UserRole.Admin, },);
  await insertUsers(db, USER, "Plain Watchdog", { id: USER, role: UserRole.User, },);
  await insertEvent({ eventKind: "crash", decisionKind: "restart", atMs: 1_000, },);
  await insertEvent({
    eventKind: "probe",
    decisionKind: "kill",
    atMs: 2_000,
    reason: "probe-misses",
    misses: 3,
  },);

  await insertEvent({
    eventKind: "crash",
    decisionKind: "stop",
    atMs: 3_000,
    reason: "crash-threshold",
    crashes: 5,
  },);
},);

afterEach(async () => {
  await destroyTestDb(testDb,);
},);

async function insertEvent(event: {
  eventKind: string;
  decisionKind: string;
  atMs: number;
  reason?: string;
  misses?: number;
  crashes?: number;
},): Promise<void> {
  await db.insertInto("watchdog_events",).values({
    event_kind: event.eventKind,
    decision_kind: event.decisionKind,
    at_ms: event.atMs,
    reason: event.reason ?? null,
    misses: event.misses ?? null,
    crashes: event.crashes ?? null,
  },).execute();
}

function makeApp(identity: { userId: string | null; userRole: string | null },): Elysia {
  const app = new Elysia({ name: `test-watchdog-${crypto.randomUUID()}`, },);
  app.derive(() => ({ userId: identity.userId, userRole: identity.userRole, sessionId: null, }));
  return app.use(watchdogRoutes({ database: db, config: {} as never, }, PREFIX,),);
}

function get(app: Elysia, query = "",): Promise<Response> {
  return app.handle(new Request(`http://localhost${PREFIX}/admin/watchdog/events${query}`,),);
}

describe("admin watchdog events — default-deny", () => {
  test("unauthenticated is 401", async () => {
    const response = await get(makeApp({ userId: null, userRole: null, },),);
    expect(response.status,).toBe(401,);
  });

  test("non-admin is 403", async () => {
    const response = await get(makeApp({ userId: USER, userRole: UserRole.User, },),);
    expect(response.status,).toBe(403,);
  });
});

describe("admin watchdog events — listing", () => {
  test("newest first with decision details", async () => {
    const response = await get(makeApp({ userId: ADMIN, userRole: UserRole.Admin, },),);
    expect(response.status,).toBe(200,);
    const body = await response.json() as {
      state: string | null;
      events: Array<{
        event_kind: string;
        decision_kind: string;
        at_ms: number;
        reason: string | null;
        misses: number | null;
        crashes: number | null;
      }>;
    };

    expect(body.state,).toBe("stop",);
    expect(body.events.map((row,) => row.at_ms),).toEqual([3_000, 2_000, 1_000,],);
    expect(body.events[1]?.reason,).toBe("probe-misses",);
    expect(body.events[1]?.misses,).toBe(3,);
    expect(body.events[0]?.crashes,).toBe(5,);
  });

  test("limit caps the page size", async () => {
    const response = await get(
      makeApp({ userId: ADMIN, userRole: UserRole.Admin, },),
      "?limit=2",
    );

    expect(response.status,).toBe(200,);
    const body = await response.json() as { events: unknown[] };
    expect(body.events,).toHaveLength(2,);
  });

  test("since returns only newer rows but keeps the global state", async () => {
    const response = await get(
      makeApp({ userId: ADMIN, userRole: UserRole.Admin, },),
      "?since=2000",
    );

    expect(response.status,).toBe(200,);
    const body = await response.json() as {
      state: string | null;
      events: Array<{ at_ms: number }>;
    };

    expect(body.events.map((row,) => row.at_ms),).toEqual([3_000, 2_000,],);
    expect(body.state,).toBe("stop",);
  });

  test("state filters by decision kind", async () => {
    const response = await get(
      makeApp({ userId: ADMIN, userRole: UserRole.Admin, },),
      "?state=kill",
    );

    expect(response.status,).toBe(200,);
    const body = await response.json() as {
      events: Array<{ decision_kind: string }>;
    };

    expect(body.events.map((row,) => row.decision_kind),).toEqual(["kill",],);
  });

  test("out-of-enum state is 400", async () => {
    const response = await get(
      makeApp({ userId: ADMIN, userRole: UserRole.Admin, },),
      "?state=bogus",
    );

    expect(response.status,).toBe(400,);
  });

  test("non-numeric since is 400", async () => {
    const response = await get(
      makeApp({ userId: ADMIN, userRole: UserRole.Admin, },),
      "?since=not-a-time",
    );

    expect(response.status,).toBe(400,);
  });
});
