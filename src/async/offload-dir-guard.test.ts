// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Permanent guard for the async-store spill directory (rule://parallel-safe-tests).
 *
 * `OFFLOAD_DIR` used to be a fixed `path.resolve(".tmp", "async-store")`, so
 * the running app, every test file and every parallel test process shared one
 * spill directory: races under `--parallel --isolate`, plus residue bleeding
 * into the next run (measured +1/+2 files per e2e arm from a green suite).
 * These tests fail loudly if any async-store test ever resolves the spill dir
 * back to the shared repo path.
 *
 * Resource contract (parallel-safe): every test owns its own resources — a
 * fresh `mkdtempSync(tmpdir(), "loop-lore-test-")` dir per probe, released in
 * `finally`. The child-process probes write only into their own leases. Each
 * test passes standalone, in any order, and under concurrent file execution.
 */

import { describe, expect, test, } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, resolve, } from "node:path";
import { uid, } from "../utils";
import {
  offloadDir,
  offloadExists,
  readOffloadedBody,
  resetOffloadDir,
  setOffloadDir,
  spill,
  SPILL_ROOT,
} from "./spill";

/** Repo root: `src/async/` → `src/` → repo. */
const REPO_ROOT = resolve(import.meta.dir, "..", "..",);

/** The shared path every async-store test must stop resolving to. */
const SHARED_OFFLOAD_DIR = resolve(REPO_ROOT, ".tmp", "async-store",);

/** Async test files that write spill files (so they need the per-test lease). */
const SPILL_WRITING_TESTS = [
  "apply.test.ts",
  "offload-daemon.test.ts",
  "offload.test.ts",
  "spill-filename.test.ts",
  "spill.test.ts",
];

/** Sorted `*.json.gz` names under the shared dir, for before/after comparison. */
function snapshotSharedDir(): string[] {
  if (!existsSync(SHARED_OFFLOAD_DIR,)) { return []; }
  return readdirSync(SHARED_OFFLOAD_DIR,).filter((n,) => n.endsWith(".json.gz",)).sort();
}

describe("async-store spill dir is never the shared repo path", () => {
  test("the default resolves under the repo .tmp scratch root", () => {
    resetOffloadDir();
    expect(SPILL_ROOT,).toContain(".tmp",);
    expect(SPILL_ROOT,).toContain("async-store",);
    // Structure, not a re-derived constant: the pre-fix flat shared
    // `OFFLOAD_DIR` returns `SPILL_ROOT` itself here and fails both.
    expect(resolve(offloadDir(), "..",),).toBe(SPILL_ROOT,);
    expect(offloadDir(),).not.toBe(SPILL_ROOT,);
  });

  test("setOffloadDir redirects spills away from the shared repo path", () => {
    const dir = mkdtempSync(join(tmpdir(), "loop-lore-test-",),);
    try {
      setOffloadDir(dir,);
      expect(offloadDir(),).toBe(dir,);
      expect(offloadDir(),).not.toBe(SHARED_OFFLOAD_DIR,);
    } finally {
      resetOffloadDir();
      rmSync(dir, { recursive: true, force: true, },);
    }
  });

  test(
    "every spill-writing async suite runs green and leaves the shared dir untouched",
    // This test spawns five real suites, so it needs a deadline well above its
    // ~1.6s normal cost. At the inherited 5s default it was a 3.1x margin and
    // flaked at 48-way load (reproduced: 5040ms -> "timed out after 5000ms"),
    // failing a green tree under the project's own --parallel gate. Scoped to
    // this one test rather than raising bunfig's global default, which would
    // silently mask real hangs in the other 60 tests.
    () => {
      // Behavioural, not a source-text grep: run each suite for real in a child
      // process (isolated module registry) and compare the shared dir before
      // and after. A suite that regressed to the fixed path — for any reason,
      // via any import style — shows up here as a changed snapshot.
      const before = snapshotSharedDir();
      // A renamed or moved suite makes spawnSync throw ENOENT, which surfaces
      // as a bare spawn failure — name the missing file instead.
      const missing = SPILL_WRITING_TESTS.filter((n,) => !existsSync(join(import.meta.dir, n,),));
      expect(missing,).toEqual([],);
      // One spawn for all five suites: same per-file isolation as the CI gate,
      // a fifth of the process churn of a loop.
      const proc = Bun.spawnSync({
        cmd: [
          process.execPath,
          "test",
          ...SPILL_WRITING_TESTS.map((n,) => join(import.meta.dir, n,)),
        ],
        env: { ...process.env, E2E_SAFEGUARD: "1", },
        // Child deadline chosen deliberately rather than inherited: a wedged
        // suite is killed here at 45s with a real signal, well inside this
        // test's 60s budget, so the failure reads as "child timed out" instead
        // of the test itself timing out with no cause.
        timeout: 45_000,
      },);

      // exitCode first: it separates "suites ran and were green" from
      // "suites crashed and the snapshot never changed", which would otherwise
      // pass vacuously. Both assertions are load-bearing.
      expect(proc.exitCode, proc.stderr.toString(),).toBe(0,);
      expect(snapshotSharedDir(),).toEqual(before,);
    },
    60_000,
  );

  test("a real spill writes nothing into the shared repo dir", async () => {
    // The end-to-end contract behind the unit guards: exercise the real write
    // path (this is what leaked before) and assert the shared dir is untouched.
    const before = snapshotSharedDir();
    const dir = mkdtempSync(join(tmpdir(), "loop-lore-test-",),);
    try {
      setOffloadDir(dir,);
      const id = "guard-probe-" + uid();
      const filePath = await spill(id, "guard payload",);
      expect(offloadExists(id,),).toBe(true,);
      expect(readOffloadedBody(filePath,),).toBe("guard payload",);
    } finally {
      resetOffloadDir();
      rmSync(dir, { recursive: true, force: true, },);
    }

    expect(snapshotSharedDir(),).toEqual(before,);
  });
});
