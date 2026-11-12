// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/normalizers/shared.test.ts
//
// Unit tests for shared card-field narrowing helpers.

import { describe, expect, it, } from "bun:test";
import {
  cardNumber,
  cardObject,
  cardOptionalText,
  cardText,
  cardTextList,
} from "./shared";

describe("cardText", () => {
  it("passes through real strings", () => {
    expect(cardText("hello",),).toBe("hello",);
    expect(cardText("",),).toBe("",);
  });

  it("falls back to empty string for non-strings", () => {
    expect(cardText(undefined,),).toBe("",);
    expect(cardText(null,),).toBe("",);
    expect(cardText(42,),).toBe("",);
    expect(cardText(["a",],),).toBe("",);
    expect(cardText({ text: "x", },),).toBe("",);
  });
});

describe("cardOptionalText", () => {
  it("passes through real strings", () => {
    expect(cardOptionalText("hi",),).toBe("hi",);
  });

  it("yields undefined for non-strings", () => {
    expect(cardOptionalText(undefined,),).toBeUndefined();
    expect(cardOptionalText(0,),).toBeUndefined();
    expect(cardOptionalText(false,),).toBeUndefined();
  });
});

describe("cardObject", () => {
  it("passes through plain objects", () => {
    const obj = { nested: "payload", };
    expect(cardObject(obj,),).toBe(obj,);
  });

  it("yields undefined for null, arrays, and primitives", () => {
    expect(cardObject(null,),).toBeUndefined();
    expect(cardObject(undefined,),).toBeUndefined();
    expect(cardObject([1, 2,],),).toBeUndefined();
    expect(cardObject("object-ish",),).toBeUndefined();
    expect(cardObject(3,),).toBeUndefined();
  });
});

describe("cardTextList", () => {
  it("passes through arrays of strings", () => {
    expect(cardTextList(["a", "b",],),).toEqual(["a", "b",],);
    expect(cardTextList([],),).toEqual([],);
  });

  it("filters non-string entries out of arrays", () => {
    expect(cardTextList(["keep", 1, null, "also",],),).toEqual(["keep", "also",],);
  });

  it("yields undefined for non-arrays", () => {
    expect(cardTextList(undefined,),).toBeUndefined();
    expect(cardTextList("a,b",),).toBeUndefined();
    expect(cardTextList({ 0: "a", },),).toBeUndefined();
  });
});

describe("cardNumber", () => {
  it("passes through finite numbers", () => {
    expect(cardNumber(3,),).toBe(3,);
    expect(cardNumber(0,),).toBe(0,);
    expect(cardNumber(-1.5,),).toBe(-1.5,);
  });

  it("yields undefined for non-numbers and non-finite numbers", () => {
    expect(cardNumber("3",),).toBeUndefined();
    expect(cardNumber(null,),).toBeUndefined();
    expect(cardNumber(Number.NaN,),).toBeUndefined();
    expect(cardNumber(Number.POSITIVE_INFINITY,),).toBeUndefined();
    expect(cardNumber(Number.NEGATIVE_INFINITY,),).toBeUndefined();
  });
});
