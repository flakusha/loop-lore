// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for async-store disk offload (spill + read-back).
 *
 * Spills use unique ids under the repo `.tmp/async-store/` (git-ignored)
 * and delete their files afterwards, so the suite leaves no trace.
 */
import { describe, expect, test, } from "bun:test";
import { rmSync, writeFileSync, } from "node:fs";
import path from "node:path";
import { uid, } from "../utils";
import { OFFLOAD_DIR, offloadDiskBytes, offloadExists, readOffloadedBody, spill, } from "./spill";

describe("spill", () => {
  test("round-trips a body through disk", async () => {
    const id = `test-${uid()}`;
    const body = '{"status":"done","n":42}';
    const before = offloadDiskBytes();
    const filePath = await spill(id, body,);
    try {
      expect(filePath,).toBe(path.join(OFFLOAD_DIR, `${id}.json.gz`,),);
      expect(offloadExists(id,),).toBe(true,);
      expect(readOffloadedBody(filePath,),).toBe(body,);
      expect(offloadDiskBytes(),).toBeGreaterThan(before,);
    } finally {
      rmSync(filePath, { force: true, },);
    }
    expect(offloadExists(id,),).toBe(false,);
  });

  test("readOffloadedBody returns null for a missing file", () => {
    expect(readOffloadedBody(path.join(OFFLOAD_DIR, `missing-${uid()}.json.gz`,),),).toBeNull();
  });

  test("readOffloadedBody returns null for a corrupt file", () => {
    const filePath = path.join(OFFLOAD_DIR, `corrupt-${uid()}.json.gz`,);
    writeFileSync(filePath, "not gzip",);
    try {
      expect(readOffloadedBody(filePath,),).toBeNull();
    } finally {
      rmSync(filePath, { force: true, },);
    }
  });
});
