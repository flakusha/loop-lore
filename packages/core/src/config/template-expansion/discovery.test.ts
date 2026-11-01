// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/template-expansion/discovery.test.ts — Edge cases for discovery.ts
// (findExpansionFile search order, parseExpansionFile format handling).

import { afterAll, describe, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { findExpansionFile, parseExpansionFile, } from "./discovery";
import type { ExpansionConfig, } from "./types";

// ── Helpers ─────────────────────────────────────────────────

const dirs: string[] = [];

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ll-discovery-",),);
  dirs.push(dir,);
  return dir;
}

afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true, },);
  }
},);

function writeExpansion(
  cwd: string,
  location: string,
  filename: string,
  content: string,
): string {
  const dir = join(cwd, location,);
  mkdirSync(dir, { recursive: true, },);
  const filePath = join(dir, filename,);
  writeFileSync(filePath, content,);
  return filePath;
}

// ── findExpansionFile ───────────────────────────────────────

describe("findExpansionFile", () => {
  test("returns null when no search dir exists", () => {
    expect(findExpansionFile(tmpDir(),),).toBeNull();
  });

  test("finds expansion.yaml in configs/templates", () => {
    const cwd = tmpDir();
    const filePath = writeExpansion(cwd, "configs/templates", "expansion.yaml", "merge: extend\n",);
    expect(findExpansionFile(cwd,),).toBe(filePath,);
  });

  test("finds expansion.yml in templates (fallback dir)", () => {
    const cwd = tmpDir();
    const filePath = writeExpansion(cwd, "templates", "expansion.yml", "merge: extend\n",);
    expect(findExpansionFile(cwd,),).toBe(filePath,);
  });

  test("configs/templates wins over templates when both exist", () => {
    const cwd = tmpDir();
    const primary = writeExpansion(cwd, "configs/templates", "expansion.yaml", "merge: extend\n",);
    writeExpansion(cwd, "templates", "expansion.yaml", "merge: extend\n",);
    expect(findExpansionFile(cwd,),).toBe(primary,);
  });

  test("yaml beats yml beats toml within one dir", () => {
    const cwd = tmpDir();
    const yamlPath = writeExpansion(cwd, "configs/templates", "expansion.yaml", "merge: extend\n",);
    writeExpansion(cwd, "configs/templates", "expansion.yml", "merge: extend\n",);
    writeExpansion(cwd, "configs/templates", "expansion.toml", 'merge = "extend"\n',);
    expect(findExpansionFile(cwd,),).toBe(yamlPath,);
  });

  test("yml beats toml when yaml is absent", () => {
    const cwd = tmpDir();
    const ymlPath = writeExpansion(cwd, "configs/templates", "expansion.yml", "merge: extend\n",);
    writeExpansion(cwd, "configs/templates", "expansion.toml", 'merge = "extend"\n',);
    expect(findExpansionFile(cwd,),).toBe(ymlPath,);
  });

  test("returns null when the dir exists but has no expansion files", () => {
    const cwd = tmpDir();
    writeExpansion(cwd, "configs/templates", "unrelated.txt", "nope\n",);
    expect(findExpansionFile(cwd,),).toBeNull();
  });

  test("ignores expansion files at the cwd root (not a search dir)", () => {
    const cwd = tmpDir();
    writeExpansion(cwd, "", "expansion.yaml", "merge: extend\n",);
    expect(findExpansionFile(cwd,),).toBeNull();
  });

  test("ignores expansion files in non-search subdirectories", () => {
    const cwd = tmpDir();
    writeExpansion(cwd, "other/templates", "expansion.yaml", "merge: extend\n",);
    expect(findExpansionFile(cwd,),).toBeNull();
  });

  test("skips a configs/templates path that is a file, not a directory", () => {
    const cwd = tmpDir();
    mkdirSync(join(cwd, "configs",), { recursive: true, },);
    writeFileSync(join(cwd, "configs", "templates",), "not a dir\n",);
    expect(findExpansionFile(cwd,),).toBeNull();
  });
});

// ── parseExpansionFile ──────────────────────────────────────

describe("parseExpansionFile", () => {
  test("parses YAML content", () => {
    const cwd = tmpDir();
    const filePath = writeExpansion(
      cwd,
      "configs/templates",
      "expansion.yaml",
      [
        "merge: extend",
        'keywords: ["k1"]',
        "",
      ].join("\n",),
    );

    expect(parseExpansionFile(filePath,),).toEqual({ merge: "extend", keywords: ["k1",], },);
  });

  test("parses .yml as YAML", () => {
    const cwd = tmpDir();
    const filePath = writeExpansion(cwd, "templates", "expansion.yml", "merge: override\n",);
    expect(parseExpansionFile(filePath,),).toEqual({ merge: "override", },);
  });

  test("parses .toml as TOML (not YAML)", () => {
    const cwd = tmpDir();
    const filePath = writeExpansion(
      cwd,
      "configs/templates",
      "expansion.toml",
      [
        'merge = "extend"',
        "[emotions.calm]",
        'asset = "calm.png"',
        "",
      ].join("\n",),
    );

    expect(parseExpansionFile(filePath,),).toEqual({
      merge: "extend",
      emotions: { calm: { asset: "calm.png", }, },
    } as unknown as ExpansionConfig,);
  });

  test("unknown extension falls back to the YAML parser", () => {
    const cwd = tmpDir();
    const filePath = writeExpansion(cwd, "configs/templates", "expansion.json", "merge: extend\n",);
    expect(parseExpansionFile(filePath,),).toEqual({ merge: "extend", },);
  });

  test("throws for a missing file", () => {
    const cwd = tmpDir();
    expect(() => parseExpansionFile(join(cwd, "configs", "templates", "expansion.yaml",),)).toThrow(/ENOENT/,);
  });

  test("throws for malformed YAML", () => {
    const cwd = tmpDir();
    const filePath = writeExpansion(cwd, "configs/templates", "expansion.yaml", "emotions: [unterminated\n",);
    expect(() => parseExpansionFile(filePath,)).toThrow();
  });

  test("returns null for an empty YAML file", () => {
    const cwd = tmpDir();
    const filePath = writeExpansion(cwd, "configs/templates", "expansion.yaml", "",);
    expect(parseExpansionFile(filePath,),).toBeNull();
  });

  test("returns an empty object for an empty TOML file", () => {
    const cwd = tmpDir();
    const filePath = writeExpansion(cwd, "configs/templates", "expansion.toml", "",);
    expect(parseExpansionFile(filePath,),).toEqual({} as unknown as ExpansionConfig,);
  });
});
