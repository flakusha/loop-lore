// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { compileSafeRegExp, hasSafeShape, MAX_SAFE_PATTERN_LENGTH, } from "./safe-regexp";

describe("compileSafeRegExp", () => {
  test("compiles ordinary patterns", () => {
    const re = compileSafeRegExp("a+b", "i",);
    expect(re).not.toBeNull();
    expect(re!.test("aaab"),).toBe(true);
  });

  test("returns null for empty and over-length patterns", () => {
    expect(compileSafeRegExp("",),).toBeNull();
    expect(compileSafeRegExp("a".repeat(MAX_SAFE_PATTERN_LENGTH + 1,),),).toBeNull();
  });

  test("returns null for syntactically invalid patterns", () => {
    expect(compileSafeRegExp("a(",),).toBeNull();
    expect(compileSafeRegExp("[a",),).toBeNull();
  });

  test("rejects nested-quantifier catastrophic shapes", () => {
    expect(compileSafeRegExp("(a+)+",),).toBeNull();
    expect(compileSafeRegExp("(\\d+)*$",),).toBeNull();
    expect(compileSafeRegExp("(a*b)+c",),).toBeNull();
  });

  test("rejects empty alternation branch under group quantifier", () => {
    expect(compileSafeRegExp("(a|)+b",),).toBeNull();
  });

  test("allows safe groups and alternation", () => {
    expect(compileSafeRegExp("(abc)+",),).not.toBeNull();
    expect(compileSafeRegExp("(cat|dog)s?",),).not.toBeNull();
    expect(compileSafeRegExp("^(?:\\w{3,10})$",),).not.toBeNull();
  });

  test("escaped quantifiers are not treated as nested quantification", () => {
    expect(compileSafeRegExp("(a\\+)+",),).not.toBeNull();
  });
});

describe("hasSafeShape", () => {
  test("flags quantified group with inner quantifier", () => {
    expect(hasSafeShape("(x{2,})+y",),).toBe(false);
  });

  test("accepts unquantified group with inner quantifier", () => {
    expect(hasSafeShape("(a+)",),).toBe(true);
  });
});
