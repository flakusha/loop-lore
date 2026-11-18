// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the legacy backup-pool finder and its one-per-process warning.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import path from "node:path";
import { getLogger, type Logger, setGlobalLogger, } from "../logger";
import {
  findLegacyBackupPool,
  LEGACY_BACKUP_POOL_DIR_NAME,
  legacyBackupPoolCandidates,
  resetLegacyBackupPoolWarningForTests,
  warnLegacyBackupPoolOnce,
} from "./legacy-backup-pool";

let tmp = "";

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "loop-lore-legacy-pool-",),);
  resetLegacyBackupPoolWarningForTests();
},);

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true, },);
},);

describe("legacy backup pool", () => {
  test("finds the pool that sits next to a legacy data dir", () => {
    const pool = path.join(tmp, "loop-lore-data-backup",);
    mkdirSync(pool, { recursive: true, },);

    expect(findLegacyBackupPool([pool,],),).toBe(pool,);
  });

  test("returns null when no candidate exists", () => {
    expect(findLegacyBackupPool([path.join(tmp, "missing",),],),).toBeNull();
  });

  test("the default candidates cover the historical pool locations", () => {
    const candidates = legacyBackupPoolCandidates();
    const repoRoot = path.resolve(import.meta.dir, "..", "..",);

    expect(candidates,).toContain(path.join(repoRoot, "packages", "core", "loop-lore-data-backup",),);
    expect(candidates,).toContain(path.join(repoRoot, "loop-lore-data-backup",),);
    expect(candidates,).toContain(path.join(repoRoot, "..", "loop-lore-data-backup",),);
    expect(candidates.some((candidate,) => candidate.endsWith(LEGACY_BACKUP_POOL_DIR_NAME,)),).toBe(true,);
  });

  test("warns ONCE for two calls, naming the pool and the archive root", () => {
    const pool = path.join(tmp, "loop-lore-data-backup",);
    const archiveRoot = path.join(tmp, "state", "alpha", "backups",);
    const lines = captureConsoleWarnings(() => {
      const first = warnLegacyBackupPoolOnce(pool, archiveRoot,);
      const second = warnLegacyBackupPoolOnce(pool, archiveRoot,);

      expect(first ?? "",).toContain(pool,);
      expect(first ?? "",).toContain(archiveRoot,);
      expect(second,).toBeNull();
    },);

    expect(lines,).toHaveLength(1,);
    expect(lines[0] ?? "",).toContain(pool,);
    expect(lines[0] ?? "",).toContain(archiveRoot,);
  });

  test("says nothing when there is no legacy pool", () => {
    const lines = captureConsoleWarnings(() => {
      expect(warnLegacyBackupPoolOnce(null, path.join(tmp, "backups",),),).toBeNull();
    },);

    expect(lines,).toHaveLength(0,);
  });
});

/**
 * Run `run` with no root logger (so the warning falls back to console.warn)
 * and capture what it printed.
 * @param run - the code whose warnings are captured
 * @returns the warning lines
 */
function captureConsoleWarnings(run: () => void,): string[] {
  const lines: string[] = [];
  const previous = currentLogger();
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    lines.push(args.map((arg,) => String(arg,)).join(" ",),);
  };
  // setGlobalLogger has no "clear" variant; null is the documented reset seam.

  setGlobalLogger(null as unknown as Logger,);
  try {
    run();
  } finally {
    console.warn = original;
    if (previous !== null) {
      setGlobalLogger(previous,);
    }
  }

  return lines;
}

/**
 * @returns the root logger, or null when none is initialized
 */
function currentLogger(): Logger | null {
  try {
    return getLogger();
  } catch {
    return null;
  }
}
