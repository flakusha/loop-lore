// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { repetitionRate, repetitionStats, tokenize, trigramCounts, } from "./repetition-rate";

describe("tokenize", () => {
  test("lowercases and splits on punctuation", () => {
    expect(tokenize("Hello, World!",),).toEqual(["hello", "world",],);
  });

  test("returns no tokens for empty or symbol-only text", () => {
    expect(tokenize("",),).toEqual([],);
    expect(tokenize("... !!!",),).toEqual([],);
  });

  test("keeps digits inside tokens", () => {
    expect(tokenize("roll 20 now",),).toEqual(["roll", "20", "now",],);
  });
});

describe("trigramCounts", () => {
  test("counts every overlapping trigram window", () => {
    const counts = trigramCounts("a b c a b c a b c",);
    expect(counts.get("a b c",),).toBe(3,);
    expect(counts.get("b c a",),).toBe(2,);
    expect(counts.get("c a b",),).toBe(2,);
    expect(counts.size,).toBe(3,);
  });

  test("has no trigrams for fewer than three tokens", () => {
    expect(trigramCounts("a b",).size,).toBe(0,);
  });
});

describe("repetitionStats", () => {
  test("counts repeated occurrences of a trigram seen more than twice", () => {
    const stats = repetitionStats("a b c a b c a b c",);
    expect(stats.totalTrigrams,).toBe(7,);
    expect(stats.repeatedTrigrams,).toBe(3,);
    expect(stats.rate,).toBeCloseTo(3 / 7, 10,);
  });

  test("treats exactly two occurrences as not repeated", () => {
    const stats = repetitionStats("a b c a b c",);
    expect(stats.totalTrigrams,).toBe(4,);
    expect(stats.repeatedTrigrams,).toBe(0,);
    expect(stats.rate,).toBe(0,);
  });

  test("is zero for text with fewer than three words", () => {
    expect(repetitionStats("hello world",).rate,).toBe(0,);
    expect(repetitionStats("",).rate,).toBe(0,);
    expect(repetitionStats("",).totalTrigrams,).toBe(0,);
  });

  test("is zero for non-repetitive text", () => {
    const stats = repetitionStats("the quick brown fox jumps over the lazy dog",);
    expect(stats.totalTrigrams,).toBe(7,);
    expect(stats.repeatedTrigrams,).toBe(0,);
    expect(stats.rate,).toBe(0,);
  });

  test("is one when every trigram is repeated", () => {
    const stats = repetitionStats("a a a a a",);
    expect(stats.totalTrigrams,).toBe(3,);
    expect(stats.repeatedTrigrams,).toBe(3,);
    expect(stats.rate,).toBe(1,);
  });

  test("is case insensitive and ignores punctuation", () => {
    const stats = repetitionStats("Hello, world! Hello, world! Hello, world!",);
    expect(stats.totalTrigrams,).toBe(4,);
    expect(stats.repeatedTrigrams,).toBe(0,);
  });
});

describe("repetitionRate", () => {
  test("returns the occurrence-weighted repetition share", () => {
    expect(repetitionRate("a b c a b c a b c",),).toBeCloseTo(3 / 7, 10,);
  });

  test("returns 0 for empty text", () => {
    expect(repetitionRate("",),).toBe(0,);
  });
});
