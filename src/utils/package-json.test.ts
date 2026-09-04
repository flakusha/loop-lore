// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, describe, expect, test, } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { readPackageJson, readPackageJsonOrNull, setPackageJsonVersion, } from "./package-json";

/**
 * Tests for the asymmetric write-guard on `package.json`:
 *
 * - READ path may return `null` for missing/unparseable files.
 * - WRITE path MUST throw — silently overwriting a real `package.json`
 *   with `{ "version": "..." }` is data loss. This was a regression shipped
 *   in commit `5eb777fb`. The tests below prevent it from recurring.
 */

let sandboxDir: string | null = null;

describe("readPackageJson", () => {
  afterAll(() => {
    if (sandboxDir !== null) { rmSync(sandboxDir, { recursive: true, force: true, },); }
  },);

  test("returns ok:true on a well-formed file", () => {
    sandboxDir = mkdtempSync(join(tmpdir(), "pkgjson-read-",),);
    const path = join(sandboxDir, "package.json",);
    writeFileSync(path, JSON.stringify({ name: "x", version: "1.0.0", dependencies: { a: "*", }, },),);
    const result = readPackageJson(path,);
    expect(result.ok,).toBe(true,);
    if (result.ok) {
      expect(result.value.name,).toBe("x",);
      expect(result.value.version,).toBe("1.0.0",);
      expect(result.value.dependencies,).toEqual({ a: "*", },);
    }
  });

  test("returns ok:false on a missing file (NOT silent {} — preserves regression class)", () => {
    sandboxDir = mkdtempSync(join(tmpdir(), "pkgjson-read-",),);
    const missing = join(sandboxDir, "absent.json",);
    const result = readPackageJson(missing,);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect((result.error as NodeJS.ErrnoException).code,).toBe("ENOENT",);
    }
  });

  test("returns ok:false on malformed JSON", () => {
    sandboxDir = mkdtempSync(join(tmpdir(), "pkgjson-read-",),);
    const path = join(sandboxDir, "package.json",);
    writeFileSync(path, "{ this is not valid json",);
    const result = readPackageJson(path,);
    expect(result.ok,).toBe(false,);
  });
});

describe("readPackageJsonOrNull", () => {
  test("returns the parsed object on success", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkgjson-readonly-",),);
    const path = join(dir, "package.json",);
    writeFileSync(path, JSON.stringify({ name: "y", version: "2.0.0", },),);
    const result = readPackageJsonOrNull(path,);
    expect(result,).not.toBeNull();
    expect(result?.name,).toBe("y",);
    rmSync(dir, { recursive: true, force: true, },);
  });

  test("returns null on missing file", () => {
    expect(readPackageJsonOrNull("/this/does/not/exist.json",),).toBeNull();
  });

  test("returns null on malformed JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkgjson-readonly-",),);
    const path = join(dir, "package.json",);
    writeFileSync(path, "not json at all",);
    expect(readPackageJsonOrNull(path,),).toBeNull();
    rmSync(dir, { recursive: true, force: true, },);
  });
});

describe("setPackageJsonVersion", () => {
  afterAll(() => {
    if (sandboxDir !== null) { rmSync(sandboxDir, { recursive: true, force: true, },); }
  },);

  test("regression: throws on missing package.json (must NOT silently create)", () => {
    sandboxDir = mkdtempSync(join(tmpdir(), "pkgjson-write-",),);
    const missing = join(sandboxDir, "package.json",);
    expect(() => setPackageJsonVersion(missing, "9.9.9",)).toThrow(/Missing package\.json/u,);
    expect(() => readFileSync(missing, "utf-8",)).toThrow(/ENOENT/u,);
  });

  test("regression: throws on malformed package.json (must NOT silently overwrite)", () => {
    sandboxDir = mkdtempSync(join(tmpdir(), "pkgjson-write-",),);
    const path = join(sandboxDir, "package.json",);
    const corrupt = "{ this is not valid json";
    writeFileSync(path, corrupt,);
    expect(() => setPackageJsonVersion(path, "2.0.0",)).toThrow(/Cannot read package\.json/u,);
    // Confirm file was NOT silently rewritten as `{ "version": "2.0.0" }`.
    const after = readFileSync(path, "utf-8",);
    expect(after,).toBe(corrupt,);
    expect(after,).not.toContain("2.0.0",);
  });

  test("writes the new version, preserving every other field", () => {
    sandboxDir = mkdtempSync(join(tmpdir(), "pkgjson-write-",),);
    const path = join(sandboxDir, "package.json",);
    const original = {
      name: "preserved",
      version: "1.0.0",
      dependencies: { keep: "*", },
      scripts: { test: "bun test", },
      license: "LGPL-3.0-or-later",
    };
    writeFileSync(path, JSON.stringify(original,),);
    setPackageJsonVersion(path, "2.0.0",);
    const after = JSON.parse(readFileSync(path, "utf-8",),);
    expect(after.version,).toBe("2.0.0",);
    expect(after.name,).toBe("preserved",);
    expect(after.dependencies,).toEqual({ keep: "*", },);
    expect(after.scripts,).toEqual({ test: "bun test", },);
    expect(after.license,).toBe("LGPL-3.0-or-later",);
  });
});
