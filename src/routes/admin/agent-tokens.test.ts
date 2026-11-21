// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/routes/admin/agent-tokens.test.ts — admin CRUD for RSI agent tokens
// exercised through the ACTUAL Elysia plugin via app.handle.
//
// Parallel-safe: per-test DB (beforeEach/afterEach), per-test random tokens.
// Authorization matrix (verified, not assumed): unauthenticated 401 ->
// non-admin 403 -> admin mint/revoke; the raw token appears EXACTLY once
// (mint response), the row stores only the hash, an out-of-vocabulary scope
// is rejected, mint stamps a 24h expiry, and a revoked/expired token fails
// verifyAgentToken afterward.

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { AGENT_TOKEN_DEFAULT_TTL_MS, verifyAgentToken, } from "../../agent/api/auth";
import { UserRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { agentTokenRoutes, } from "./agent-tokens";

const PREFIX = "/api/v1";
const ADMIN = `at-admin-${crypto.randomUUID().slice(0, 8,)}`;
const USER = `at-user-${crypto.randomUUID().slice(0, 8,)}`;

let testDb: TestDb;
let db: Kysely<DB>;

beforeEach(async () => {
  createLogger({ level: "error", },);
  testDb = await createTestDb();
  db = testDb.db;
  await insertUsers(db, ADMIN, "Admin One", { id: ADMIN, role: UserRole.Admin, },);
  await insertUsers(db, USER, "Plain User", { id: USER, role: UserRole.User, },);
},);

afterEach(async () => {
  await destroyTestDb(testDb,);
},);

/** Bare app whose derive stands in for the auth chain, mounting the REAL
 * plugin. */
function makeApp(identity: { userId: string | null; userRole: string | null },): Elysia {
  const app = new Elysia({ name: `test-agent-tokens-${crypto.randomUUID()}`, },);
  app.derive(() => ({ userId: identity.userId, userRole: identity.userRole, sessionId: null, }));
  return app.use(agentTokenRoutes({ database: db, config: {} as never, }, PREFIX,),);
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

async function mint(
  app: Elysia,
  scope: string,
  ttlMs?: number,
): Promise<{ id: string; token: string; expiresAt: string }> {
  const res = await handle(
    app,
    "POST",
    `${PREFIX}/admin/agent-tokens`,
    ttlMs === undefined ? { scope, } : { scope, ttlMs, },
  );

  expect(res.status,).toBe(200,);
  const body = await res.json() as { data: { id: string; token: string; expiresAt: string } };
  return body.data;
}

describe("agent-token admin CRUD — default-deny", () => {
  test("unauthenticated is 401 on every verb", async () => {
    const app = makeApp({ userId: null, userRole: null, },);
    expect((await handle(app, "POST", `${PREFIX}/admin/agent-tokens`, { scope: "agent:check", },)).status,)
      .toBe(401,);

    expect((await handle(app, "DELETE", `${PREFIX}/admin/agent-tokens/some-id`,)).status,).toBe(401,);
  });

  test("non-admin is 403 on every verb", async () => {
    const app = makeApp({ userId: USER, userRole: UserRole.User, },);
    expect((await handle(app, "POST", `${PREFIX}/admin/agent-tokens`, { scope: "agent:check", },)).status,)
      .toBe(403,);

    expect((await handle(app, "DELETE", `${PREFIX}/admin/agent-tokens/some-id`,)).status,).toBe(403,);
  });
});

describe("agent-token admin CRUD — admin lifecycle", () => {
  test("mint returns the raw token EXACTLY once; the row stores only the hash", async () => {
    const app = makeApp({ userId: ADMIN, userRole: UserRole.Admin, },);
    const { id, token, } = await mint(app, "agent:worktree",);

    expect(token.startsWith("llra_",),).toBe(true,);
    const row = await db.selectFrom("agent_tokens",).selectAll().where("id", "=", id,).executeTakeFirst();
    expect(row,).toBeDefined();
    expect(row!.token_hash,).toBe(new Bun.CryptoHasher("sha256",).update(token,).digest("hex",),);
    expect(row!.scope,).toBe("agent:worktree",);
    expect(row!.revoked_at,).toBeNull();

    // The raw value never persisted anywhere: the ROW carries only the hash.
    expect(JSON.stringify(row,),).not.toContain(token,);

    // The mint response body carries the plaintext exactly once.
    const res = await handle(app, "POST", `${PREFIX}/admin/agent-tokens`, { scope: "agent:check", },);
    const text = await res.text();
    const mintBody = JSON.parse(text,) as { data: { token: string } };
    const minted = mintBody.data.token;
    expect(text.indexOf(minted,),).toBe(text.lastIndexOf(minted,),);
  });

  test("an out-of-vocabulary scope is rejected", async () => {
    const app = makeApp({ userId: ADMIN, userRole: UserRole.Admin, },);
    const res = await handle(app, "POST", `${PREFIX}/admin/agent-tokens`, { scope: "agent:root", },);
    expect(res.status,).toBe(422,);
  });

  test("DELETE revokes (row value), the token then fails auth, repeat is idempotent", async () => {
    const app = makeApp({ userId: ADMIN, userRole: UserRole.Admin, },);
    const { id, token, } = await mint(app, "agent:finalize",);
    expect(await verifyAgentToken(db, token,),).not.toBeNull();

    const del = await handle(app, "DELETE", `${PREFIX}/admin/agent-tokens/${id}`,);
    expect(del.status,).toBe(200,);
    const { data: revoked, } = await del.json() as { data: { revokedAt: string } };
    expect(revoked.revokedAt,).toBeTruthy();
    expect(await verifyAgentToken(db, token,),).toBeNull();

    const again = await handle(app, "DELETE", `${PREFIX}/admin/agent-tokens/${id}`,);
    expect(again.status,).toBe(200,);
    const againBody = await again.json() as { data: { revokedAt: string } };
    expect(againBody.data.revokedAt,).toBe(revoked.revokedAt,);
  });

  test("DELETE of an unknown id is 404", async () => {
    const app = makeApp({ userId: ADMIN, userRole: UserRole.Admin, },);
    expect((await handle(app, "DELETE", `${PREFIX}/admin/agent-tokens/${crypto.randomUUID()}`,)).status,)
      .toBe(404,);
  });

  test("rotation = revoke + re-mint: the new token works, the old stays dead", async () => {
    const app = makeApp({ userId: ADMIN, userRole: UserRole.Admin, },);
    const first = await mint(app, "agent:commit",);
    await handle(app, "DELETE", `${PREFIX}/admin/agent-tokens/${first.id}`,);

    const second = await mint(app, "agent:commit",);
    expect(await verifyAgentToken(db, first.token,),).toBeNull();
    expect(await verifyAgentToken(db, second.token,),).not.toBeNull();
    expect(second.token,).not.toBe(first.token,);
  });
});

describe("agent-token admin TTL", () => {
  test("mint stamps a 24h expiry on the row and the response", async () => {
    const app = makeApp({ userId: ADMIN, userRole: UserRole.Admin, },);
    const before = Date.now();
    const { id, token, expiresAt, } = await mint(app, "agent:check",);
    const after = Date.now();
    const stampedMs = new Date(expiresAt,).getTime();
    expect(stampedMs,).toBeGreaterThanOrEqual(before + AGENT_TOKEN_DEFAULT_TTL_MS,);
    expect(stampedMs,).toBeLessThanOrEqual(after + AGENT_TOKEN_DEFAULT_TTL_MS,);

    const row = await db.selectFrom("agent_tokens",).select(["expires_at",],)
      .where("id", "=", id,).executeTakeFirst();

    expect(row!.expires_at,).toBe(expiresAt,);
    expect(await verifyAgentToken(db, token,),).not.toBeNull();
  });

  test("ttlMs override stamps a short lifetime that auth enforces", async () => {
    const app = makeApp({ userId: ADMIN, userRole: UserRole.Admin, },);
    const before = Date.now();
    const { id, token, expiresAt, } = await mint(app, "agent:check", 60_000,);
    const stampedMs = new Date(expiresAt,).getTime();
    expect(stampedMs,).toBeGreaterThanOrEqual(before + 60_000,);
    expect(stampedMs,).toBeLessThanOrEqual(Date.now() + 60_000,);
    expect(await verifyAgentToken(db, token,),).not.toBeNull();

    // Age the row past its stamped expiry — no wall-clock sleep in tests.
    await db.updateTable("agent_tokens",)
      .set({ expires_at: new Date(Date.now() - 1000,).toISOString(), },)
      .where("id", "=", id,).execute();

    expect(await verifyAgentToken(db, token,),).toBeNull();
  });

  test("zero and negative ttlMs are rejected without minting a row", async () => {
    const app = makeApp({ userId: ADMIN, userRole: UserRole.Admin, },);
    for (const ttlMs of [0, -1,]) {
      const res = await handle(app, "POST", `${PREFIX}/admin/agent-tokens`, {
        scope: "agent:check",
        ttlMs,
      },);

      expect(res.status,).toBe(422,);
    }

    const rows = await db.selectFrom("agent_tokens",).select(["id",],).execute();
    expect(rows,).toHaveLength(0,);
  });

  test("a non-finite ttlMs in raw JSON is rejected by body validation", async () => {
    const app = makeApp({ userId: ADMIN, userRole: UserRole.Admin, },);
    const res = await app.handle(
      new Request(`http://localhost${PREFIX}/admin/agent-tokens`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: '{"scope":"agent:check","ttlMs":1e309}',
      },),
    );

    expect(res.status,).toBe(422,);
    const rows = await db.selectFrom("agent_tokens",).select(["id",],).execute();
    expect(rows,).toHaveLength(0,);
  });
});
