// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { applyProfanityWritePolicy, } from "./write-policy";

describe("profanity write policy", () => {
  const raw = "you are fuck amazing";

  test("enabled censors stored text and still reports raw profanity", () => {
    const result = applyProfanityWritePolicy(true, raw,);
    expect(result.text,).toMatch(/^you are \*+ amazing$/,);
    expect(result.hasProfanity,).toBe(true,);
  });

  test("disabled stores raw text and still reports the raw verdict", () => {
    const result = applyProfanityWritePolicy(false, raw,);
    expect(result.text,).toBe(raw,);
    expect(result.hasProfanity,).toBe(true,);
  });

  test("clean text is unchanged under either setting", () => {
    for (const enabled of [true, false,]) {
      const result = applyProfanityWritePolicy(enabled, "hello world",);
      expect(result.text,).toBe("hello world",);
      expect(result.hasProfanity,).toBe(false,);
    }
  });
});
