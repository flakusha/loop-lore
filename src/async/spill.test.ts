// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for async-store disk offload (spill + read-back).
 *
 * Resource contract (parallel-safe): every test owns a unique `mkdtemp` spill
 * directory installed via `setOffloadDir`, so no test touches the process
 * default or another suite's files; teardown runs in `afterEach` so a failing
 * test never leaks a directory. BUG-test-async-store-offload-dir-fixed-path-race.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import path from "node:path";
import { uid, } from "../utils";
import {
  offloadDir,
  offloadDiskBytes,
  offloadExists,
  readOffloadedBody,
  resetOffloadDir,
  setOffloadDir,
  spill,
  spillFileStem,
} from "./spill";

describe("spill", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "loop-lore-spill-",),);
    setOffloadDir(dir,);
  },);
  afterEach(() => {
    resetOffloadDir();
    rmSync(dir, { recursive: true, force: true, },);
  },);
  test("round-trips a body through disk", async () => {
    const id = `test-${uid()}`;
    const body = '{"status":"done","n":42}';
    const before = offloadDiskBytes();
    const filePath = await spill(id, body,);
    try {
      // The stem is a hash of the id, not the id itself: real ids are
      // idempotency cache keys containing `/` and spaces.
      // BUG-async-spill-uses-cache-key-as-filename-so-routed-ids-lose
      expect(filePath,).toBe(path.join(offloadDir(), `${spillFileStem(id,)}.json.gz`,),);
      expect(offloadExists(id,),).toBe(true,);
      expect(readOffloadedBody(filePath,),).toBe(body,);
      expect(offloadDiskBytes(),).toBeGreaterThan(before,);
    } finally {
      rmSync(filePath, { force: true, },);
    }
    expect(offloadExists(id,),).toBe(false,);
  });

  test("readOffloadedBody returns null for a missing file", () => {
    expect(readOffloadedBody(path.join(offloadDir(), `missing-${uid()}.json.gz`,),),).toBeNull();
  });

  test("readOffloadedBody returns null for a corrupt file", () => {
    const filePath = path.join(offloadDir(), `corrupt-${uid()}.json.gz`,);
    writeFileSync(filePath, "not gzip",);
    try {
      expect(readOffloadedBody(filePath,),).toBeNull();
    } finally {
      rmSync(filePath, { force: true, },);
    }
  });
});
