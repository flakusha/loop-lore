/**
 * Tests for the content-merge taxonomy (FEA-2026-047).
 *
 * Coverage: the five MergeMode values, isMergeMode narrowing, per-mode
 * instructions, ordinal semantics that keep modes 2/3/5 stable regardless
 * of picker order, and the preview-request classification.
 */
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  baseOrdinal,
  isMergeMode,
  MERGE_MODES,
  MergeMode,
  modeInstruction,
  overlayOrdinal,
  previewRequestFor,
} from "./merge-criteria";

describe("merge-criteria", () => {
  test("exposes exactly the five documented modes", () => {
    expect(MERGE_MODES,).toHaveLength(5,);
    expect(MERGE_MODES,).toContain("combined",);
    expect(MERGE_MODES,).toContain("second-over-first",);
    expect(MERGE_MODES,).toContain("first-over-second",);
    expect(MERGE_MODES,).toContain("fresh-discovery",);
    expect(MERGE_MODES,).toContain("single-plus-glean",);
  });

  describe("isMergeMode", () => {
    test("accepts every documented mode", () => {
      for (const mode of MERGE_MODES) {
        expect(isMergeMode(mode,),).toBe(true,);
      }
    });

    test("rejects unknown or absent values", () => {
      expect(isMergeMode("invalid",),).toBe(false,);
      expect(isMergeMode("",),).toBe(false,);
      expect(isMergeMode(null,),).toBe(false,);
      expect(isMergeMode(undefined,),).toBe(false,);
    });
  });

  describe("modeInstruction", () => {
    test("returns the documented block for each mode", () => {
      expect(modeInstruction(MergeMode.Combined,),).toContain("Weave",);
      expect(modeInstruction(MergeMode.SecondOverFirst,),).toContain("BASE is version A",);
      expect(modeInstruction(MergeMode.FirstOverSecond,),).toContain("BASE is version B",);
      expect(modeInstruction(MergeMode.FreshDiscovery,),).toContain("REJECTED",);
      expect(modeInstruction(MergeMode.SinglePlusGlean,),).toContain("verbatim",);
    });
  });

  describe("ordinal semantics", () => {
    test("second-over-first uses ordinal 0 as base and 1 as overlay", () => {
      expect(baseOrdinal(MergeMode.SecondOverFirst,),).toBe(0,);
      expect(overlayOrdinal(MergeMode.SecondOverFirst,),).toBe(1,);
    });

    test("first-over-second uses ordinal 1 as base and 0 as overlay", () => {
      expect(baseOrdinal(MergeMode.FirstOverSecond,),).toBe(1,);
      expect(overlayOrdinal(MergeMode.FirstOverSecond,),).toBe(0,);
    });

    test("LLM modes have no overlay ordinals", () => {
      for (const mode of [MergeMode.Combined, MergeMode.FreshDiscovery, MergeMode.SinglePlusGlean,]) {
        expect(baseOrdinal(mode,),).toBeNull();
        expect(overlayOrdinal(mode,),).toBeNull();
      }
    });
  });

  describe("previewRequestFor", () => {
    test("classifies the deterministic overlay modes", () => {
      expect(previewRequestFor(MergeMode.SecondOverFirst,),).toEqual({ kind: "overlay", mode: "second-over-first", },);
      expect(previewRequestFor(MergeMode.FirstOverSecond,),).toEqual({ kind: "overlay", mode: "first-over-second", },);
    });

    test("classifies the LLM modes", () => {
      expect(previewRequestFor(MergeMode.Combined,),).toEqual({
        kind: "llm",
        mode: "combined",
        styleHint: undefined,
      },);

      expect(previewRequestFor(MergeMode.FreshDiscovery,),).toEqual({
        kind: "llm",
        mode: "fresh-discovery",
        styleHint: undefined,
      },);

      expect(previewRequestFor(MergeMode.SinglePlusGlean,),).toEqual({
        kind: "llm",
        mode: "single-plus-glean",
        styleHint: undefined,
      },);
    });

    test("carries the style hint through", () => {
      expect(previewRequestFor(MergeMode.Combined, "terse",),).toEqual({
        kind: "llm",
        mode: "combined",
        styleHint: "terse",
      },);
    });
  });
});
