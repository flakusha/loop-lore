// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Parallel-safe: per-test in-memory DB, unique app names, explicit override
// teardown. Exercises the real admin plugin against a live quick_check.

import type { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { UserRole, } from "../../db/enums";
import { setTestDatabase, } from "../../db/index";
import {
  enterSafeMode,
  getIntegrityState,
  recordVerdict,
  resetIntegrityState,
  setUncleanShutdown,
} from "../../integrity/state";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { integrityRoutes, } from "./integrity";

const PREFIX = "/api/v1";
const ADMIN = `integrity-admin-${crypto.randomUUID().slice(0, 8,)}`;
const USER = `integrity-user-${crypto.randomUUID().slice(0, 8,)}`;

let fixture: TestDb;

beforeEach(async () => {
  fixture = await createTestDb();
  setTestDatabase(fixture.db, fixture.sqlite,);
  resetIntegrityState();
},);

afterEach(async () => {
  setTestDatabase(null,);
  await destroyTestDb(fixture,);
  resetIntegrityState();
},);

function makeApp(identity: { userId: string | null; userRole: string | null },): Elysia {
  const app = new Elysia({ name: `test-integrity-${crypto.randomUUID()}`, },);
  app.derive(() => ({ ...identity, sessionId: null, }));
  return app.use(integrityRoutes({ database: fixture.db, config: {} as never, }, PREFIX,),);
}

function status(app: Elysia,): Promise<Response> {
  return app.handle(new Request(`http://localhost${PREFIX}/admin/integrity/status`,),);
}

function recover(app: Elysia,): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${PREFIX}/admin/integrity/recover`, {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify({ acknowledged: true, },),
    },),
  );
}

describe("admin integrity — default deny", () => {
  test("unauthenticated is 401", async () => {
    expect((await status(makeApp({ userId: null, userRole: null, },),)).status,).toBe(401,);
  });

  test("non-admin is 403", async () => {
    expect((await status(makeApp({ userId: USER, userRole: UserRole.User, },),)).status,).toBe(403,);
  });
});

describe("admin integrity — status and recovery", () => {
  test("status publishes the live integrity state with an ISO timestamp", async () => {
    recordVerdict({ verdict: "warn", detail: "page 3", checkedAtMs: 1_700_000_000_000, },);
    enterSafeMode("test",);
    setUncleanShutdown(true,);

    const response = await status(makeApp({ userId: ADMIN, userRole: UserRole.Admin, },),);
    expect(response.status,).toBe(200,);
    expect(await response.json(),).toMatchObject({
      verdict: "warn",
      detail: "page 3",
      checkedAt: new Date(1_700_000_000_000,).toISOString(),
      uncleanShutdown: true,
      safeMode: true,
      safeModeReason: "test",
    },);
  });

  test("recovery re-checks the live DB and clears safe mode on pass", async () => {
    enterSafeMode("integrity check failed",);
    const app = makeApp({ userId: ADMIN, userRole: UserRole.Admin, },);

    const response = await recover(app,);
    expect(response.status,).toBe(200,);
    expect(await response.json(),).toMatchObject({ verdict: "pass", safeMode: false, },);
    expect(getIntegrityState().verdict,).toBe("pass",);
    expect(getIntegrityState().safeMode,).toBe(false,);
  });

  test("a failing quick_check keeps safe mode and returns 409", async () => {
    const failing = {
      query: () => ({ all: () => [{ quick_check: "page 3 corrupt", },], }),
    } as unknown as Database;

    setTestDatabase(fixture.db, failing,);
    enterSafeMode("integrity check failed",);

    const response = await recover(makeApp({ userId: ADMIN, userRole: UserRole.Admin, },),);
    expect(response.status,).toBe(409,);
    const body = await response.json() as { error: string };
    expect(body.error,).toContain("still failing",);
    expect(getIntegrityState().verdict,).toBe("fail",);
    expect(getIntegrityState().safeMode,).toBe(true,);
  });
});
