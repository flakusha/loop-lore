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
import fs, { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveInstanceSlug, } from "../../config/state-dir";
import {
  hasSqliteHeader,
  resolveBackupPath,
  validateSqliteSnapshot,
} from "../../db/backup-restore";
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

function makeApp(userRole: string | null, maxFileSize?: number,): Elysia {
  const app = new Elysia({ name: "test-db-backup", },);
  app.derive(() => ({ userId: userRole ? `test-${userRole}` : null, userRole, sessionId: null, }));
  const config = maxFileSize === undefined
    ? {} as never
    : { assets: { maxFileSize, }, } as never;

  return app.use(dbBackupRoutes({ database: db, config, }, PREFIX,),);
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

function upload(app: Elysia, file: File,): Promise<Response> {
  const form = new FormData();
  form.set("file", file,);
  return app.handle(
    new Request(`http://localhost${PREFIX}/admin/db/backup/upload`, {
      method: "POST",
      body: form,
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

    expect((await handle(app, "GET", `${PREFIX}/admin/db/backup/x.db`,)).status,).toBe(401,);
    expect((await upload(app, new File(["x",], "x.db",),)).status,).toBe(401,);
  });

  test("non-admin is 403 on every verb", async () => {
    const app = makeApp(UserRole.User,);
    expect((await handle(app, "GET", `${PREFIX}/admin/db/backup`,)).status,).toBe(403,);
    expect((await handle(app, "POST", `${PREFIX}/admin/db/backup`,)).status,).toBe(403,);
    expect(
      (await handle(app, "POST", `${PREFIX}/admin/db/restore`, { name: "x.db", confirmation: "RESTORE", },)).status,
    )
      .toBe(403,);

    expect((await handle(app, "GET", `${PREFIX}/admin/db/backup/x.db`,)).status,).toBe(403,);
    expect((await upload(app, new File(["x",], "x.db",),)).status,).toBe(403,);
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

  test("POST restore rejects a header-valid empty-schema snapshot with a path-free 400", async () => {
    const { hasSqliteHeader, } = await import("../../db/backup-restore");
    const backupDir = path.join(backupRoot, resolveInstanceSlug(process.env,), "db",);
    mkdirSync(backupDir, { recursive: true, },);
    const emptyPath = path.join(backupDir, "empty-schema.db",);
    const empty = new Database(emptyPath,);
    empty.exec("PRAGMA user_version = 1;",); // header written, no user tables
    empty.close();
    expect(hasSqliteHeader(emptyPath,),).toBe(true,);

    const liveBefore = readFileSync(livePath,);
    const app = makeApp(UserRole.Admin,);
    const res = await handle(app, "POST", `${PREFIX}/admin/db/restore`, {
      name: "empty-schema.db",
      confirmation: "RESTORE",
    },);

    expect(res.status,).toBe(400,);
    const body = await res.json() as { error: string };
    expect(body.error,).toContain("snapshot is not a valid SQLite database",);
    expect(body.error,).not.toContain(backupRoot,);
    expect(body.error,).not.toContain(livePath,);
    expect(readFileSync(livePath,),).toEqual(liveBefore,);
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

  test("GET download rejects traversal-shaped names", async () => {
    const app = makeApp(UserRole.Admin,);
    for (const bad of ["%2E%2E%2Fx.db", "%2Fetc%2Fpasswd", "sub%5Cx.db", "a..b.db",]) {
      const res = await handle(app, "GET", `${PREFIX}/admin/db/backup/${bad}`,);
      expect(res.status,).toBeGreaterThanOrEqual(400,);
      expect(res.status,).toBeLessThan(500,);
    }
  });

  test("POST upload rejects non-SQLite and header-only empty-schema files", async () => {
    const app = makeApp(UserRole.Admin,);
    expect((await upload(app, new File([new Uint8Array([1, 2, 3, 4,],),], "garbage.db",),)).status,).toBe(400,);

    const backupDir = path.join(backupRoot, resolveInstanceSlug(process.env,), "db",);
    mkdirSync(backupDir, { recursive: true, },);
    const emptyPath = path.join(mkdtempSync(path.join(os.tmpdir(), "db-upload-empty-",),), "empty.db",);
    try {
      const empty = new Database(emptyPath,);
      empty.exec("PRAGMA user_version = 1;",);
      empty.close();
      const bytes = new Uint8Array(readFileSync(emptyPath,),);
      expect(hasSqliteHeader(emptyPath,),).toBe(true,);
      const res = await upload(app, new File([bytes,], `upload-empty-${Date.now()}.db`,),);
      expect(res.status,).toBe(400,);
      const body = await res.json() as { error: string };
      expect(body.error,).toContain("not a valid SQLite database",);
      expect(body.error,).not.toContain(backupDir,);
    } finally {
      rmSync(path.dirname(emptyPath,), { recursive: true, force: true, },);
    }

    expect(readdirSync(backupDir,).some((n,) => n.endsWith(".tmp",)),).toBe(false,);
  });

  test("POST upload enforces the configured byte cap and rejects traversal names", async () => {
    const capped = makeApp(UserRole.Admin, 64,);
    const tooBig = await upload(capped, new File([new Uint8Array(128,),], "cap.db",),);
    expect(tooBig.status,).toBe(422,);

    const app = makeApp(UserRole.Admin,);
    for (const name of ["../escape.db", "/abs.db", "sub\\escape.db", "a..b.db", "plain.txt",]) {
      const res = await upload(app, new File(["x",], name,),);
      expect(res.status,).toBe(400,);
    }
  });

  test("download → upload → restore round trip validates the uploaded snapshot", async () => {
    const app = makeApp(UserRole.Admin,);
    const created = await handle(app, "POST", `${PREFIX}/admin/db/backup`,);
    expect(created.status,).toBe(201,);
    const createdBody = await created.json() as { backup: { name: string } };

    const downloaded = await handle(app, "GET", `${PREFIX}/admin/db/backup/${createdBody.backup.name}`,);
    expect(downloaded.status,).toBe(200,);
    expect(downloaded.headers.get("content-type",),).toBe("application/octet-stream",);
    const bytes = new Uint8Array(await downloaded.arrayBuffer(),);
    expect(bytes.length,).toBeGreaterThan(0,);

    const name = `roundtrip-${Date.now()}.db`;
    const uploaded = await upload(app, new File([bytes,], name,),);
    expect(uploaded.status,).toBe(201,);
    const uploadedBody = await uploaded.json() as { backup: { name: string; sizeBytes: number } };
    expect(uploadedBody.backup.name,).toBe(name,);
    expect(uploadedBody.backup.sizeBytes,).toBe(bytes.length,);

    const uploadedPath = path.join(
      backupRoot,
      resolveInstanceSlug(process.env,),
      "db",
      name,
    );

    expect(hasSqliteHeader(uploadedPath,),).toBe(true,);
    expect(() => validateSqliteSnapshot(uploadedPath,)).not.toThrow();
    expect(() => resolveBackupPath(path.dirname(uploadedPath,), name,)).not.toThrow();

    const restored = await handle(app, "POST", `${PREFIX}/admin/db/restore`, {
      name,
      confirmation: "RESTORE",
    },);

    expect(restored.status,).toBe(200,);
    const live = new Database(livePath, { readonly: true, },);
    try {
      const tables = live.query("SELECT name FROM sqlite_master WHERE type = 'table';",).all() as Array<
        { name: string }
      >;

      expect(tables.map((row,) => row.name),).toContain("chats",);
    } finally {
      live.close();
    }
  });

  test("malformed download name is authorized before it is validated", async () => {
    const badName = "%2E%2E%2Fx.db";
    const anon = await handle(makeApp(null,), "GET", `${PREFIX}/admin/db/backup/${badName}`,);
    expect(anon.status,).toBe(401,);
    const user = await handle(makeApp(UserRole.User,), "GET", `${PREFIX}/admin/db/backup/${badName}`,);
    expect(user.status,).toBe(403,);
    const admin = await handle(makeApp(UserRole.Admin,), "GET", `${PREFIX}/admin/db/backup/${badName}`,);
    expect(admin.status,).toBe(400,);
  });

  test("POST upload never clobbers an existing snapshot (409)", async () => {
    const app = makeApp(UserRole.Admin,);
    const created = await handle(app, "POST", `${PREFIX}/admin/db/backup`,);
    expect(created.status,).toBe(201,);
    const { backup, } = await created.json() as { backup: { name: string } };
    const backupDir = path.join(backupRoot, resolveInstanceSlug(process.env,), "db",);
    const target = path.join(backupDir, backup.name,);
    const original = readFileSync(target,);

    const duplicate = await upload(app, new File([original,], backup.name,),);
    expect(duplicate.status,).toBe(409,);
    const duplicateBody = await duplicate.json() as { error: string };
    expect(duplicateBody.error,).toContain("Snapshot already exists",);
    expect(readFileSync(target,),).toEqual(original,);
    expect(readdirSync(backupDir,).some((name,) => name.endsWith(".tmp",)),).toBe(false,);
  });

  test("POST upload 500 is path-free and cleans up after a link failure", async () => {
    const app = makeApp(UserRole.Admin,);
    const created = await handle(app, "POST", `${PREFIX}/admin/db/backup`,);
    const { backup, } = await created.json() as { backup: { name: string } };
    const backupDir = path.join(backupRoot, resolveInstanceSlug(process.env,), "db",);
    const bytes = readFileSync(path.join(backupDir, backup.name,),);

    // Test-only stub: force the generic catch with a path-bearing raw error.
    const fsHolder = fs as unknown as { linkSync: typeof fs.linkSync };
    const realLinkSync = fs.linkSync;
    fsHolder.linkSync = () => {
      throw new Error(`EACCES: cannot link '/tmp/private/${backup.name}'`,);
    };

    try {
      const res = await upload(app, new File([bytes,], `fail500-${Date.now()}.db`,),);
      expect(res.status,).toBe(500,);
      const body = await res.json() as { error: string };
      expect(body.error,).toBe("Upload failed",);
      expect(body.error,).not.toContain("/tmp",);
      expect(body.error,).not.toContain(backupDir,);
      expect(readdirSync(backupDir,).some((name,) => name.endsWith(".tmp",)),).toBe(false,);
    } finally {
      fsHolder.linkSync = realLinkSync;
    }
  });

  test("GET download surfaces an in-flight deletion as a failed body stream", async () => {
    const app = makeApp(UserRole.Admin,);
    const created = await handle(app, "POST", `${PREFIX}/admin/db/backup`,);
    const { backup, } = await created.json() as { backup: { name: string } };

    // Test-only stub: delete after existsSync/resolve, before Bun.file reads.
    const bunHolder = Bun as unknown as { file: typeof Bun.file };
    const realFile = Bun.file;
    let deleted = false;
    bunHolder.file = (...args) => {
      if (!deleted) {
        rmSync(String(args[0],), { force: true, },);
        deleted = true;
      }

      return realFile(String(args[0],),);
    };

    try {
      const res = await handle(app, "GET", `${PREFIX}/admin/db/backup/${backup.name}`,);
      expect(deleted,).toBe(true,);
      expect(res.status,).toBe(200,);
      await expect(res.arrayBuffer(),).rejects.toThrow();
    } finally {
      bunHolder.file = realFile;
    }
  });
});
