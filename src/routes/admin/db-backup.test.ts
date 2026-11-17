// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the admin database backup/restore routes.
 *
 * Mounts the REAL plugin via app.handle (no network). Auth is derived
 * caller identity; the sqlite singleton is overridden with a test DB and
 * both the backup dir and the live path point at tmp dirs via env.
 */
import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { mkdtempSync, rmSync, } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveInstanceSlug, } from "../../config/state-dir";
import { UserRole, } from "../../db/enums";
import { setTestDatabase, } from "../../db/index";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { dbBackupRoutes, } from "./db-backup";

const PREFIX = "/api";

let testDb: TestDb;
let db: Kysely<DB>;
let backupRoot: string;
let livePath: string;
let savedBackupEnv: string | undefined;
let savedDbEnv: string | undefined;

beforeAll(async () => {
  createLogger({ level: "error", },);
  testDb = await createTestDb();
  db = testDb.db;
  backupRoot = mkdtempSync(path.join(os.tmpdir(), "db-backup-route-",),);
  livePath = path.join(mkdtempSync(path.join(os.tmpdir(), "db-live-route-",),), "live.db",);
  // A live sqlite file must exist for VACUUM INTO snapshots to read it.
  const live = new Database(livePath,);
  live.exec("CREATE TABLE t (id INTEGER PRIMARY KEY);",);
  live.close();
  savedBackupEnv = process.env["LOOP_LORE_BACKUP_DIR"];
  savedDbEnv = process.env["LOOP_LORE_DB_PATH"];
  process.env["LOOP_LORE_BACKUP_DIR"] = backupRoot;
  process.env["LOOP_LORE_DB_PATH"] = livePath;
  setTestDatabase(db, testDb.sqlite as unknown as Database,);
},);

afterAll(async () => {
  setTestDatabase(null,);
  if (savedBackupEnv === undefined) { delete process.env["LOOP_LORE_BACKUP_DIR"]; }
  else { process.env["LOOP_LORE_BACKUP_DIR"] = savedBackupEnv; }

  if (savedDbEnv === undefined) { delete process.env["LOOP_LORE_DB_PATH"]; }
  else { process.env["LOOP_LORE_DB_PATH"] = savedDbEnv; }

  rmSync(backupRoot, { recursive: true, force: true, },);
  rmSync(path.dirname(livePath,), { recursive: true, force: true, },);
  await destroyTestDb(testDb,);
},);

function makeApp(userRole: string | null,): Elysia {
  const app = new Elysia({ name: "test-db-backup", },);
  app.derive(() => ({ userId: userRole ? `test-${userRole}` : null, userRole, sessionId: null, }));
  return app.use(dbBackupRoutes({ database: db, config: {} as never, }, PREFIX,),);
}

function handle(app: Elysia, method: string, urlPath: string, body?: unknown,): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${urlPath}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json", },
      body: body === undefined ? undefined : JSON.stringify(body,),
    },),
  );
}

describe("admin db backup routes", () => {
  test("unauthenticated is 401 on every verb", async () => {
    const app = makeApp(null,);
    expect((await handle(app, "GET", `${PREFIX}/admin/db/backup`,)).status,).toBe(401,);
    expect((await handle(app, "POST", `${PREFIX}/admin/db/backup`,)).status,).toBe(401,);
    expect(
      (await handle(app, "POST", `${PREFIX}/admin/db/restore`, { name: "x.db", confirmation: "RESTORE", },)).status,
    )
      .toBe(401,);
  });

  test("non-admin is 403 on every verb", async () => {
    const app = makeApp(UserRole.User,);
    expect((await handle(app, "GET", `${PREFIX}/admin/db/backup`,)).status,).toBe(403,);
    expect((await handle(app, "POST", `${PREFIX}/admin/db/backup`,)).status,).toBe(403,);
    expect(
      (await handle(app, "POST", `${PREFIX}/admin/db/restore`, { name: "x.db", confirmation: "RESTORE", },)).status,
    )
      .toBe(403,);
  });

  test("GET lists backups in the env backup dir", async () => {
    const app = makeApp(UserRole.Admin,);
    const res = await handle(app, "GET", `${PREFIX}/admin/db/backup`,);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { backups: unknown[]; dir: string };
    expect(body.dir,).toBe(path.join(backupRoot, resolveInstanceSlug(process.env,), "db",),);
    expect(body.backups,).toEqual([],);
  });

  test("POST backup writes a snapshot then lists it", async () => {
    const app = makeApp(UserRole.Admin,);
    const created = await handle(app, "POST", `${PREFIX}/admin/db/backup`,);
    expect(created.status,).toBe(201,);
    const createdBody = await created.json() as { backup: { name: string; sizeBytes: number } };
    expect(createdBody.backup.name,).toMatch(/\.db$/,);
    expect(createdBody.backup.sizeBytes,).toBeGreaterThan(0,);

    const listed = await handle(app, "GET", `${PREFIX}/admin/db/backup`,);
    const listedBody = await listed.json() as { backups: Array<{ name: string }> };
    expect(listedBody.backups.map((b,) => b.name),).toContain(createdBody.backup.name,);
  });

  test("POST restore rejects a wrong confirmation string without touching data", async () => {
    const app = makeApp(UserRole.Admin,);
    const res = await handle(app, "POST", `${PREFIX}/admin/db/restore`, { name: "nope.db", confirmation: "yes", },);
    expect(res.status,).toBe(400,);
  });

  test("POST restore rejects an unknown snapshot name", async () => {
    const app = makeApp(UserRole.Admin,);
    const res = await handle(app, "POST", `${PREFIX}/admin/db/restore`, {
      name: "missing.db",
      confirmation: "RESTORE",
    },);

    expect(res.status,).toBe(400,);
  });

  test("POST restore swaps the live file and reports restart required", async () => {
    const { createDbBackup, } = await import("../../db/backup-restore");
    const snap = await createDbBackup({
      sqlite: testDb.sqlite as unknown as Database,
      dir: path.join(backupRoot, resolveInstanceSlug(process.env,), "db",),
    },);

    const app = makeApp(UserRole.Admin,);
    const res = await handle(app, "POST", `${PREFIX}/admin/db/restore`, { name: snap.name, confirmation: "RESTORE", },);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { restored: boolean; restartRequired: boolean; preRestoreBackup: string };
    expect(body.restored,).toBe(true,);
    expect(body.restartRequired,).toBe(true,);
    expect(body.preRestoreBackup,).toMatch(/\.db$/,);
  });
});
