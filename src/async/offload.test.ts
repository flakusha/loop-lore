// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Smoke tests for the offload helpers — covers the disk round-trip
 * (gzip-spill → gunzip-restore) without spinning up the full daemon
 * (the daemon is exercised end-to-end via integration tests against a
 * real DB in the e2e suite).
 *
 * Resource contract (parallel-safe): every test owns a unique `mkdtemp` spill
 * directory installed via `setOffloadDir`, so nothing here writes into the
 * shared process default or another suite's files; teardown runs in
 * `afterEach`. These tests used to create a `tmpRoot` and then write straight
 * into the shared flat spill dir anyway, leaking residue into the running app's
 * spill dir — BUG-test-async-store-offload-dir-fixed-path-race.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { mkdtempSync, readdirSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import path from "node:path";
import {
  offloadDir,
  offloadDiskBytes,
  offloadExists,
  readOffloadedBody,
  resetOffloadDir,
  setOffloadDir,
  SPILL_ROOT,
  spillFileStem,
  spillRootDir,
} from "./offload";

describe("offload helpers", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "loop-lore-offload-",),);
    setOffloadDir(dir,);
  },);

  afterEach(() => {
    resetOffloadDir();
    rmSync(dir, { recursive: true, force: true, },);
  },);

  test("the default spill dir is a per-process namespace under the repo's .tmp/ root", () => {
    // `resetOffloadDir()` restores the PRODUCTION default, so `offloadDir()`
    // below is the value the running app uses — not one this file chose.
    resetOffloadDir();
    expect(SPILL_ROOT,).toContain(".tmp",);
    expect(SPILL_ROOT,).toContain("async-store",);
    // Structure, not a re-derived constant: the pre-fix flat shared
    // `OFFLOAD_DIR` returns `SPILL_ROOT` itself here and fails both.
    expect(path.dirname(offloadDir(),),).toBe(SPILL_ROOT,);
    expect(path.basename(offloadDir(),),).toBe(String(process.pid,),);
  });

  test("setOffloadDir moves both the spill namespace and the sweep root", () => {
    const other = mkdtempSync(path.join(tmpdir(), "loop-lore-offload-alt-",),);
    try {
      setOffloadDir(other,);
      expect(offloadDir(),).toBe(other,);
      // The sweep root follows, so a test's `runOnce()` can never sweep the
      // shared SPILL_ROOT and delete a concurrent process's spill files.
      expect(spillRootDir(),).toBe(other,);
    } finally {
      rmSync(other, { recursive: true, force: true, },);
    }
  });

  test("offloadExists + readOffloadedBody round-trip a gzip-spilled body", () => {
    // The daemon writes via `spill()` (not exported); emulate the on-disk
    // shape here so the readers are covered without spinning up cron.
    const id = "req-roundtrip";
    const filePath = path.join(offloadDir(), `${spillFileStem(id,)}.json.gz`,);
    const { gzipSync, } = require("node:zlib",) as typeof import("node:zlib");
    const body = JSON.stringify({ id: "msg-99", content: "hello, world", },);
    require("node:fs",) as typeof import("node:fs");
    const fs = require("node:fs",) as typeof import("node:fs");
    fs.writeFileSync(filePath, gzipSync(Buffer.from(body, "utf8",),),);

    expect(offloadExists(id,),).toBe(true,);
    const restored = readOffloadedBody(filePath,);
    expect(restored,).toBe(body,);
  });

  test("readOffloadedBody returns null for an unknown id", () => {
    expect(readOffloadedBody(path.join(offloadDir(), "nope.json.gz",),),).toBeNull();
  });

  test("readOffloadedBody returns null when the file is corrupt", () => {
    const filePath = path.join(offloadDir(), "corrupt.json.gz",);
    const fs = require("node:fs",) as typeof import("node:fs");
    fs.writeFileSync(filePath, Buffer.from("not-gzip-data",),);
    expect(readOffloadedBody(filePath,),).toBeNull();
  });

  test("offloadDiskBytes reports zero in a freshly created namespace", () => {
    // `beforeEach` hands this test an empty `mkdtemp` dir, so zero is exact —
    // the old `>= 0` bound only existed because the directory was shared.
    expect(offloadDiskBytes(),).toBe(0,);
  });
});

