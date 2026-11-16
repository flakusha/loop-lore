// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Precedence + isolation tests for the XDG state root. All cases inject an
// explicit env record, so they never touch process.env and are immune to
// module-evaluation order (DATA_DIR freezes at first import).
import { describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  APP_STATE_DIR_NAME,
  DEFAULT_INSTANCE_SLUG,
  findLegacyDb,
  LEGACY_DATA_DIR,
  resolveDbPath,
  resolveInstanceDir,
  resolveInstanceSlug,
  resolveStateRoot,
  sanitizeInstanceSlug,
  SQLITE_FILE_NAME,
  type StateEnv,
} from "./state-dir";

describe("resolveStateRoot", () => {
  test("LOOP_LORE_STATE_DIR wins over everything", () => {
    const env: StateEnv = {
      LOOP_LORE_STATE_DIR: "/srv/custom-state",
      XDG_STATE_HOME: "/xdg",
    };
    expect(resolveStateRoot(env,),).toBe("/srv/custom-state",);
  });

  test("XDG_STATE_HOME appends the app dir name", () => {
    expect(resolveStateRoot({ XDG_STATE_HOME: "/xdg", },),).toBe(
      path.join("/xdg", APP_STATE_DIR_NAME,),
    );
  });

  test("blank XDG_STATE_HOME falls back to ~/.local/state", () => {
    for (const env of [{}, { XDG_STATE_HOME: "", }, { XDG_STATE_HOME: "   ", },] as StateEnv[]) {
      expect(resolveStateRoot(env,),).toBe(
        path.join(os.homedir(), ".local", "state", APP_STATE_DIR_NAME,),
      );
    }
  });
});

describe("resolveInstanceSlug", () => {
  test("explicit LOOP_LORE_INSTANCE wins over PORT", () => {
    expect(
      resolveInstanceSlug({ LOOP_LORE_INSTANCE: "canary", PORT: "4000", },),
    ).toBe("canary",);
  });

  test("PORT degrades to a port slug", () => {
    expect(resolveInstanceSlug({ PORT: "4000", },),).toBe("port-4000",);
  });

  test("neither set degrades to the default slug", () => {
    expect(resolveInstanceSlug({},),).toBe(DEFAULT_INSTANCE_SLUG,);
  });

  test("sanitization keeps slugs to one safe path segment", () => {
    expect(sanitizeInstanceSlug("a/b\\c:e",),).toBe("a-b-c-e",);
    expect(sanitizeInstanceSlug("..",),).toBe(DEFAULT_INSTANCE_SLUG,);
    expect(sanitizeInstanceSlug(".",),).toBe(DEFAULT_INSTANCE_SLUG,);
    expect(sanitizeInstanceSlug("   ",),).toBe(DEFAULT_INSTANCE_SLUG,);
    expect(resolveInstanceSlug({ LOOP_LORE_INSTANCE: "../../etc", },),).not.toContain("/",);
  });
});

describe("resolveDbPath precedence", () => {
  test("explicit LOOP_LORE_DB_PATH beats the XDG default", () => {
    const env: StateEnv = {
      LOOP_LORE_DB_PATH: "/tmp/explicit.db",
      XDG_STATE_HOME: "/xdg",
      LOOP_LORE_INSTANCE: "main",
      LOOP_LORE_STATE_DIR: "/override",
    };
    expect(resolveDbPath(env,),).toBe("/tmp/explicit.db",);
  });

  test("default is the per-instance sqlite file under the state root", () => {
    const env: StateEnv = { XDG_STATE_HOME: "/xdg", PORT: "4001", };
    expect(resolveDbPath(env,),).toBe(
      path.join("/xdg", APP_STATE_DIR_NAME, "port-4001", SQLITE_FILE_NAME,),
    );
  });

  test("two instances never share a sqlite file", () => {
    const base: StateEnv = { XDG_STATE_HOME: "/xdg", };
    const a = resolveDbPath({ ...base, PORT: "3000", },);
    const b = resolveDbPath({ ...base, PORT: "3001", },);
    const named = resolveDbPath({ ...base, LOOP_LORE_INSTANCE: "stable", PORT: "9999", },);
    expect(new Set([a, b, named,],).size,).toBe(3,);
    // Same inputs, same file — deterministic, no accidental uniqueness.
    expect(resolveDbPath({ ...base, PORT: "3000", },),).toBe(a,);
    expect(resolveInstanceDir({ ...base, PORT: "3000", },),).toBe(path.dirname(a,),);
  });
});

describe("findLegacyDb", () => {
  test("returns the legacy db when it exists and differs from the live path", () => {
    const legacyDir = mkdtempSync(path.join(os.tmpdir(), "ll-legacy-",),);
    try {
      const legacyDb = path.join(legacyDir, SQLITE_FILE_NAME,);
      writeFileSync(legacyDb, "fake-sqlite",);
      expect(findLegacyDb(legacyDir, "/xdg/loop-lore/default/loop-lore.db",),).toBe(legacyDb,);
    } finally {
      rmSync(legacyDir, { recursive: true, force: true, },);
    }
  });

  test("null when the legacy db is absent or IS the live path", () => {
    const legacyDir = mkdtempSync(path.join(os.tmpdir(), "ll-legacy-",),);
    try {
      expect(findLegacyDb(legacyDir, "/xdg/loop-lore/default/loop-lore.db",),).toBeNull();
      const live = path.join(legacyDir, SQLITE_FILE_NAME,);
      writeFileSync(live, "fake-sqlite",);
      expect(findLegacyDb(legacyDir, live,),).toBeNull();
    } finally {
      rmSync(legacyDir, { recursive: true, force: true, },);
    }
  });

  test("LEGACY_DATA_DIR still names the pre-XDG repo-local dir", () => {
    expect(LEGACY_DATA_DIR.endsWith(path.join("packages", "core", "loop-lore-data",),),).toBe(true,);
  });
});
