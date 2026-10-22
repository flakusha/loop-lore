// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Contract tests for /create entity quality clamping + validation helpers. */
import { describe, expect, test, } from "bun:test";
import {
  clampInt,
  clampNonNegativeInt,
  isValidLorePosition,
  MAX_KEY_LENGTH,
  MAX_KEYS,
  REQUIRED_FIELDS,
} from "./entity-creation-types";

describe("quality constants", () => {
  test("keyword budget is 5 keys of up to 100 chars", () => {
    expect(MAX_KEYS,).toBe(5,);
    expect(MAX_KEY_LENGTH,).toBe(100,);
  });

  test("every entity kind requires name; character also requires personality + appearance", () => {
    for (const fields of Object.values(REQUIRED_FIELDS,)) {
      expect(fields,).toContain("name",);
    }

    expect(REQUIRED_FIELDS.character,).toContain("personality",);
    expect(REQUIRED_FIELDS.character,).toContain("appearance",);
  });
});

describe("clampNonNegativeInt", () => {
  test("floors and clamps negatives to zero", () => {
    expect(clampNonNegativeInt(3.9,),).toBe(3,);
    expect(clampNonNegativeInt(-2,),).toBe(0,);
    expect(clampNonNegativeInt(-0.5,),).toBe(0,);
  });

  test("accepts numeric strings", () => {
    expect(clampNonNegativeInt("7",),).toBe(7,);
    expect(clampNonNegativeInt(" 4.5 ",),).toBe(4,);
    expect(clampNonNegativeInt("-9",),).toBe(0,);
  });

  test("returns undefined for non-numeric input", () => {
    expect(clampNonNegativeInt("abc",),).toBeUndefined();
    expect(clampNonNegativeInt(null,),).toBeUndefined();
    expect(clampNonNegativeInt(undefined,),).toBeUndefined();
    expect(clampNonNegativeInt(Infinity,),).toBeUndefined();
    expect(clampNonNegativeInt(NaN,),).toBeUndefined();
    expect(clampNonNegativeInt([],),).toBeUndefined();
  });
});

describe("clampInt", () => {
  test("clamps into [min, max] with flooring", () => {
    expect(clampInt(5, 1, 10,),).toBe(5,);
    expect(clampInt(0, 1, 10,),).toBe(1,);
    expect(clampInt(99, 1, 10,),).toBe(10,);
    expect(clampInt(4.7, 1, 10,),).toBe(4,);
  });

  test("accepts numeric strings", () => {
    expect(clampInt("5", 1, 10,),).toBe(5,);
    expect(clampInt("-20", 1, 10,),).toBe(1,);
  });

  test("returns undefined for non-numeric input", () => {
    expect(clampInt("x", 1, 10,),).toBeUndefined();
    expect(clampInt(NaN, 1, 10,),).toBeUndefined();
    expect(clampInt({}, 1, 10,),).toBeUndefined();
  });
});

describe("isValidLorePosition", () => {
  test("accepts every LorePosition enum member", () => {
    expect(isValidLorePosition("before_char",),).toBe(true,);
    expect(isValidLorePosition("after_char",),).toBe(true,);
    expect(isValidLorePosition("in_char",),).toBe(true,);
  });

  test("rejects unknown positions", () => {
    expect(isValidLorePosition("before",),).toBe(false,);
    expect(isValidLorePosition("World",),).toBe(false,);
    expect(isValidLorePosition("",),).toBe(false,);
  });
});
