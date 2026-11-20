// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Parallel-safe: per-test in-memory DB and per-test random token digests.
// Verifies the admin triple guard, newest-first ordering, token/action
// filters and the limit cap on the real Elysia plugin.

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { hashAgentToken, } from "../../agent/api/auth";
import { UserRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { agentActionsRoutes, } from "./agent-actions";

const PREFIX = "/api/v1";
const ADMIN = `aa-admin-${crypto.randomUUID().slice(0, 8,)}`;
const USER = `aa-user-${crypto.randomUUID().slice(0, 8,)}`;
const RAW_A = `llra_${crypto.randomUUID()}`;
const RAW_B = `llra_${crypto.randomUUID()}`;
const DIGEST_A = hashAgentToken(RAW_A,).slice(0, 16,);
const DIGEST_B = hashAgentToken(RAW_B,).slice(0, 16,);

let testDb: TestDb;
let db: Kysely<DB>;

beforeEach(async () => {
  createLogger({ level: "error", },);
  testDb = await createTestDb();
  db = testDb.db;
  await insertUsers(db, ADMIN, "Admin Two", { id: ADMIN, role: UserRole.Admin, },);
  await insertUsers(db, USER, "Plain User", { id: USER, role: UserRole.User, },);
  await insertAction(DIGEST_A, "whoami", "success", "2026-01-01 00:00:00",);
  await insertAction(DIGEST_B, "worktrees", "failure", "2026-01-02 00:00:00",);
  await insertAction(DIGEST_A, "check", "success", "2026-01-03 00:00:00",);
},);

afterEach(async () => {
  await destroyTestDb(testDb,);
},);

async function insertAction(
  tokenDigest: string,
  action: string,
  result: string,
  createdAt: string,
): Promise<void> {
  await db.insertInto("agent_actions",).values({
    token_digest: tokenDigest,
    action,
    result,
    created_at: createdAt,
  },).execute();
}

function makeApp(identity: { userId: string | null; userRole: string | null },): Elysia {
  const app = new Elysia({ name: `test-agent-actions-${crypto.randomUUID()}`, },);
  app.derive(() => ({ userId: identity.userId, userRole: identity.userRole, sessionId: null, }));
  return app.use(agentActionsRoutes({ database: db, config: {} as never, }, PREFIX,),);
}

function get(app: Elysia, query = "",): Promise<Response> {
  return app.handle(new Request(`http://localhost${PREFIX}/admin/agent-actions${query}`,),);
}

async function actions(query = "",): Promise<Array<{ action: string; token_digest: string }>> {
  const response = await get(makeApp({ userId: ADMIN, userRole: UserRole.Admin, },), query,);
  expect(response.status,).toBe(200,);
  const body = await response.json() as { data: Array<{ action: string; token_digest: string }> };
  return body.data;
}

describe("admin agent-actions — default-deny", () => {
  test("unauthenticated is 401", async () => {
    const response = await get(makeApp({ userId: null, userRole: null, },),);
    expect(response.status,).toBe(401,);
  });

  test("non-admin is 403", async () => {
    const response = await get(makeApp({ userId: USER, userRole: UserRole.User, },),);
    expect(response.status,).toBe(403,);
  });
});

describe("admin agent-actions — listing", () => {
  test("newest first, digest only, no plaintext", async () => {
    const rows = await actions();
    expect(rows.map((r,) => r.action),).toEqual(["check", "worktrees", "whoami",],);
    expect(rows.map((r,) => r.token_digest),).toEqual([DIGEST_A, DIGEST_B, DIGEST_A,],);
    const response = await get(makeApp({ userId: ADMIN, userRole: UserRole.Admin, },),);
    const body = await response.text();
    expect(body,).not.toContain(RAW_A,);
    expect(body,).not.toContain(RAW_B,);
  });

  test("token filter accepts a raw bearer and a 16-char digest prefix", async () => {
    const byRaw = await actions(`?token=${RAW_A}`,);
    const byDigest = await actions(`?token=${DIGEST_A}`,);
    expect(byRaw.map((r,) => r.action),).toEqual(["check", "whoami",],);
    expect(byDigest,).toEqual(byRaw,);
    expect((await actions(`?token=${RAW_B}`,)).map((r,) => r.action),).toEqual(["worktrees",],);
  });

  test("action filter combines with the token filter", async () => {
    expect((await actions("?action=whoami",)).map((r,) => r.action),).toEqual(["whoami",],);
    expect(await actions(`?token=${DIGEST_A}&action=check`,),).toHaveLength(1,);
    expect(await actions("?action=missing",),).toHaveLength(0,);
  });

  test("limit paginates and caps at 200", async () => {
    expect(await actions("?limit=2",),).toHaveLength(2,);
    for (let i = 0; i < 205; i++) {
      await insertAction(DIGEST_B, "whoami", "success", `2026-02-${String(i % 28 + 1,).padStart(2, "0",)} 00:00:00`,);
    }

    expect(await actions("?limit=1000",),).toHaveLength(200,);
  });
});
