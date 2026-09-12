// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the asset file-serving helper. */
import { describe, expect, test, } from "bun:test";
import { serveFile, } from "./serve-file";

import { join, } from "node:path";

// package.json doubles as the "existing file" fixture — no scratch files.
// Anchored to the repo root via import.meta so cwd never matters.
const EXISTING = join(import.meta.dir, "..", "..", "package.json",);

describe("serveFile", () => {
  test("missing file returns 404", () => {
    const res = serveFile("/nonexistent/path/file.bin", "application/octet-stream",);
    expect(res.status,).toBe(404,);
  });

  test("serves the file bytes with content type and immutable cache", async () => {
    const res = serveFile(EXISTING, "application/json",);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("Content-Type",),).toBe("application/json",);
    expect(res.headers.get("Cache-Control",),).toMatch(/public, max-age=\d+, immutable/,);
    expect((await res.text()).length,).toBeGreaterThan(0,);
  });

  test("honors custom cache control and extra headers", () => {
    const res = serveFile(EXISTING, "application/json", {
      cacheControl: "no-store",
      extraHeaders: { "X-Custom": "yes", },
    },);
    expect(res.headers.get("Cache-Control",),).toBe("no-store",);
    expect(res.headers.get("X-Custom",),).toBe("yes",);
  });
});
