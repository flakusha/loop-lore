// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Key management happy paths with an SMK initialized: generate, list,
 * rotate, revoke, and revoke-again (400). SMK state is module-global:
 * initialize it up front so these tests hold in isolated and shared runs.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { initSmk, } from "../crypto/smk";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, } from "../test-utils/insert-helpers";
import { keyManagementRoutes, } from "./key-management";

let db: Kysely<DB>;
let sqlite: Database;

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
  await insertActors(db, "Key User", { id: "user1", } as never,);
  await initSmk({
    serverEncryptionKey: "b".repeat(64,),
    required: false,
    compressThreshold: 128,
    compressAlgorithm: "gzip",
  },);
},);

afterAll(() => sqlite.close());

function authedApp(): Elysia {
  return new Elysia({ name: "test-keys-smk", },)
    .derive({ as: "scoped", }, () => ({ userId: "user1", userRole: "user", }),)
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

describe("key management with SMK", () => {
  test("generate + list + rotate + revoke round-trip", async () => {
    const app = authedApp();
    const generated = await post(app, "/api/keys", { name: "test-key", },);
    expect(generated.status,).toBe(200,);
    const { id: keyId, } = await generated.json() as { id: string };
    expect(typeof keyId,).toBe("string",);

    const listed = await call(app, "/api/keys",);
    expect(listed.status,).toBe(200,);
    const { keys, } = await listed.json() as { keys: { id: string; name: string; status: string }[] };
    expect(keys.map((k,) => k.id),).toContain(keyId,);

    const rotated = await post(app, "/api/keys/rotate", {},);
    expect(rotated.status,).toBe(200,);
    const { id: newKeyId, } = await rotated.json() as { id: string };
    expect(typeof newKeyId,).toBe("string",);

    const revoked = await call(app, `/api/keys/${newKeyId}`, { method: "DELETE", },);
    expect(revoked.status,).toBe(200,);

    const again = await call(app, `/api/keys/${newKeyId}`, { method: "DELETE", },);
    expect(again.status,).toBe(400,);
  });
});
