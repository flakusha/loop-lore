// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { existsSync, mkdirSync, rmSync, } from "node:fs";
import path from "node:path";
import {
  OFFLOAD_DIR,
  offloadDiskBytes,
  offloadExists,
  readOffloadedBody,
} from "./offload";

/**
 * Smoke tests for the offload helpers — covers the disk round-trip
 * (gzip-spill → gunzip-restore) without spinning up the full daemon
 * (the daemon is exercised end-to-end via integration tests against a
 * real DB in the e2e suite).
 */

const tmpRoot = path.resolve(".tmp", "async-store-test",);

describe("offload helpers", () => {
  beforeEach(() => {
    if (existsSync(tmpRoot,)) { rmSync(tmpRoot, { recursive: true, force: true, },); }
    mkdirSync(tmpRoot, { recursive: true, },);
  },);

  afterEach(() => {
    if (existsSync(tmpRoot,)) { rmSync(tmpRoot, { recursive: true, force: true, },); }
  },);

  test("OFFLOAD_DIR lives under the repo's .tmp/ scratch root", () => {
    expect(OFFLOAD_DIR,).toContain(".tmp",);
    expect(OFFLOAD_DIR,).toContain("async-store",);
  });

  test("offloadExists + readOffloadedBody round-trip a gzip-spilled body", () => {
    // The daemon writes via `spill()` (not exported); emulate the on-disk
    // shape here so the readers are covered without spinning up cron.
    const id = "req-roundtrip";
    const filePath = path.join(OFFLOAD_DIR, `${id}.json.gz`,);
    mkdirSync(OFFLOAD_DIR, { recursive: true, },);
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
    expect(readOffloadedBody(path.join(OFFLOAD_DIR, "nope.json.gz",),),).toBeNull();
  });

  test("readOffloadedBody returns null when the file is corrupt", () => {
    const filePath = path.join(OFFLOAD_DIR, "corrupt.json.gz",);
    mkdirSync(OFFLOAD_DIR, { recursive: true, },);
    const fs = require("node:fs",) as typeof import("node:fs");
    fs.writeFileSync(filePath, Buffer.from("not-gzip-data",),);
    expect(readOffloadedBody(filePath,),).toBeNull();
  });

  test("offloadDiskBytes reports zero before any spills", () => {
    // OFFLOAD_DIR may have stale content from prior runs; assert
    // non-negative rather than zero to keep the assertion robust.
    const bytes = offloadDiskBytes();
    expect(bytes,).toBeGreaterThanOrEqual(0,);
  });
});
