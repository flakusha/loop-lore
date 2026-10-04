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
 * Two isolation seams must both hold, and each gets its own test below:
 * `SPILL_ROOT/<pid>` (the production default, which is what protects a running
 * app) and `setOffloadDir()` (a caller claiming its own area). Testing only the
 * seam would miss a revert of `DEFAULT_DIR` back to a flat shared path.
 *
 * String inequality alone proves little in either case, so both children spill
 * the SAME id — identical filenames — and the load-bearing assertion is always
 * files-on-disk: a shared path would collapse the two payloads into one file
 * and one would read back the other's body.
 */
describe("two independent stores on one database do not share a spill path", () => {
  /**
   * Run one real child process against this worktree's spill module and have
   * it spill under the isolation mode named by `mode`.
   * `bun -e` has no script slot in argv (argv[0] is the binary), so the module
   * path lands on argv[1].
   * @param id - row id both children spill
   * @param mode - `default` keeps the production `SPILL_ROOT/<pid>` namespace;
   *               `override` installs `cwd` as the whole spill area
   * @param cwd - child working directory; `SPILL_ROOT` resolves against it
   * @returns the child's resolved spill root, spill dir, written file and pid
   * @throws If the child exits non-zero.
   */
  function runChild(
    id: string,
    mode: "default" | "override",
    cwd: string,
  ): { root: string; dir: string; file: string; pid: number } {
    const script = `
      const m = await import(process.argv[1]);
      if (process.argv[4] === "override") { m.setOffloadDir(process.argv[3]); }
      else { m.resetOffloadDir(); }
      const dir = m.offloadDir();
      const file = await m.spill(process.argv[2], "payload-for-pid-" + process.pid);
      console.log(JSON.stringify({ root: m.SPILL_ROOT, dir, file, pid: process.pid }));
    `;

    const proc = Bun.spawnSync({
      cmd: [process.execPath, "-e", script, path.join(import.meta.dir, "spill.ts",), id, cwd, mode,],
      // The child's cwd decides where `SPILL_ROOT` (a CWD-relative
      // `path.resolve`) lands, so an unrelated cwd keeps every byte of spill
      // state out of the repo's `.tmp/async-store` and away from a running
      // dev server's namespace.
      cwd,
      timeout: 10_000,
    },);

    if (proc.exitCode !== 0) {
      throw new Error(`child spill process failed: ${proc.stderr.toString()}`,);
    }

    return JSON.parse(proc.stdout.toString().trim(),) as { root: string; dir: string; file: string; pid: number };
  }

  test("two processes claiming their own root with setOffloadDir stay isolated", () => {
    const rootA = mkdtempSync(path.join(tmpdir(), "loop-lore-c4-a-",),);
    const rootB = mkdtempSync(path.join(tmpdir(), "loop-lore-c4-b-",),);
    try {
      // The SAME row id in both processes: with a shared spill path the
      // filenames would be identical and one payload would clobber the other.
      const id = "criterion-4-same-row-id";
      const a = runChild(id, "override", rootA,);
      const b = runChild(id, "override", rootB,);

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

  test("two processes on the production default land in different pid namespaces", () => {
    // This is the seam that protects a running app: no `setOffloadDir`, just
    // `resetOffloadDir()` and the `SPILL_ROOT/<pid>` default. Reverting
    // `DEFAULT_DIR` to a flat `SPILL_ROOT` would put both children in one
    // directory and both assertions below would fail.
    //
    // Hermetic by construction: the child's cwd is a fresh `mkdtemp`, and
    // `SPILL_ROOT` is `path.resolve('.tmp', 'async-store')` resolved against
    // the CWD AT IMPORT TIME — so the whole tree, root included, is created
    // inside the sandbox and removed with it. The repo's `.tmp/async-store` is
    // never written, so this cannot collide with a concurrent dev server.
    const sandbox = mkdtempSync(path.join(tmpdir(), "loop-lore-c4-default-",),);
    try {
      const id = "criterion-4-default-namespace";
      const a = runChild(id, "default", sandbox,);
      const b = runChild(id, "default", sandbox,);

      // Both resolve the SAME root — that is the whole premise — and separate
      // only by pid. If the root itself differed the isolation would be the
      // sandbox's doing, not the namespace's.
      expect(a.root,).toBe(b.root,);
      expect(a.pid, "children must be distinct processes",).not.toBe(b.pid,);
      expect(a.dir, "the pid namespace must separate the two processes",).not.toBe(b.dir,);

      // The exact production shape, pinned: `SPILL_ROOT/<pid>`.
      expect(a.dir,).toBe(path.join(a.root, String(a.pid,),),);
      expect(b.dir,).toBe(path.join(b.root, String(b.pid,),),);
      expect(a.root.startsWith(sandbox + path.sep,), "SPILL_ROOT must resolve inside the sandbox",).toBe(true,);

      // Same id, same filename — so the pid namespace is the only separator
      // standing between the two payloads.
      expect(path.basename(a.file,),).toBe(path.basename(b.file,),);
      expect(path.basename(a.file,),).toBe(`${spillFileStem(id,)}.json.gz`,);

      // Each write landed in its own pid directory, both survived, and each
      // directory holds exactly one file.
      expect(a.file.startsWith(a.dir + path.sep,),).toBe(true,);
      expect(b.file.startsWith(b.dir + path.sep,),).toBe(true,);
      expect(readOffloadedBody(a.file,),).toBe(`payload-for-pid-${a.pid}`,);
      expect(readOffloadedBody(b.file,),).toBe(`payload-for-pid-${b.pid}`,);
      expect(readdirSync(a.dir,),).toEqual([path.basename(a.file,),],);
      expect(readdirSync(b.dir,),).toEqual([path.basename(b.file,),],);
    } finally {
      rmSync(sandbox, { recursive: true, force: true, },);
    }
  });
});
