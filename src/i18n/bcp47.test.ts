/**
 * Unit tests for the pragmatic BCP-47 well-formedness + normalization
 * module used at translation-target boundaries.
 *
 * Resource contract: pure functions only — no DB, no files, no ports, no
 * global state.
 */
import { describe, expect, test, } from "bun:test";
import { isWellFormedBcp47, normalizeBcp47Tag, } from "./bcp47";

describe("normalizeBcp47Tag", () => {
  test("canonicalizes case across all subtags", () => {
    expect(normalizeBcp47Tag("en-us",),).toBe("en-US",);
    expect(normalizeBcp47Tag("EN",),).toBe("en",);
    expect(normalizeBcp47Tag("zh-HANS-cn",),).toBe("zh-Hans-CN",);
    expect(normalizeBcp47Tag("de-DE-1996",),).toBe("de-DE-1996",);
  });

  test("is idempotent on canonical input", () => {
    expect(normalizeBcp47Tag("en-US",),).toBe("en-US",);
    expect(normalizeBcp47Tag("pt-BR",),).toBe("pt-BR",);
  });

  test("rejects malformed tags", () => {
    expect(normalizeBcp47Tag("not a locale!",),).toBeNull();
    expect(normalizeBcp47Tag("e",),).toBeNull();
    expect(normalizeBcp47Tag("en-",),).toBeNull();
    expect(normalizeBcp47Tag("en-US-x",),).toBeNull();
    expect(normalizeBcp47Tag("",),).toBeNull();
    expect(normalizeBcp47Tag("   ",),).toBeNull();
  });

  test("accepts unknown-but-well-formed languages", () => {
    expect(normalizeBcp47Tag("xx",),).toBe("xx",);
    expect(normalizeBcp47Tag("tlh",),).toBe("tlh",);
    expect(normalizeBcp47Tag("sq-Latn-AL",),).toBe("sq-Latn-AL",);
  });
});

describe("isWellFormedBcp47", () => {
  test("agrees with normalizeBcp47Tag", () => {
    expect(isWellFormedBcp47("en-us",),).toBe(true,);
    expect(isWellFormedBcp47("zzz",),).toBe(true,);
    expect(isWellFormedBcp47("klingon!",),).toBe(false,);
  });
});
