// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Admin resource routes: add→list→revoke round-trips carry no raw secret;
// paused endpoints fail the dry-run probe with a structured fallback.
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, destroyTestDb, } from "../../test-utils/create-test-db";
import { resourcesRoutes, } from "./resources";

let db: Kysely<DB>;
let sqlite: Database;

function makeApp(userRole: string | null,) {
  const app = new Elysia({ name: "test-admin-resources", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));

  return app.use(resourcesRoutes({ database: db, config: {} as Config, }, "/api",),);
}

async function postJson(app: Elysia, url: string, body: unknown,) {
  return app.handle(
    new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

beforeAll(async () => {
  try {
    createLogger({ level: "error", },);
  } catch { /* already initialized */ }

  const env = await createTestDb();
  db = env.db;
  sqlite = env.sqlite;
},);

describe("resourcesRoutes", () => {
  test("add→list→revoke carries no raw secret", async () => {
    const secret = "sk-live-route-inference-secret";
    const app = makeApp("admin",);
    const created = await postJson(app, "http://localhost/api/admin/resources/inference", {
      kind: "llm",
      provider: "openai",
      endpoint: "https://api.example.com/v1",
      secret,
    },);

    expect(created.status,).toBe(201,);
    const createdBody = await created.json() as { resource: { id: string } };
    const id = createdBody.resource.id;

    const row = await db
      .selectFrom("resource_records",)
      .select(["credential_ref",],)
      .where("id", "=", id,)
      .executeTakeFirstOrThrow();

    expect(row.credential_ref,).not.toContain(secret,);

    const listed = await makeApp("admin",).handle(new Request("http://localhost/api/admin/resources/inference",),);
    const listedBody = await listed.json() as { resources: Array<{ credentialRef: string }> };
    for (const r of listedBody.resources) { expect(String(r.credentialRef ?? "",),).not.toContain(secret,); }

    const revoked = await makeApp("admin",).handle(
      new Request(`http://localhost/api/admin/resources/inference/${id}`, { method: "DELETE", },),
    );

    expect(revoked.status,).toBe(200,);

    const probe = await postJson(makeApp("admin",), `http://localhost/api/admin/resources/inference/${id}/test`, {},);
    const probeBody = await probe.json() as { ok: boolean; reason?: string };
    expect(probeBody.ok,).toBe(false,);
    expect(probeBody.reason,).toBe("revoked",);
  });

  test("anonymous add is refused; tampered backup fails verify", async () => {
    const denied = await postJson(makeApp(null,), "http://localhost/api/admin/resources/inference", {
      kind: "llm",
      provider: "openai",
      endpoint: "https://api.example.com/v1",
      secret: "sk-x",
    },);

    expect([401, 403,],).toContain(denied.status,);

    const backup = await postJson(makeApp("admin",), "http://localhost/api/admin/resources/backups", {
      resourceType: "chat",
      payload: '{"save":1}',
    },);

    expect(backup.status,).toBe(201,);
    const backupBody = await backup.json() as { backup: { id: string } };

    await db
      .updateTable("backup_records",)
      .set({ payload: '{"save":2}', },)
      .where("id", "=", backupBody.backup.id,)
      .execute();

    const verify = await postJson(
      makeApp("admin",),
      `http://localhost/api/admin/resources/backups/${backupBody.backup.id}/verify`,
      {},
    );

    expect(verify.status,).toBe(409,);
  });

  test("storage lifecycle and backup verify round-trip", async () => {
    const listed0 = await makeApp("admin",).handle(new Request("http://localhost/api/admin/resources/storage",),);
    const created = await postJson(makeApp("admin",), "http://localhost/api/admin/resources/storage", {
      endpoint: "https://s3.example.com/b",
      kind: "s3",
      secret: "sk-s",
    },);

    expect(created.status,).toBe(201,);
    expect(listed0.status,).toBe(200,);
    const createdBody = await created.json() as { resource: { id: string } };
    const sid = createdBody.resource.id;
    const probeUrl = "http://localhost/api/admin/resources/storage/" + sid + "/test";
    const probe = await postJson(makeApp("admin",), probeUrl, {},);
    const probeBody = await probe.json() as { ok: boolean };
    expect(probeBody.ok,).toBe(true,);
    const backup = await postJson(makeApp("admin",), "http://localhost/api/admin/resources/backups", {
      payload: "x",
      resourceType: "chat",
    },);

    expect(backup.status,).toBe(201,);
    const backupBody = await backup.json() as { backup: { id: string } };
    const verifyUrl = "http://localhost/api/admin/resources/backups/" + backupBody.backup.id + "/verify";
    const verify = await postJson(makeApp("admin",), verifyUrl, {},);
    expect(verify.status,).toBe(200,);
    const missing = await postJson(makeApp("admin",), "http://localhost/api/admin/resources/backups/nope/verify", {},);
    expect(missing.status,).toBe(404,);
    const delUrl = "http://localhost/api/admin/resources/storage/" + sid;
    const revoked = await makeApp("admin",).handle(new Request(delUrl, { method: "DELETE", },),);
    expect(revoked.status,).toBe(200,);
    const badAdd = await postJson(makeApp("admin",), "http://localhost/api/admin/resources/inference", {
      kind: "llm",
    },);

    expect(badAdd.status,).toBe(422,);
    const quotaAdd = await postJson(makeApp("admin",), "http://localhost/api/admin/resources/inference", {
      endpoint: "https://q.example.com",
      kind: "llm",
      provider: "x",
      quota: { requestsPerMinute: 5, },
      secret: "sk-q",
    },);

    expect(quotaAdd.status,).toBe(201,);
    const noRevoke = await makeApp("admin",).handle(
      new Request("http://localhost/api/admin/resources/inference/nope", { method: "DELETE", },),
    );

    expect(noRevoke.status,).toBe(404,);
    const bigBackup = await postJson(makeApp("admin",), "http://localhost/api/admin/resources/backups", {
      payload: "y",
      resourceType: "chat",
      storageQuotaBytes: 1,
    },);

    expect(bigBackup.status,).toBe(507,);
  });
});

afterAll(async () => {
  await destroyTestDb({ db, sqlite, },);
},);
