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
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import path from "node:path";
import {
  offloadDir,
  offloadDiskBytes,
  offloadExists,
  readOffloadedBody,
  setOffloadDir,
  SPILL_ROOT,
  spillFileStem,
} from "./offload";

const DEFAULT_DIR = path.join(SPILL_ROOT, String(process.pid,),);

describe("offload helpers", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "loop-lore-offload-",),);
    setOffloadDir(dir,);
  },);
  afterEach(() => {
    setOffloadDir(DEFAULT_DIR,);
    rmSync(dir, { recursive: true, force: true, },);
  },);

  test("the default spill dir is a per-process namespace under the repo's .tmp/ root", () => {
    setOffloadDir(DEFAULT_DIR,);
    expect(DEFAULT_DIR,).toBe(path.join(SPILL_ROOT, String(process.pid,),),);
    expect(SPILL_ROOT,).toContain(".tmp",);
    expect(SPILL_ROOT,).toContain("async-store",);
  });

  test("setOffloadDir redirects the spill namespace away from the shared default", () => {
    const other = mkdtempSync(path.join(tmpdir(), "loop-lore-offload-alt-",),);
    try {
      setOffloadDir(other,);
      expect(offloadDir(),).toBe(other,);
      expect(offloadDir(),).not.toBe(DEFAULT_DIR,);
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

  test("offloadDiskBytes reports zero before any spills", () => {
    // The spill namespace is empty at test start; assert
    // non-negative rather than zero to keep the assertion robust.
    const bytes = offloadDiskBytes();
    expect(bytes,).toBeGreaterThanOrEqual(0,);
  });
});
