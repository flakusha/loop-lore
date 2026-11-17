// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// getDatabase() under the XDG state root: explicit-env precedence, the
// fail-loud stale-singleton guard, and the XDG default materialization.
//
// Env discipline (shared runners see one process-global env): every mutation
// uses a per-test unique tmp path and is restored synchronously around the
// (synchronous) getDatabase() call — same contract as sqlite-handle.test.ts.
// afterEach resets the singleton so nothing leaks into sibling files.
import { afterEach, describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import path from "node:path";
import { resolveDbPath, } from "../config/state-dir";
import { liveDbPath, } from "./backup-restore";
import { getDatabase, getSqliteDatabase, resetDatabaseSingleton, setTestDatabase, } from "./index";

const ENV_DB = "LOOP_LORE_DB_PATH";
const ENV_XDG = "XDG_STATE_HOME";
const ENV_PORT = "PORT";
const ENV_INSTANCE = "LOOP_LORE_INSTANCE";
const ENV_STATE = "LOOP_LORE_STATE_DIR";

/** Unique scratch root per test — parallel runners never collide. */
function scratch(): string {
  return mkdtempSync(path.join(tmpdir(), `ll-xdg-${process.pid}-${Math.random().toString(36,).slice(2, 10,)}-`,),);
}

interface SavedEnv {
  [key: string]: string | undefined;
}

function saveEnv(): SavedEnv {
  return {
    [ENV_DB]: process.env[ENV_DB],
    [ENV_XDG]: process.env[ENV_XDG],
    [ENV_PORT]: process.env[ENV_PORT],
    [ENV_INSTANCE]: process.env[ENV_INSTANCE],
    [ENV_STATE]: process.env[ENV_STATE],
  };
}

function restoreEnv(saved: SavedEnv,): void {
  for (const [key, value,] of Object.entries(saved,)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(async () => {
  setTestDatabase(null,);
  await resetDatabaseSingleton();
},);

describe("xdg state paths", () => {
  test("explicit LOOP_LORE_DB_PATH beats the XDG default", async () => {
    const saved = saveEnv();
    const root = scratch();
    const target = path.join(root, "explicit.db",);
    process.env[ENV_DB] = target;
    process.env[ENV_XDG] = path.join(root, "xdg",);
    process.env[ENV_INSTANCE] = "main";
    try {
      expect(liveDbPath(),).toBe(target,);
      expect(resolveDbPath(),).toBe(target,);
      getDatabase();
      expect(getSqliteDatabase(),).not.toBeNull();
    } finally {
      restoreEnv(saved,);
    }

    await resetDatabaseSingleton();
    rmSync(root, { recursive: true, force: true, },);
  });

  test("same path re-resolves to the live singleton; changed path fails loud", async () => {
    const saved = saveEnv();
    const root = scratch();
    const first = path.join(root, "first.db",);
    const second = path.join(root, "second.db",);
    process.env[ENV_DB] = first;
    try {
      const db = getDatabase();
      expect(getDatabase(),).toBe(db,);
      process.env[ENV_DB] = second;
      expect(() => getDatabase()).toThrow(/different path/,);
    } finally {
      restoreEnv(saved,);
    }

    await resetDatabaseSingleton();
    // After teardown the new path opens cleanly.
    process.env[ENV_DB] = second;
    try {
      getDatabase();
    } finally {
      restoreEnv(saved,);
    }

    await resetDatabaseSingleton();
    rmSync(root, { recursive: true, force: true, },);
  });

  test("default materializes under the XDG per-instance dir", async () => {
    const saved = saveEnv();
    const root = scratch();
    delete process.env[ENV_DB];
    delete process.env[ENV_STATE];
    delete process.env[ENV_INSTANCE];
    process.env[ENV_XDG] = path.join(root, "xdg",);
    process.env[ENV_PORT] = "4555";
    let opened = "";
    try {
      opened = resolveDbPath();
      expect(opened,).toBe(
        path.join(root, "xdg", "loop-lore", "port-4555", "loop-lore.db",),
      );

      getDatabase();
    } finally {
      restoreEnv(saved,);
    }

    await resetDatabaseSingleton();
    expect(opened.endsWith(path.join("port-4555", "loop-lore.db",),),).toBe(true,);
    rmSync(root, { recursive: true, force: true, },);
  });

  test("config-file server port selects the db through getDatabase", async () => {
    const saved = saveEnv();
    const root = scratch();
    delete process.env[ENV_DB];
    delete process.env[ENV_STATE];
    delete process.env[ENV_INSTANCE];
    delete process.env[ENV_PORT];
    process.env[ENV_XDG] = path.join(root, "xdg",);
    let opened = "";
    try {
      // Same composition as src/server/start.ts: the loaded config.server
      // wins over (empty) env, so a config-file port gets its own db file.
      opened = resolveDbPath(process.env, { port: 7169, },);
      expect(opened,).toBe(
        path.join(root, "xdg", "loop-lore", "port-7169", "loop-lore.db",),
      );

      getDatabase(opened,);
      expect(getSqliteDatabase(),).not.toBeNull();
    } finally {
      restoreEnv(saved,);
    }

    await resetDatabaseSingleton();
    expect(opened.endsWith(path.join("port-7169", "loop-lore.db",),),).toBe(true,);
    rmSync(root, { recursive: true, force: true, },);
  });

  test("explicit getDatabase(path) arg wins over env", async () => {
    const saved = saveEnv();
    const root = scratch();
    const viaArg = path.join(root, "via-arg.db",);
    process.env[ENV_DB] = path.join(root, "via-env.db",);
    try {
      getDatabase(viaArg,);
    } finally {
      restoreEnv(saved,);
    }

    await resetDatabaseSingleton();
    rmSync(root, { recursive: true, force: true, },);
    expect(viaArg.endsWith("via-arg.db",),).toBe(true,);
  });

  test("test override bypasses singleton resolution entirely", async () => {
    const saved = saveEnv();
    const { Kysely, } = await import("kysely");
    const { Database, } = await import("bun:sqlite");
    const { createSqliteDialect, } = await import("./index");
    const sqlite = new Database(":memory:",);
    const override = new Kysely({ dialect: createSqliteDialect(sqlite,), },);
    const root = scratch();
    process.env[ENV_DB] = path.join(root, "should-never-open.db",);
    try {
      setTestDatabase(override, sqlite,);
      expect(getDatabase(),).toBe(override,);
      expect(getSqliteDatabase(),).toBe(sqlite,);
    } finally {
      restoreEnv(saved,);
    }

    await override.destroy();
    rmSync(root, { recursive: true, force: true, },);
  });
});
