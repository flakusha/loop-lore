// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Contract tests for config filesystem lookup helpers (tmpdir-backed). */
import { afterEach, describe, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import path from "node:path";
import { findConfigFile, firstExisting, isNetworkFilesystem, } from "./fs";

const cleanup: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ll-config-fs-",),);
  cleanup.push(dir,);
  return dir;
}

afterEach(() => {
  for (const dir of cleanup.splice(0,)) {
    rmSync(dir, { recursive: true, force: true, },);
  }
},);

describe("isNetworkFilesystem", () => {
  test("local tmp paths are not network filesystems", () => {
    expect(isNetworkFilesystem(tempRoot(),),).toBe(false,);
  });

  test("known network mount prefixes are detected", () => {
    expect(isNetworkFilesystem("/net/server/share/config",),).toBe(true,);
  });
});

describe("firstExisting", () => {
  test("returns the first path that exists, else null", () => {
    const dir = tempRoot();
    const present = path.join(dir, "a.yaml",);
    writeFileSync(present, "server: {}\n",);
    const missing = path.join(dir, "missing.yaml",);

    expect(firstExisting([missing, present,],),).toBe(present,);
    expect(firstExisting([missing, path.join(dir, "b.yaml",),],),).toBeNull();
    expect(firstExisting([],),).toBeNull();
  });
});

describe("findConfigFile", () => {
  test("finds a config at the cwd root and reports its extension", () => {
    const dir = tempRoot();
    const configPath = path.join(dir, "loop-lore.yaml",);
    writeFileSync(configPath, "server: {}\n",);

    expect(findConfigFile(dir, ["loop-lore.yaml",],),).toEqual({ path: configPath, ext: "yaml", },);
  });

  test("falls back to the configs/ subdirectory", () => {
    const dir = tempRoot();
    mkdirSync(path.join(dir, "configs",),);
    const configPath = path.join(dir, "configs", "app.toml",);
    writeFileSync(configPath, "[server]\n",);

    expect(findConfigFile(dir, ["loop-lore.yaml", "app.toml",],),).toEqual({ path: configPath, ext: "toml", },);
  });

  test("returns null when nothing exists", () => {
    expect(findConfigFile(tempRoot(), ["loop-lore.yaml",],),).toBeNull();
  });
});
