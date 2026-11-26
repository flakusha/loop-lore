// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { PATH_KEY_PATTERN, walkStringLeaves, } from "./string-leaves";

describe("walkStringLeaves", () => {
  test("collects every string leaf and flags path-bearing keys", () => {
    const result = walkStringLeaves(
      {
        path: "/repo/notes.txt",
        nested: { target: "../escape.txt", query: "hello", },
      },
      6,
      false,
      false,
    );

    expect(result.leaves,).toEqual(["/repo/notes.txt", "../escape.txt", "hello",],);
    expect(result.truncated,).toBe(false,);
    expect(PATH_KEY_PATTERN.test("target",),).toBe(true,);
    expect(PATH_KEY_PATTERN.test("query",),).toBe(false,);
  });

  test("pathKeyOnly drops leaves outside path-bearing keys", () => {
    const result = walkStringLeaves({ target: "a.txt", content: "ignore me", }, 6, false, true,);
    expect(result.leaves,).toEqual(["a.txt",],);
  });

  test("marks truncation instead of silently skipping deep leaves", () => {
    const result = walkStringLeaves({ a: { b: { c: "deep", }, }, }, 1, false, false,);
    expect(result.leaves,).toEqual([],);
    expect(result.truncated,).toBe(true,);
  });
});
