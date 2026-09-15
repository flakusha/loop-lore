// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for reinit-archive retention helpers
 * (BUG-db-reinit-archive-directory-has-no-rotation).
 *
 * Uses a temp dir per test so the real backup dir is untouched.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import path from "node:path";
import type { Logger, } from "../logger";
import {
  archiveDir,
  archiveFile,
  MAX_AGE_DAYS,
  MAX_ARCHIVES,
  parseArchiveStamp,
  pruneArchives,
} from "./reinit-archive";

const noopLog: Logger = { info() {}, warn() {}, debug() {}, error() {}, } as unknown as Logger;
const ISO_STAMP = "2026-09-15T10-17-08-123Z";
const MOCK_FILE = "loop-lore.db";

/** Place `n` fake archives in `dir` with deterministic timestamps. Each file's
 * mtime is set so `pruneArchives` can compute age consistently. The stamp
 * prefix mirrors the `archiveFile()` output so the timestamp parser works. */
function seedArchives(dir: string, n: number, ageDays = 0,): string[] {
  mkdirSync(dir, { recursive: true, },);
  const names: string[] = [];
  for (let i = 0; i < n; i++) {
    const stamp = new Date(Date.now() - ageDays * 86_400_000 + i * 1000,)
      .toISOString().replace(/[:.]/g, "-",);
    const name = `${stamp}-${MOCK_FILE}`;
    const filePath = path.join(dir, name,);
    writeFileSync(filePath, "",);
    utimesSync(filePath, Date.now() / 1000, Date.now() / 1000,);
    names.push(name,);
  }
  return names;
}

let tmpDir: string | undefined;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "reinit-archive-test-",),);
},);

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true, },);
    tmpDir = undefined;
  }
},);

describe("parseArchiveStamp", () => {
  test("parses the move-at timestamp from an archive name", () => {
    const stamp = parseArchiveStamp(`${ISO_STAMP}-loop-lore.db`,);
    expect(stamp,).not.toBeNull();
    expect(stamp?.toISOString(),).toBe("2026-09-15T10:17:08.123Z",);
  });

  test("returns null for non-archive names", () => {
    expect(parseArchiveStamp("loop-lore.db",),).toBeNull();
    expect(parseArchiveStamp("README.md",),).toBeNull();
    expect(parseArchiveStamp("2026-09-15-loop-lore.db",),).toBeNull();
  });
});

describe("pruneArchives", () => {
  test("keeps at most MAX_ARCHIVES entries (evicts oldest first)", () => {
    const entries = seedArchives(tmpDir!, MAX_ARCHIVES + 5,);
    expect(readdirSync(tmpDir!,).length,).toBe(MAX_ARCHIVES + 5,);

    pruneArchives(tmpDir!, noopLog,);

    const remaining = readdirSync(tmpDir!,);
    expect(remaining.length,).toBe(MAX_ARCHIVES,);
    // The OLDEST five must have been removed.
    const dropped = new Set(entries.slice(0, 5,),);
    for (const name of remaining) { expect(dropped.has(name,),).toBe(false,); }
  });

  test("drops any archive older than MAX_AGE_DAYS regardless of count", () => {
    // 2 fresh + 3 ancient; ancient ones are past MAX_AGE_DAYS.
    seedArchives(tmpDir!, 2, 0,);
    seedArchives(tmpDir!, 3, MAX_AGE_DAYS + 5,);
    expect(readdirSync(tmpDir!,).length,).toBe(5,);

    pruneArchives(tmpDir!, noopLog,);

    const remaining = readdirSync(tmpDir!,);
    expect(remaining.length,).toBe(2,);
  });

  test("leaves non-stamped files in the backup dir untouched", () => {
    if (!tmpDir) { throw new Error("tmpDir missing",); }
    writeFileSync(path.join(tmpDir, "README.md",), "metadata",);
    writeFileSync(path.join(tmpDir, "manual-snapshot.tar",), "",);
    seedArchives(tmpDir!, 3,);

    pruneArchives(tmpDir!, noopLog,);

    expect(readdirSync(tmpDir!,),).toContain("README.md",);
    expect(readdirSync(tmpDir!,),).toContain("manual-snapshot.tar",);
  });

  test("survives a missing or unreadable backup dir without throwing", () => {
    // Point at a path that does not exist — should warn + return, not throw.
    expect(() => pruneArchives(path.join(tmpDir!, "does-not-exist",), noopLog,)).not.toThrow();
  });
});

describe("archiveFile", () => {
  test("moves the source file into the archive dir and applies retention", () => {
    const sourceDir = mkdtempSync(path.join(tmpdir(), "reinit-src-",),);
    try {
      const sourcePath = path.join(sourceDir, MOCK_FILE,);
      writeFileSync(sourcePath, "x",);

      // Use LOOP_LORE_BACKUP_DIR env override so we don't disturb the real dir.
      const backupDir = path.join(tmpDir!, "backup",);
      Bun.env.LOOP_LORE_BACKUP_DIR = backupDir;

      archiveFile(sourcePath, noopLog,);

      expect(readdirSync(sourceDir,).length,).toBe(0,);
      const archived = readdirSync(backupDir,);
      expect(archived.length,).toBe(1,);
      expect(archived[0],).toMatch(/^\d{4}-\d{2}-\d{2}T[\d-]+Z?-loop-lore\.db$/,);
    } finally {
      delete Bun.env.LOOP_LORE_BACKUP_DIR;
      rmSync(sourceDir, { recursive: true, force: true, },);
    }
  });

  test("archiveDir falls back to the data-dir sibling when env is unset", () => {
    delete Bun.env.LOOP_LORE_BACKUP_DIR;
    const dir = archiveDir();
    // ponytail: don't snapshot absolute paths — just sanity check the suffix.
    expect(dir.endsWith("loop-lore-data-backup",),).toBe(true,);
  });
});
