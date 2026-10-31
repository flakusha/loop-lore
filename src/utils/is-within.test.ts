// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/utils/is-within.test.ts — containment guard tests (traversal, absolute,
// symlink-escape rejection).
//
// Parallel-safe: every test builds its own mkdtemp fixture under tmpdir and
// afterEach removes everything registered in `created`, on success and
// failure paths alike.

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

import { afterEach, describe, expect, test, } from "bun:test";

import { isWithin, } from "./is-within";

const created: string[] = [];

function makeRoot(): { root: string; outside: string } {
  const parent = mkdtempSync(join(tmpdir(), "iswithin-",),);
  created.push(parent,);
  const root = join(parent, "root",);
  const outside = join(parent, "outside.txt",);
  mkdirSync(root, { recursive: true, },);
  writeFileSync(outside, "x",);
  writeFileSync(join(root, "inside.txt",), "x",);
  return { root, outside, };
}

afterEach(() => {
  while (created.length > 0) {
    rmSync(created.pop()!, { recursive: true, force: true, },);
  }
},);

describe("isWithin", () => {
  test("accepts files and directories under the root", () => {
    const { root, } = makeRoot();
    expect(isWithin(root, join(root, "inside.txt",),),).toBe(true,);
    expect(isWithin(root, join(root, "sub", "deeper.txt",),),).toBe(true,);
    expect(isWithin(root, root,),).toBe(true,);
  });

  test("rejects traversal, siblings, and absolutes outside the root", () => {
    const { root, outside, } = makeRoot();
    expect(isWithin(root, join(root, "..", "outside.txt",),),).toBe(false,);
    expect(isWithin(root, outside,),).toBe(false,);
    expect(isWithin(root, "/etc/passwd",),).toBe(false,);
    expect(isWithin(root, join(root, "inside.txt", "/../../outside.txt",),),).toBe(false,);
  });

  test("rejects prefix-collision paths that are not under the root", () => {
    const parent = mkdtempSync(join(tmpdir(), "iswithin-prefix-",),);
    created.push(parent,);
    const root = join(parent, "root",);
    mkdirSync(root,);
    const sibling = `${root}-evil`;
    writeFileSync(sibling, "x",);
    created.push(sibling,);
    expect(isWithin(root, sibling,),).toBe(false,);
  });

  test("rejects a symlink inside the root that escapes it", () => {
    const { root, outside, } = makeRoot();
    const link = join(root, "escape.txt",);
    symlinkSync(outside, link,);
    expect(isWithin(root, link,),).toBe(false,);
  });

  test("accepts not-yet-existing paths under the root", () => {
    const { root, } = makeRoot();
    expect(isWithin(root, join(root, "new-file.txt",),),).toBe(true,);
  });
});
