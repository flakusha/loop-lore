// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for `injectContentHashes`
 * (src/content/hash-injection.ts).
 *
 * Contract: hashed variants (name-<8hex>.js/css) replace bare /name.ext
 * references in sibling HTML files; CDN URLs and unmatched references are
 * skipped; no hashed assets → no-op; files without replacements are not
 * rewritten.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { injectContentHashes, } from "./hash-injection";

describe("injectContentHashes", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "loop-lore-hash-inject-",),);
  },);

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true, },);
  },);

  test("replaces script and stylesheet references with hashed filenames", () => {
    writeFileSync(join(dir, "app-tx4kdwfm.js",), "// stub",);
    writeFileSync(join(dir, "style-de1b62f0.css",), "/* stub */",);
    const htmlPath = join(dir, "index.html",);
    writeFileSync(
      htmlPath,
      "<!doctype html><html><head>" +
        '<link rel="stylesheet" href="/style.css">' +
        "</head><body>" +
        '<script src="/app.js" defer></script>' +
        '<script src="https://cdn.example.com/app.js"></script>' +
        "</body></html>",
    );

    const result = injectContentHashes(dir,);

    expect(result.replaced,).toBe(2,);
    expect(result.skipped,).toBe(0,);
    const html = readFileSync(htmlPath, "utf8",);
    expect(html,).toContain('href="/style-de1b62f0.css"',);
    expect(html,).toContain('src="/app-tx4kdwfm.js"',);
    // Absolute/CDN URLs untouched.
    expect(html,).toContain("https://cdn.example.com/app.js",);
    expect(html,).not.toContain('"/app.js"',);
    expect(html,).not.toContain('"/style.css"',);
  });

  test("references without a hashed variant are counted as skipped and preserved", () => {
    writeFileSync(join(dir, "other-abc12345.js",), "// stub",);
    const htmlPath = join(dir, "second.html",);
    writeFileSync(
      htmlPath,
      '<script src="/missing.js"></script>' +
        '<script src="/other.js"></script>',
    );

    const result = injectContentHashes(dir,);

    const html = readFileSync(htmlPath, "utf8",);
    expect(html,).toContain('src="/missing.js"',);
    expect(html,).toContain('src="/other-abc12345.js"',);
    // missing.js counted skipped across the whole run; other.js replaced.
    expect(result.skipped,).toBeGreaterThanOrEqual(1,);
  });
  test("wrong-length suffix does not count as a hashed variant", () => {
    const sub = mkdtempSync(join(tmpdir(), "loop-lore-hash-inject-bad-",),);
    try {
      // 9 chars — the pattern requires exactly 8.
      writeFileSync(join(sub, "app-abc123456.js",), "// stub",);
      const htmlPath = join(sub, "page.html",);
      writeFileSync(htmlPath, '<script src="/app.js"></script>',);

      const result = injectContentHashes(sub,);

      expect(result,).toEqual({ replaced: 0, skipped: 0, },);
      expect(readFileSync(htmlPath, "utf8",),).toContain('src="/app.js"',);
    } finally {
      rmSync(sub, { recursive: true, force: true, },);
    }
  });

  test("directory without hashed assets is a no-op", () => {
    const sub = mkdtempSync(join(tmpdir(), "loop-lore-hash-inject-empty-",),);
    try {
      writeFileSync(join(sub, "page.html",), '<script src="/app.js"></script>',);
      expect(injectContentHashes(sub,),).toEqual({ replaced: 0, skipped: 0, },);
      expect(readFileSync(join(sub, "page.html",), "utf8",),).toContain('src="/app.js"',);
    } finally {
      rmSync(sub, { recursive: true, force: true, },);
    }
  });
});
