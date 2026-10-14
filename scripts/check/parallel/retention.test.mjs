// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Retention ordering (B2), the delete age guard (B9) and the symlink guard
 * (N11) for pruneOldReports / pruneOldRunTmpDirs.
 *
 * Both prune functions take an optional directory argument (default: the real
 * .tmp/) so this suite runs hermetically against a fixture dir under .tmp/ and
 * never races a concurrent real check run's reports.
 */

import { afterEach, describe, expect, test, } from "bun:test";
import {
  existsSync,
  lutimesSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { PROJECT_ROOT, } from "./config.mjs";
import { pruneOldReports, pruneOldRunTmpDirs, } from "./retention.mjs";

const HOUR = 3600 * 1000;
const TMP = path.join(PROJECT_ROOT, ".tmp",);
const created = [];

function fixtureDir() {
  const dir = path.join(TMP, `retention-fixture-${process.pid}`,);
  mkdirSync(dir, { recursive: true, },);
  created.push(dir,);
  return dir;
}

function putFile(dir, name, mtimeMs,) {
  const p = path.join(dir, name,);
  writeFileSync(p, "{}\n", "utf8",);
  const t = new Date(mtimeMs,);
  utimesSync(p, t, t,);
  return p;
}

function putDir(dir, name, mtimeMs,) {
  const p = path.join(dir, name,);
  mkdirSync(p, { recursive: true, },);
  const t = new Date(mtimeMs,);
  utimesSync(p, t, t,);
  return p;
}

const reportName = (tag, whenMs,) => `check-report-${tag}-${whenMs.toString(36,)}.json`;
const runDirName = (tag, whenMs,) => `run-${tag}-${whenMs.toString(36,)}`;

afterEach(() => {
  while (created.length > 0) {
    rmSync(created.pop(), { recursive: true, force: true, },);
  }
},);

describe("pruneOldReports", () => {
  test("orders by mtime, not by RUN_ID lexicographically (B2)", () => {
    // RUN_ID = <pid>-<base36 time>. Lexicographic sort compares the pid
    // first, so a high-pid (lex-newest) report with an OLDEST mtime was
    // kept while genuinely newer reports were pruned. mtime order must win.
    const dir = fixtureDir(),
      now = Date.now(),
      fresh = now - 48 * HOUR,
      stale = now - 72 * HOUR;
    // 20 lex-OLD reports, newer on disk (48h) — must all survive.
    for (let i = 0; i < 20; i++) {
      putFile(dir, reportName(`100-${i}`, fresh + i * 1000,), fresh + i * 1000,);
    }
    // 5 lex-NEW reports (pid 9999999 sorts last = "newest"), oldest on disk
    // (72h) — the retention budget must prune THESE.
    for (let i = 0; i < 5; i++) {
      putFile(dir, reportName(`9999999-${i}`, stale,), stale,);
    }
    pruneOldReports(dir,);
    for (let i = 0; i < 5; i++) {
      expect(
        existsSync(path.join(dir, reportName(`9999999-${i}`, stale,),),),
        `lex-newest but 72h-old report ${i} must be pruned`,
      ).toBe(false,);
    }
    for (let i = 0; i < 20; i++) {
      expect(
        existsSync(path.join(dir, reportName(`100-${i}`, fresh + i * 1000,),),),
        `48h-old report ${i} is among the newest and must be kept`,
      ).toBe(true,);
    }
  });

  test("never deletes a per-run report younger than the age guard (B9)", () => {
    const dir = fixtureDir(),
      now = Date.now(),
      fresh = now - 1 * HOUR;
    // 25 reports, ALL younger than the 24h delete guard. The 5 with the
    // oldest mtimes are the count-based delete candidates — the guard must
    // save them regardless of how far the count is exceeded.
    for (let i = 0; i < 5; i++) {
      putFile(dir, reportName(`9999999-${i}`, fresh,), fresh,);
    }
    for (let i = 0; i < 20; i++) {
      putFile(dir, reportName(`100-${i}`, fresh + 60_000 + i * 1000,), fresh + 60_000 + i * 1000,);
    }
    pruneOldReports(dir,);
    for (let i = 0; i < 25; i++) {
      const name = i < 5
        ? reportName(`9999999-${i}`, fresh,)
        : reportName(`100-${i - 5}`, fresh + 60_000 + (i - 5) * 1000,);
      expect(existsSync(path.join(dir, name,),), `fresh report ${i} must not be deleted`,).toBe(
        true,
      );
    }
  });

  test("still prunes old reports once the count is exceeded (no guard for the genuinely old)", () => {
    const dir = fixtureDir(),
      now = Date.now(),
      old = now - 48 * HOUR;
    for (let i = 0; i < 25; i++) {
      putFile(dir, reportName(`100-${i}`, old + i * 1000,), old + i * 1000,);
    }
    pruneOldReports(dir,);
    // 25 files, keep 20 → the 5 oldest are gone, 20 newest remain.
    let remaining = 0;
    for (let i = 0; i < 25; i++) {
      if (existsSync(path.join(dir, reportName(`100-${i}`, old + i * 1000,),),)) { remaining++; }
    }
    expect(remaining,).toBe(20,);
  });

  test("never deletes a symlink, even when it sorts as the oldest entry (N11)", () => {
    const dir = fixtureDir(),
      now = Date.now(),
      stale = now - 72 * HOUR,
      fresh = now - 48 * HOUR;
    const real = putFile(dir, "check-report.real.json", fresh,);
    // Symlink named like a per-run report, with the OLDEST mtime so it is the
    // first delete candidate. statSync follows the link and reports the
    // target's (regular-file) mode, so isSymbolicLink() never fired and the
    // link was unlinked; lstatSync must see the symlink itself and skip it.
    const link = path.join(dir, "check-report-9999999-x.json",);
    symlinkSync("check-report.real.json", link,);
    // lutimesSync, NOT utimesSync: utimes follows the link and stamps the
    // TARGET, leaving the link's own mtime at "now" so it sorted newest and
    // was never a delete candidate — the test passed without ever reaching
    // the guard. The link itself must carry the stale mtime.
    const t = new Date(stale,);
    lutimesSync(link, t, t,);
    for (let i = 0; i < 20; i++) {
      putFile(dir, reportName(`100-${i}`, fresh + i * 1000,), fresh + i * 1000,);
    }
    pruneOldReports(dir,);
    expect(existsSync(link,), "symlink must survive retention",).toBe(true,);
    expect(existsSync(real,), "symlink target must survive retention",).toBe(true,);
  });
});

describe("pruneOldRunTmpDirs", () => {
  test("never deletes a scratch dir younger than the age guard (B9)", () => {
    const dir = fixtureDir(),
      now = Date.now(),
      fresh = now - 1 * HOUR;
    for (let i = 0; i < 5; i++) {
      putDir(dir, runDirName(`9999999-${i}`, fresh,), fresh,);
    }
    for (let i = 0; i < 20; i++) {
      putDir(dir, runDirName(`100-${i}`, fresh + 60_000 + i * 1000,), fresh + 60_000 + i * 1000,);
    }
    pruneOldRunTmpDirs(dir,);
    for (let i = 0; i < 25; i++) {
      const name = i < 5
        ? runDirName(`9999999-${i}`, fresh,)
        : runDirName(`100-${i - 5}`, fresh + 60_000 + (i - 5) * 1000,);
      expect(existsSync(path.join(dir, name,),), `fresh scratch dir ${i} must not be deleted`,).toBe(
        true,
      );
    }
  });

  test("still prunes old scratch dirs once the count is exceeded", () => {
    const dir = fixtureDir(),
      now = Date.now(),
      old = now - 48 * HOUR;
    for (let i = 0; i < 25; i++) {
      putDir(dir, runDirName(`100-${i}`, old + i * 1000,), old + i * 1000,);
    }
    pruneOldRunTmpDirs(dir,);
    let remaining = 0;
    for (let i = 0; i < 25; i++) {
      if (existsSync(path.join(dir, runDirName(`100-${i}`, old + i * 1000,),),)) { remaining++; }
    }
    // keep = REPORT_RETENTION_COUNT - 1 (the current run's own dir is always kept)
    expect(remaining,).toBe(19,);
  });
});