/**
 * Criterion 4 of BUG-async-spill-offload-dir-is-a-fixed-cwd-relative-path-
 * shared-: two independent stores over the SAME database must not share a
 * spill path. The collision is silent because the filename is a pure function
 * of the row id — `spillFileStem()` hashes it — so two processes writing the
 * same idempotency-cache key resolve the SAME filename, and whichever writes
 * last silently replaces the other's body.
 *
 * Two isolation seams must both hold, and each is checked separately:
 * `SPILL_ROOT/<pid>` separates processes that keep the default namespace, and
 * `setOffloadDir()` lets a caller (or a test) claim its own area wholesale.
 * This test exercises the seam: each child installs its own `mkdtemp` root, so
 * the namespace is chosen rather than inherited, and the shared-`SPILL_ROOT`
 * case is exactly what the differing directories rule out.
 *
 * String inequality alone would prove nothing — `setOffloadDir` replaces the
 * namespace wholesale, so a regression could leave two distinct paths that
 * still resolve to the same directory. Only the files-on-disk result is
 * load-bearing: both children spill the SAME id, so a shared path would
 * collapse the two payloads into one file and one would read back the other's
 * body.
 *
 * Resource contract (parallel-safe): children are pointed at `mkdtemp` roots,
 * never at the repo's `.tmp/async-store`, so this writes nothing into the
 * running app's spill dir. `Bun.spawnSync` is synchronous and leaves no
 * lingering child when an assertion fails; both roots are removed in `finally`.
 */
describe("two independent stores on one database do not share a spill path", () => {
  /**
   * Run one real child process against this worktree's spill module.
   * `bun -e` has no script slot in argv (argv[0] is the binary), so the module
   * path lands on argv[1].
   * @param id - row id both children spill
   * @param root - spill root to install via `setOffloadDir`
   * @returns the child's resolved spill dir, the file it wrote, and its pid
   * @throws If the child exits non-zero.
   */
  function runChild(id: string, root: string,): { dir: string; file: string; pid: number } {
    const script = `
      const m = await import(process.argv[1]);
      m.setOffloadDir(process.argv[3]);
      const dir = m.offloadDir();
      const file = await m.spill(process.argv[2], "payload-for-pid-" + process.pid);
      console.log(JSON.stringify({ dir, file, pid: process.pid }));
    `;
    const proc = Bun.spawnSync({
      cmd: [process.execPath, "-e", script, path.join(import.meta.dir, "spill.ts",), id, root,],
      // Anchor the child's cwd at `src/async/` so the module path resolves the
      // way the suite does; the child never inherits the parent's spill dir.
      cwd: import.meta.dir,
      timeout: 10_000,
    },);
    if (proc.exitCode !== 0) {
      throw new Error(`child spill process failed: ${proc.stderr.toString()}`,);
    }
    return JSON.parse(proc.stdout.toString().trim(),) as { dir: string; file: string; pid: number };
  }

  test("each process writes its own copy and neither sees the other's file", () => {
    const rootA = mkdtempSync(path.join(tmpdir(), "loop-lore-c4-a-",),);
    const rootB = mkdtempSync(path.join(tmpdir(), "loop-lore-c4-b-",),);
    try {
      // The SAME row id in both processes: with a shared spill path the
      // filenames would be identical and one payload would clobber the other.
      const id = "criterion-4-same-row-id";
      const a = runChild(id, rootA,);
      const b = runChild(id, rootB,);

      expect(a.pid, "children must be distinct processes",).not.toBe(b.pid,);
      expect(a.dir, "independent stores must resolve different spill dirs",).not.toBe(b.dir,);

      // The stem is a pure function of the id, so the two filenames MATCH —
      // that is what makes the differing directories load-bearing rather than
      // incidental. Pinned so a future stem change cannot silently make this
      // test prove nothing.
      expect(path.basename(a.file,),).toBe(path.basename(b.file,),);
      expect(path.basename(a.file,),).toBe(`${spillFileStem(id,)}.json.gz`,);

      // The real assertion: each file sits under its OWN namespace and each
      // payload survived. A shared path would collapse these into one file
      // holding one payload, failing the round-trips below.
      expect(a.file.startsWith(a.dir + path.sep,),).toBe(true,);
      expect(b.file.startsWith(b.dir + path.sep,),).toBe(true,);
      expect(readOffloadedBody(a.file,),).toBe(`payload-for-pid-${a.pid}`,);
      expect(readOffloadedBody(b.file,),).toBe(`payload-for-pid-${b.pid}`,);

      // Neither namespace ever saw the other process's write.
      expect(readdirSync(a.dir,),).toEqual([path.basename(a.file,),],);
      expect(readdirSync(b.dir,),).toEqual([path.basename(b.file,),],);
    } finally {
      rmSync(rootA, { recursive: true, force: true, },);
      rmSync(rootB, { recursive: true, force: true, },);
    }
  });
});
