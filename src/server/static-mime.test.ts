// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/server/static-mime.test.ts — Edge cases for MIME-type resolution and
// pre-compressed-variant negotiation (static-mime.ts).

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { findCompressedVariant, getContentType, } from "./static-mime";

describe("getContentType", () => {
  test("maps every known extension to its MIME type", () => {
    expect(getContentType("index.html",),).toBe("text/html",);
    expect(getContentType("styles.css",),).toBe("text/css",);
    expect(getContentType("app.js",),).toBe("application/javascript",);
    expect(getContentType("data.json",),).toBe("application/json",);
    expect(getContentType("photo.png",),).toBe("image/png",);
    expect(getContentType("photo.jpg",),).toBe("image/jpeg",);
    expect(getContentType("photo.jpeg",),).toBe("image/jpeg",);
    expect(getContentType("icon.svg",),).toBe("image/svg+xml",);
    expect(getContentType("favicon.ico",),).toBe("image/x-icon",);
    expect(getContentType("font.woff2",),).toBe("font/woff2",);
    expect(getContentType("bundle.js.gz",),).toBe("application/gzip",);
    expect(getContentType("bundle.js.br",),).toBe("application/brotli",);
    expect(getContentType("bundle.js.zst",),).toBe("application/zstd",);
  });

  test("falls back to text/plain for unknown extensions", () => {
    expect(getContentType("notes.txt",),).toBe("text/plain",);
    expect(getContentType("archive.zip",),).toBe("text/plain",);
    expect(getContentType("noextension",),).toBe("text/plain",);
    expect(getContentType("",),).toBe("text/plain",);
  });

  test("takes the final dot segment, not the first", () => {
    expect(getContentType("archive.tar.gz",),).toBe("application/gzip",);
    expect(getContentType("minified.min.js",),).toBe("application/javascript",);
  });

  test("lowercases the extension before lookup", () => {
    expect(getContentType("PAGE.HTML",),).toBe("text/html",);
    expect(getContentType("App.JS",),).toBe("application/javascript",);
    expect(getContentType("Logo.PNG",),).toBe("image/png",);
  });

  test("treats a trailing dot as an empty (unknown) extension", () => {
    expect(getContentType("file.",),).toBe("text/plain",);
  });

  test("treats query-string suffixes as part of the extension (no stripping)", () => {
    // Boundary: callers must strip query strings before calling; a URL-style
    // input does not resolve to the base type.
    expect(getContentType("style.css?v=2",),).toBe("text/plain",);
    expect(getContentType("app.js?x=1&y=2",),).toBe("text/plain",);
  });

  test("resolves extensions on full paths, not basenames", () => {
    expect(getContentType("/var/www/site/index.html",),).toBe("text/html",);
    expect(getContentType("dist/assets/app.deadbeef.js",),).toBe("application/javascript",);
  });

  test("returns text/plain for an empty string", () => {
    expect(getContentType("",),).toBe("text/plain",);
  });

  test("returns text/plain for a name with no dot", () => {
    expect(getContentType("Makefile",),).toBe("text/plain",);
  });

  test("returns text/plain for a lone dot", () => {
    expect(getContentType(".",),).toBe("text/plain",);
  });

  test("takes the final segment when there are many dots", () => {
    expect(getContentType("a.b.c.d",),).toBe("text/plain",);
    expect(getContentType("a.b.c.gz",),).toBe("application/gzip",);
  });
});

describe("findCompressedVariant", () => {
  let dir: string;
  let cssPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ll-static-mime-",),);
    cssPath = join(dir, "style.css",);
    writeFileSync(cssPath, "body {}",);
    writeFileSync(`${cssPath}.br`, "br-bytes",);
    writeFileSync(`${cssPath}.gz`, "gz-bytes",);
    writeFileSync(`${cssPath}.zst`, "zst-bytes",);
    writeFileSync(join(dir, "img.png",), "png",);
    writeFileSync(`${join(dir, "img.png",)}.br`, "png-br",);
  },);

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, },);
  },);

  test("returns null for non-compressible extensions even when a variant exists", () => {
    expect(findCompressedVariant(join(dir, "img.png",), "br",),).toBeNull();
    expect(findCompressedVariant(join(dir, "img.png",), "gzip, br, zstd",),).toBeNull();
  });

  test("prefers br over zstd and gzip when all are available", () => {
    expect(findCompressedVariant(cssPath, "gzip, zstd, br",),).toEqual({
      path: `${cssPath}.br`,
      encoding: "br",
    },);
  });

  test("prefers zstd over gzip when br is unavailable", () => {
    rmSync(`${cssPath}.br`,);
    expect(findCompressedVariant(cssPath, "gzip, zstd",),).toEqual({
      path: `${cssPath}.zst`,
      encoding: "zstd",
    },);
  });

  test("falls back to gzip when only gzip is accepted and present", () => {
    expect(findCompressedVariant(cssPath, "gzip",),).toEqual({
      path: `${cssPath}.gz`,
      encoding: "gzip",
    },);
  });

  test("normalizes accept-encoding: trims whitespace and lowercases tokens", () => {
    expect(findCompressedVariant(cssPath, "  BR ,  GZIP ",),).toEqual({
      path: `${cssPath}.br`,
      encoding: "br",
    },);
  });

  test("returns null when the accepted encoding has no variant on disk", () => {
    expect(findCompressedVariant(cssPath, "zstd",),).toEqual({
      path: `${cssPath}.zst`,
      encoding: "zstd",
    },);
    rmSync(`${cssPath}.zst`,);
    expect(findCompressedVariant(cssPath, "zstd",),).toBeNull();
  });

  test("returns null for an empty accept-encoding header", () => {
    expect(findCompressedVariant(cssPath, "",),).toBeNull();
  });

  test("returns null when the file itself does not exist", () => {
    expect(findCompressedVariant(join(dir, "ghost.css",), "br",),).toBeNull();
  });

  test("matches a comma-separated list of accepted encodings", () => {
    expect(findCompressedVariant(cssPath, "identity, br",),).toEqual({
      path: `${cssPath}.br`,
      encoding: "br",
    },);
  });

  test("matches a variant when the uppercase extension case matches exactly", () => {
    const upperPath = join(dir, "style.CSS",);
    writeFileSync(upperPath, "body{}",);
    writeFileSync(`${upperPath}.br`, "br",);
    expect(findCompressedVariant(upperPath, "br",),).toEqual({ path: `${upperPath}.br`, encoding: "br", },);
  });

  test("returns null when the variant file case does not match the query path", () => {
    writeFileSync(`${cssPath}.br`, "br",);
    const upper = cssPath.replace(/\.css$/, ".CSS",);
    expect(findCompressedVariant(upper, "br",),).toBeNull();
  });
});
