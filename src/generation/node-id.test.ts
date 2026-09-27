// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { allocateNodeId, } from "./node-id";

describe("allocateNodeId", () => {
  test("returns 1 for an empty graph", () => {
    expect(allocateNodeId([],),).toBe("1",);
  });

  test("skips ids already in use", () => {
    expect(allocateNodeId(["1", "2", "3",],),).toBe("4",);
  });

  test("reads the leading integer run of a grouped id", () => {
    // Number("60:45") is NaN, which is what made the previous arithmetic
    // collapse every node of such a graph onto a single "NaN" key.
    expect(allocateNodeId(["1", "60:45",],),).toBe("61",);
  });

  test("never returns NaN, whatever the id shape", () => {
    for (const reserved of [[], ["abc",], ["60:45",], ["NaN",], ["",], ["-3",], ["1.5",],]) {
      const id = allocateNodeId(reserved,);
      expect(id,).not.toBe("NaN",);
      expect(Number.isFinite(Number(id,),),).toBe(true,);
    }
  });

  test("ignores ids with no leading integer", () => {
    expect(allocateNodeId(["abc", "def",],),).toBe("1",);
  });

  test("escapes a range the caller already owns", () => {
    expect(allocateNodeId(["1", "100", "101",],),).toBe("102",);
  });

  test("treats 0 as unallocated", () => {
    expect(allocateNodeId(["0",],),).toBe("1",);
  });

  test("result is never already reserved, for any input", () => {
    const cases = [[], ["1",], ["60:45",], ["1", "100", "101",], ["0", "abc", "NaN",],];
    for (const reserved of cases) {
      const id = allocateNodeId(reserved,);
      expect(reserved.includes(id,),).toBe(false,);
    }
  });
});
