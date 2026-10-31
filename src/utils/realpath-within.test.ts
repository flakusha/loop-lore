// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the shared nearest-existing-ancestor realpath helper
 * (resolveReal + isWithinReal). Parallel-safe: every test builds its own
 * mkdtemp fixture and removes it in afterEach, on success and failure paths
 * alike (dirs are registered in `created` inside each test's try block).
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

import { isWithinReal, resolveReal, } from "./realpath-within";

const created: string[] = [];

/** Per-test fixture: parent (mkdtemp), root dir inside it, outside file. */
function makeRoot(): { root: string; outside: string } {
  const parent = mkdtempSync(join(tmpdir(), "realpath-within-",),);
  created.push(parent,);
  const root = join(parent, "root",);
  const outside = join(parent, "outside.txt",);
  mkdirSync(root, { recursive: true, },);
  writeFileSync(outside, "x",);
  return { root, outside, };
}

afterEach(() => {
  while (created.length > 0) {
    rmSync(created.pop()!, { recursive: true, force: true, },);
  }
},);

describe("resolveReal", () => {
  test("realpaths an existing path", () => {
    const { root, } = makeRoot();
    writeFileSync(join(root, "file.txt",), "x",);
    expect(resolveReal(join(root, "file.txt",),),).toBe(join(root, "file.txt",),);
  });

  test("resolves a missing final component through the nearest existing ancestor", () => {
    const { root, outside, } = makeRoot();
    symlinkSync(outside, join(root, "link",),);
    // The intermediate dir-symlink IS resolved: the result lands on the
    // real (outside) target with the missing tail re-appended — exactly the
    // property a containment check needs to see.
    expect(resolveReal(join(root, "link", "escape.txt",),),).toBe(join(outside, "escape.txt",),);
  });

  test("resolves a deep not-yet-existing path onto the real root", () => {
    const { root, } = makeRoot();
    expect(resolveReal(join(root, "a", "b", "c.txt",),),).toBe(join(root, "a", "b", "c.txt",),);
  });
});

describe("isWithinReal", () => {
  test("accepts root itself, children, and not-yet-existing paths", () => {
    const { root, } = makeRoot();
    expect(isWithinReal(root, root,),).toBe(true,);
    expect(isWithinReal(root, join(root, "sub", "deep.txt",),),).toBe(true,);
    expect(isWithinReal(root, join(root, "a", "b", "c.txt",),),).toBe(true,);
  });

  test("rejects traversal, absolutes, and prefix-collision siblings", () => {
    const { root, outside, } = makeRoot();
    expect(isWithinReal(root, join(root, "..", "outside.txt",),),).toBe(false,);
    expect(isWithinReal(root, outside,),).toBe(false,);
    expect(isWithinReal(root, "/etc/passwd",),).toBe(false,);
    const sibling = `${root}-evil`;
    writeFileSync(sibling, "x",);
    created.push(`${root}-evil`,);
    expect(isWithinReal(root, sibling,),).toBe(false,);
  });

  test("rejects an intermediate dir-symlink escape with a missing final component", () => {
    const { root, outside, } = makeRoot();
    symlinkSync(outside, join(root, "link",),);
    expect(isWithinReal(root, join(root, "link", "escape.txt",),),).toBe(false,);
  });

  test("accepts a symlink inside the root with a missing final component", () => {
    const { root, } = makeRoot();
    mkdirSync(join(root, "real-dir",),);
    symlinkSync(join(root, "real-dir",), join(root, "alias",),);
    expect(isWithinReal(root, join(root, "alias", "new.txt",),),).toBe(true,);
  });
});
