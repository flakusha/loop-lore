// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Spill filenames must survive whatever the result-row id contains.
 *
 * That id is an idempotency cache key built by `makeKey()` as
 * `${METHOD} ${routePattern} ${userId} ${requestId}` — spaces and slashes.
 * Using it verbatim as a filename pointed the write at a nested path whose
 * parents do not exist, so every spill for a routed request failed with
 * ENOENT and the body was lost behind a swallowed log line.
 *
 * BUG-async-spill-uses-cache-key-as-filename-so-routed-ids-lose
 */

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import path from "node:path";
import { makeKey, } from "../middleware/idempotency-utils";
import {
  offloadDir,
  offloadExists,
  readOffloadedBody,
  resetOffloadDir,
  setOffloadDir,
  spill,
  spillFileStem,
} from "./spill";

describe("spill filename safety", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "loop-lore-spillfn-",),);
    setOffloadDir(dir,);
  },);

  afterEach(() => {
    resetOffloadDir();
    rmSync(dir, { recursive: true, force: true, },);
  },);

  test("round-trips a body under a real idempotency cache key id", async () => {
    // Exactly what makeKey() produces for a routed GET.
    const id = makeKey(
      "GET",
      "/api/v1/chats/:id/messages",
      "a0000001-0000-4000-a000-000000000000",
      "87394d0f-cf63-45a5-83d6-5b0846dd5304",
    );

    expect(id,).toContain("/",);
    const body = JSON.stringify({ messages: [{ content: "x".repeat(2048,), },], },);

    const filePath = await spill(id, body,);
    try {
      // The file lands directly in the spill namespace, not a nested path.
      expect(path.dirname(filePath,),).toBe(offloadDir(),);
      expect(readOffloadedBody(filePath,),).toBe(body,);
      expect(offloadExists(id,),).toBe(true,);
    } finally {
      rmSync(filePath, { force: true, },);
    }
  });

  test("offloadExists agrees with a real spill — it must not look for the raw id", async () => {
    const id = makeKey("POST", "/api/v1/generation/generate", "u-1", "r-9",);
    const filePath = await spill(id, "payload",);
    try {
      expect(offloadExists(id,),).toBe(true,);
      expect(offloadExists(`${id}-different`,),).toBe(false,);
    } finally {
      rmSync(filePath, { force: true, },);
    }
  });

  test("distinct ids never collide onto one filename", () => {
    const a = spillFileStem(makeKey("GET", "/api/a", "u-1", "r-1",),);
    const b = spillFileStem(makeKey("GET", "/api/b", "u-1", "r-1",),);
    const c = spillFileStem("a-plain-uuid-id",);
    expect(new Set([a, b, c,],).size,).toBe(3,);
  });

  test("a traversal-shaped id cannot escape the spill namespace", () => {
    for (const id of ["../../etc/passwd", "/absolute/path", "..", "",]) {
      const stem = spillFileStem(id,);
      expect(stem,).not.toContain("/",);
      expect(stem,).not.toContain("..",);
      expect(path.join(offloadDir(), `${stem}.json.gz`,).startsWith(offloadDir(),),).toBe(true,);
    }
  });

  test("the same id always maps to the same stem (stable across processes)", () => {
    const id = makeKey("GET", "/api/v1/chats/:id/messages", "u-1", "r-1",);
    expect(spillFileStem(id,),).toBe(spillFileStem(id,),);
    expect(spillFileStem(id,),).toMatch(/^[0-9a-f]{64}$/,);
  });
});
