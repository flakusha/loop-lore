// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/routes/admin/integration-tokens.test.ts — admin CRUD for integration
// tokens exercised through the ACTUAL Elysia plugin via app.handle.
//
// Authorization matrix (verified, not assumed): unauthenticated 401 ->
// non-admin 403 -> admin full CRUD; the raw token appears EXACTLY once (mint
// response), the list is secret-free, and a revoked row fails token
// verification afterward. Cross-admin by design: ANY admin-class caller may
// list/revoke (server-provided capability). Token-principal denial at the
// auth chain is pinned in require-auth-guard.test.ts +
// integration-token.test.ts (off-surface + confinement); this file pins the
// route's OWN guard.

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { UserRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { verifyIntegrationToken, } from "../../middleware/auth/integration-token";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { integrationTokenRoutes, } from "./integration-tokens";

const PREFIX = "/api/v1";
const ADMIN = "it-admin";
const ADMIN2 = "it-admin-2";
const USER = "it-plain-user";

let testDb: TestDb;
let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "error", },);
  testDb = await createTestDb();
  db = testDb.db;
  await insertUsers(db, ADMIN, "Admin One", { id: ADMIN, role: UserRole.Admin, },);
  await insertUsers(db, ADMIN2, "Admin Two", { id: ADMIN2, role: UserRole.Admin, },);
  await insertUsers(db, USER, "Plain User", { id: USER, role: UserRole.User, },);
},);

afterAll(async () => {
  await destroyTestDb(testDb,);
},);

/** Bare app whose derive stands in for the auth chain, mounting the REAL
 * plugin. principalKind defaults to "user" — the token-principal denial
 * lives one layer down and is pinned in middleware tests. */
function makeApp(identity: { userId: string | null; userRole: string | null },): Elysia {
  const app = new Elysia({ name: "test-admin-tokens", },);
  app.derive(() => ({ userId: identity.userId, userRole: identity.userRole, sessionId: null, }));
  return app.use(integrationTokenRoutes({ database: db, config: {} as never, }, PREFIX,),);
}

function handle(app: Elysia, method: string, path: string, body?: unknown,): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json", },
      body: body === undefined ? undefined : JSON.stringify(body,),
    },),
  );
}

async function mint(app: Elysia, name: string,): Promise<{ id: string; token: string }> {
  const res = await handle(app, "POST", `${PREFIX}/admin/integration-tokens`, { name, scopes: "read", },);
  expect(res.status,).toBe(200,);
  const body = await res.json() as { data: { id: string; token: string } };
  return body.data;
}

describe("integration-token admin CRUD — default-deny", () => {
  test("unauthenticated is 401 on every verb", async () => {
    const app = makeApp({ userId: null, userRole: null, },);
    expect((await handle(app, "POST", `${PREFIX}/admin/integration-tokens`, { name: "x", scopes: "read", },)).status,)
      .toBe(401,);

    expect((await handle(app, "GET", `${PREFIX}/admin/integration-tokens`,)).status,).toBe(401,);
    expect((await handle(app, "DELETE", `${PREFIX}/admin/integration-tokens/some-id`,)).status,).toBe(401,);
  });

  test("non-admin is 403 on every verb", async () => {
    const app = makeApp({ userId: USER, userRole: UserRole.User, },);
    expect((await handle(app, "POST", `${PREFIX}/admin/integration-tokens`, { name: "x", scopes: "read", },)).status,)
      .toBe(403,);

    expect((await handle(app, "GET", `${PREFIX}/admin/integration-tokens`,)).status,).toBe(403,);
    expect((await handle(app, "DELETE", `${PREFIX}/admin/integration-tokens/some-id`,)).status,).toBe(403,);
  });
});

describe("integration-token admin CRUD — admin lifecycle", () => {
  test("mint returns the raw token EXACTLY once; the row stores only the hash", async () => {
    const app = makeApp({ userId: ADMIN, userRole: UserRole.Admin, },);
    const { id, token, } = await mint(app, "agent-a",);

    expect(token.startsWith("llri_",),).toBe(true,);
    const row = await db.selectFrom("integration_tokens",).selectAll().where("id", "=", id,).executeTakeFirst();
    expect(row,).toBeDefined();
    expect(row!.token_hash,).toBe(new Bun.CryptoHasher("sha256",).update(token,).digest("hex",),);
    expect(row!.issuer_admin_user_id,).toBe(ADMIN,);

    // The raw value never persisted anywhere: the ROW carries only the hash.
    expect(JSON.stringify(row,),).not.toContain(token,);
  });

  test("an unparseable expiresAt is rejected 400 (fail-closed at mint)", async () => {
    const app = makeApp({ userId: ADMIN, userRole: UserRole.Admin, },);
    const res = await handle(app, "POST", `${PREFIX}/admin/integration-tokens`, {
      name: "bad-expiry",
      scopes: "read",
      expiresAt: "not-a-date",
    },);

    expect(res.status,).toBe(400,);
  });

  test("the list is secret-free: no token_hash, no raw token", async () => {
    const app = makeApp({ userId: ADMIN, userRole: UserRole.Admin, },);
    const { token, } = await mint(app, "agent-b",);
    const res = await handle(app, "GET", `${PREFIX}/admin/integration-tokens`,);
    expect(res.status,).toBe(200,);
    const text = await res.text();
    expect(text,).not.toContain("token_hash",);
    expect(text,).not.toContain(token,);
    const list = JSON.parse(text,) as { data: Array<Record<string, unknown>> };
    expect(list.data.length,).toBeGreaterThanOrEqual(1,);
    for (const row of list.data) {
      expect(typeof row["issuerAdminUserId"],).toBe("string",);
    }
  });

  test("cross-admin: a SECOND admin lists and revokes the first admin's token", async () => {
    const first = makeApp({ userId: ADMIN, userRole: UserRole.Admin, },);
    const { id, token, } = await mint(first, "agent-c",);

    const second = makeApp({ userId: ADMIN2, userRole: UserRole.Admin, },);
    const listRes = await handle(second, "GET", `${PREFIX}/admin/integration-tokens`,);
    expect(listRes.status,).toBe(200,);
    const list = await listRes.json() as { data: Array<{ id: string }> };
    expect(list.data.some((row,) => row.id === id),).toBe(true,);

    const delRes = await handle(second, "DELETE", `${PREFIX}/admin/integration-tokens/${id}`,);
    expect(delRes.status,).toBe(200,);
    const del = await delRes.json() as { data: { revokedAt: string } };
    expect(typeof del.data.revokedAt,).toBe("string",);

    // Revocation is the ROW VALUE and it bites: the raw token stops verifying.
    const row = await db.selectFrom("integration_tokens",).select("revoked_at",).where("id", "=", id,)
      .executeTakeFirst();

    expect(row!.revoked_at,).toBe(del.data.revokedAt,);
    expect(await verifyIntegrationToken(db, token,),).toBeNull();
  });

  test("revoke is idempotent; unknown id is 404", async () => {
    const admin = makeApp({ userId: ADMIN, userRole: UserRole.Admin, },);
    const { id, } = await mint(admin, "agent-d",);
    expect((await handle(admin, "DELETE", `${PREFIX}/admin/integration-tokens/${id}`,)).status,).toBe(200,);
    expect((await handle(admin, "DELETE", `${PREFIX}/admin/integration-tokens/${id}`,)).status,).toBe(200,);
    expect((await handle(admin, "DELETE", `${PREFIX}/admin/integration-tokens/does-not-exist`,)).status,).toBe(404,);
  });
});
