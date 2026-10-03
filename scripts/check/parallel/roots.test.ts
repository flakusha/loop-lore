// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { existsSync, } from "node:fs";
import path from "node:path";
import { DIFF_ROOT, } from "./context.mjs";
import {
  COVERAGE_DIR,
  JSCPD_DIR,
  PER_RUN_REPORT_PATH,
  PROJECT_ROOT,
  REPORT_PATH,
} from "./config.mjs";

/**
 * Resource contract: these tests own NOTHING.
 *
 * They only read module-level constants derived from import.meta.dir and
 * assert on them. No tmp file, port, database or shared global is allocated,
 * so there is nothing to tear down and nothing for a parallel runner to
 * interleave. Importing context.mjs is side-effect free without --diff-base:
 * changedFiles() returns [] for a null base and the gate flags are absent.
 *
 * Why this file exists: the split moved these modules from scripts/ down to
 * scripts/check/parallel/, two levels deeper. The relative hops were bumped by
 * one instead of two, so PROJECT_ROOT resolved to scripts/ and DIFF_ROOT did
 * too. PROJECT_ROOT broke the GPG pre-flight outright (it looked for
 * .credentials.env under scripts/), while DIFF_ROOT failed silently —
 * diff-scoped discovery resolved every repo-relative path against scripts/,
 * found nothing, and the scoped test gates reported success having run zero
 * tests. A wrong-but-resolvable path is invisible to an import-resolution
 * check, so it needs pinning here.
 */

const REPO_ROOT = path.resolve(import.meta.dir, "../../..",);

describe("PROJECT_ROOT", () => {
  test("is the repo root, not a scripts/ subdirectory", () => {
    expect(PROJECT_ROOT,).toBe(REPO_ROOT,);
  });

  test("the runner's cwd is the repo root", () => {
    expect(PROJECT_ROOT,).toBe(process.cwd(),);
  });

  test("holds the directories the runner resolves against", () => {
    expect(existsSync(path.join(PROJECT_ROOT, "package.json"),),).toBe(true,);
    expect(existsSync(path.join(PROJECT_ROOT, "scripts",),),).toBe(true,);
    expect(existsSync(path.join(PROJECT_ROOT, "src",),),).toBe(true,);
  });

  test("finds .credentials.env at the repo root, where giwt links it", () => {
    const creds = path.resolve(PROJECT_ROOT, ".credentials.env",);
    expect(creds,).toBe(path.join(REPO_ROOT, ".credentials.env",),);
    expect(existsSync(creds,),).toBe(true,);
  });
});

describe("DIFF_ROOT", () => {
  test("is the repo root, matching PROJECT_ROOT", () => {
    expect(DIFF_ROOT,).toBe(PROJECT_ROOT,);
  });

  test("resolves a repo-relative src path to a real file", () => {
    // This is what scoped test discovery does. Under the old bug this
    // resolved to <repo>/scripts/src/... and matched nothing.
    expect(existsSync(path.resolve(DIFF_ROOT, "src",),),).toBe(true,);
    expect(existsSync(path.resolve(DIFF_ROOT, "scripts", "check-parallel.mjs",),),).toBe(true,);
  });
});

describe("paths derived from PROJECT_ROOT", () => {
  test("report, coverage and jscpd paths all land under the repo root", () => {
    for (const p of [REPORT_PATH, PER_RUN_REPORT_PATH, COVERAGE_DIR, JSCPD_DIR,]) {
      expect(p.startsWith(PROJECT_ROOT + path.sep,),).toBe(true,);
    }
  });
});
