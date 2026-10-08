/**
 * Tests for the deterministic line diff + three-way overlay (FEA-2026-047).
 *
 * Coverage: LCS edit scripts (equal/insert/delete), change-block collapsing,
 * overlay hunk classification (kept/applied/conflict), conflict resolution,
 * changed-line ratio for the mode-5 guard.
 */
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { changeBlocks, diffLines, } from "./merge-diff";
import { applyHunks, changedLineRatio, threeWayOverlay, } from "./merge-overlay";

describe("merge-diff", () => {
  describe("diffLines", () => {
    test("returns a single equal run for identical arrays", () => {
      expect(diffLines(["a", "b", "c",], ["a", "b", "c",],),).toEqual([{ kind: "equal", lines: ["a", "b", "c",], },],);
    });

    test("detects an insertion", () => {
      expect(diffLines(["a", "c",], ["a", "b", "c",],),).toEqual([
        { kind: "equal", lines: ["a",], },
        { kind: "insert", lines: ["b",], },
        { kind: "equal", lines: ["c",], },
      ],);
    });

    test("detects a deletion", () => {
      expect(diffLines(["a", "b", "c",], ["a", "c",],),).toEqual([
        { kind: "equal", lines: ["a",], },
        { kind: "delete", lines: ["b",], },
        { kind: "equal", lines: ["c",], },
      ],);
    });

    test("handles empty inputs", () => {
      expect(diffLines([], [],),).toEqual([],);
      expect(diffLines(["a",], [],),).toEqual([{ kind: "delete", lines: ["a",], },],);
      expect(diffLines([], ["a",],),).toEqual([{ kind: "insert", lines: ["a",], },],);
    });
  });

  describe("changeBlocks", () => {
    test("collapses a replacement into one block", () => {
      expect(changeBlocks(diffLines(["a", "b", "c", "d",], ["a", "X", "Y", "d",],),),).toEqual([
        { start: 1, end: 3, lines: ["X", "Y",], },
      ],);
    });

    test("emits a zero-width block for a pure insertion", () => {
      expect(changeBlocks(diffLines(["a", "c",], ["a", "b", "c",],),),).toEqual([
        { start: 1, end: 1, lines: ["b",], },
      ],);
    });
  });

  describe("threeWayOverlay", () => {
    test("kept when neither side changed", () => {
      expect(threeWayOverlay(["a", "b", "c",], ["a", "b", "c",], ["a", "b", "c",],),).toEqual([
        { status: "kept", base: ["a", "b", "c",], overlay: ["a", "b", "c",], result: ["a", "b", "c",], },
      ],);
    });

    test("applied when only the overlay changed", () => {
      const hunks = threeWayOverlay(["a", "b", "c",], ["a", "b", "c",], ["a", "X", "c",],);
      expect(hunks,).toHaveLength(3,);
      expect(hunks[1],).toEqual({ status: "applied", base: ["b",], overlay: ["X",], result: ["X",], },);
    });

    test("kept when only the base changed", () => {
      const hunks = threeWayOverlay(["a", "b", "c",], ["a", "X", "c",], ["a", "b", "c",],);
      expect(hunks,).toHaveLength(3,);
      expect(hunks[1],).toEqual({ status: "kept", base: ["X",], overlay: ["b",], result: ["X",], },);
    });

    test("conflict when both sides changed differently", () => {
      const hunks = threeWayOverlay(["a", "b", "c",], ["a", "X", "c",], ["a", "Y", "c",],);
      expect(hunks,).toHaveLength(3,);
      expect(hunks[1]!.status,).toBe("conflict",);
      expect(hunks[1]!.result,).toBeNull();
    });

    test("applied when both sides changed identically", () => {
      const hunks = threeWayOverlay(["a", "b", "c",], ["a", "X", "c",], ["a", "X", "c",],);
      expect(hunks[1]!.status,).toBe("applied",);
    });
  });

  describe("applyHunks", () => {
    test("returns null while a conflict is unresolved", () => {
      const hunks = threeWayOverlay(["a", "b", "c",], ["a", "X", "c",], ["a", "Y", "c",],);
      expect(applyHunks(hunks,),).toBeNull();
    });

    test("resolves a conflict to the base side", () => {
      const hunks = threeWayOverlay(["a", "b", "c",], ["a", "X", "c",], ["a", "Y", "c",],);
      expect(applyHunks(hunks, new Map([[1, "base",],],),),).toEqual(["a", "X", "c",],);
    });

    test("resolves a conflict to the overlay side", () => {
      const hunks = threeWayOverlay(["a", "b", "c",], ["a", "X", "c",], ["a", "Y", "c",],);
      expect(applyHunks(hunks, new Map([[1, "overlay",],],),),).toEqual(["a", "Y", "c",],);
    });
  });

  describe("changedLineRatio", () => {
    test("is 0 for identical arrays", () => {
      expect(changedLineRatio(["a", "b",], ["a", "b",],),).toBe(0,);
    });

    test("is 1 for wholly different arrays", () => {
      expect(changedLineRatio(["a", "b",], ["X", "Y",],),).toBe(1,);
    });

    test("is fractional for a one-line edit", () => {
      expect(changedLineRatio(["a", "b", "c", "d",], ["a", "X", "c", "d",],),).toBe(0.5,);
    });
  });
});
