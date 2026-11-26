// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Key management route tests without an SMK (encryption-not-configured paths).
 * SMK state is module-global: reset it to null up front so these tests hold
 * in isolated and shared runs alike. The handler catch blocks are
 * unreachable via HTTP (Elysia schema validation rejects malformed bodies
 * with 422 before the handler runs).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { initSmk, } from "../crypto/smk";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { keyManagementRoutes, } from "./key-management";

let db: Kysely<DB>;
let sqlite: Database;

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
  await initSmk({ required: false, compressThreshold: 128, compressAlgorithm: "gzip", },);
},);

afterAll(() => sqlite.close());

function authedApp(): Elysia {
  return new Elysia({ name: "test-keys", },)
    .derive({ as: "scoped", }, () => ({ userId: "user1", userRole: "user", }),)
    .use(keyManagementRoutes({ database: db, },),) as unknown as Elysia;
}

function anonApp(): Elysia {
  return new Elysia({ name: "test-keys-anon", },)
    .use(keyManagementRoutes({ database: db, },),) as unknown as Elysia;
}

/**
 * @param app
 * @param path
 * @param init
 */
function call(app: Elysia, path: string, init?: RequestInit,): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, init,),);
}

/**
 * @param app
 * @param path
 * @param body
 */
function post(app: Elysia, path: string, body: unknown,): Promise<Response> {
  return call(app, path, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

describe("keyManagementRoutes", () => {
  test("exports a function that returns an Elysia instance", () => {
    const mockDb = {} as never;
    const result = keyManagementRoutes({ database: mockDb, },);
    expect(result,).toBeInstanceOf(Elysia,);
  });

  test("list requires auth", async () => {
    const res = await call(anonApp(), "/api/keys",);
    expect(res.status,).toBe(401,);
  });

  test("list starts empty", async () => {
    const res = await call(authedApp(), "/api/keys",);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { keys: unknown[] };
    expect(body.keys,).toEqual([],);
  });

  test("generate requires auth", async () => {
    const res = await post(anonApp(), "/api/keys", { name: "x", },);
    expect(res.status,).toBe(401,);
  });

  test("generate rejects a blank name", async () => {
    const res = await post(authedApp(), "/api/keys", { name: "  ", },);
    expect(res.status,).toBe(400,);
  });

  test("generate without SMK is 500", async () => {
    const res = await post(authedApp(), "/api/keys", { name: "primary", },);
    expect(res.status,).toBe(500,);
  });

  test("rotate requires auth", async () => {
    const res = await post(anonApp(), "/api/keys/rotate", {},);
    expect(res.status,).toBe(401,);
  });

  test("rotate without SMK is 500", async () => {
    const res = await post(authedApp(), "/api/keys/rotate", {},);
    expect(res.status,).toBe(500,);
  });

  test("revoke requires auth", async () => {
    const res = await call(anonApp(), `/api/keys/${uid()}`, { method: "DELETE", },);
    expect(res.status,).toBe(401,);
  });

  test("revoke of an unknown key is 404", async () => {
    const res = await call(authedApp(), `/api/keys/${uid()}`, { method: "DELETE", },);
    expect(res.status,).toBe(404,);
  });
});
