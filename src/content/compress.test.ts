/**
 * Tests for content/compress.ts — build-time asset compression
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { copyDirectory, walkDirectory, compressFile, compressAssets } from "./compress";

let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join("/tmp", "loop-lore-compress-test-"));
});

afterAll(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Cleanup best-effort
  }
});

// ── copyDirectory ────────────────────────────────────────────

describe("copyDirectory", () => {
  test("copies files from source to dest recursively", () => {
    const src = join(tmpDir, "copy-src");
    const dest = join(tmpDir, "copy-dest");
    mkdirSync(join(src, "sub"), { recursive: true });
    writeFileSync(join(src, "file1.txt"), "hello");
    writeFileSync(join(src, "sub", "file2.txt"), "world");

    copyDirectory(src, dest);

    expect(existsSync(join(dest, "file1.txt"))).toBe(true);
    expect(existsSync(join(dest, "sub", "file2.txt"))).toBe(true);
    expect(readFileSync(join(dest, "file1.txt"), "utf8")).toBe("hello");
    expect(readFileSync(join(dest, "sub", "file2.txt"), "utf8")).toBe("world");
  });

  test("no-ops when source directory does not exist", () => {
    expect(() => { copyDirectory(join(tmpDir, "does-not-exist"), join(tmpDir, "noop-dest")); }).not.toThrow();
  });
});

// ── walkDirectory ────────────────────────────────────────────

describe("walkDirectory", () => {
  test("finds only compressible files (css, js, html, json, svg)", () => {
    const dir = join(tmpDir, "walk-test");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "style.css"), ".a{}");
    writeFileSync(join(dir, "app.js"), "const x=1;");
    writeFileSync(join(dir, "page.html"), "<html></html>");
    writeFileSync(join(dir, "data.json"), "{}");
    writeFileSync(join(dir, "icon.svg"), "<svg></svg>");
    writeFileSync(join(dir, "image.png"), "binary");
    writeFileSync(join(dir, "readme.md"), "# Readme");
    writeFileSync(join(dir, "script.ts"), "// not compressible at build time");

    const files = walkDirectory(dir).map((f) => f.replace(dir + "/", ""));

    expect(files).toContain("style.css");
    expect(files).toContain("app.js");
    expect(files).toContain("page.html");
    expect(files).toContain("data.json");
    expect(files).toContain("icon.svg");
    expect(files).not.toContain("image.png");
    expect(files).not.toContain("readme.md");
    expect(files).not.toContain("script.ts");
  });

  test("walks subdirectories", () => {
    const dir = join(tmpDir, "walk-sub");
    mkdirSync(join(dir, "nest"), { recursive: true });
    writeFileSync(join(dir, "nest", "deep.css"), ".x{}");

    const files = walkDirectory(dir);
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files.some((f) => f.endsWith("deep.css"))).toBe(true);
  });

  test("returns empty array for empty directory", () => {
    const dir = join(tmpDir, "walk-empty");
    mkdirSync(dir, { recursive: true });
    const files = walkDirectory(dir);
    expect(files).toEqual([]);
  });
});

// ── compressFile ─────────────────────────────────────────────

describe("compressFile", () => {
  test("creates .gz, .zst, and .br files for HTML", () => {
    const dir = join(tmpDir, "compress-html");
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, "index.html");
    writeFileSync(filePath, "<div>Hello World</div>");

    compressFile(filePath);

    expect(existsSync(filePath + ".gz")).toBe(true);
    expect(existsSync(filePath + ".zst")).toBe(true);
    expect(existsSync(filePath + ".br")).toBe(true);

    // Compressed files should be smaller than uncompressed (minified first)
    // Or at least exist with content
    const gzSize = readFileSync(filePath + ".gz").length;
    const brSize = readFileSync(filePath + ".br").length;
    expect(gzSize).toBeGreaterThan(0);
    expect(brSize).toBeGreaterThan(0);
  });

  test("creates compressed files for CSS", () => {
    const dir = join(tmpDir, "compress-css");
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, "style.css");
    writeFileSync(filePath, "body { margin: 0; padding: 0; }");

    compressFile(filePath);

    expect(existsSync(filePath + ".gz")).toBe(true);
    expect(existsSync(filePath + ".zst")).toBe(true);
    expect(existsSync(filePath + ".br")).toBe(true);
  });

  test("creates compressed files for JS", () => {
    const dir = join(tmpDir, "compress-js");
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, "bundle.js");
    writeFileSync(filePath, "const x = function() { return 1; }");

    compressFile(filePath);

    expect(existsSync(filePath + ".gz")).toBe(true);
    expect(existsSync(filePath + ".zst")).toBe(true);
    expect(existsSync(filePath + ".br")).toBe(true);
  });
});

// ── compressAssets ───────────────────────────────────────────

describe("compressAssets", () => {
  test("compresses all compressible files in a directory", () => {
    const src = join(tmpDir, "assets-src");
    const dest = join(tmpDir, "assets-dest");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "a.css"), ".a{}");
    writeFileSync(join(src, "b.js"), "var x=1;");

    const result = compressAssets(src, dest);

    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(result.compressed).toBe(result.total);
    expect(result.originalBytes).toBeGreaterThan(0);
    expect(result.compressedBytes.gz).toBeGreaterThan(0);
    expect(result.compressedBytes.br).toBeGreaterThan(0);

    expect(existsSync(join(dest, "a.css.gz"))).toBe(true);
    expect(existsSync(join(dest, "b.js.gz"))).toBe(true);
  });
});
