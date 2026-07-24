import { describe, expect, it, } from "bun:test";
import {
  clampTokenCount,
  isValidPreset,
  resolveResponseLength,
} from "./response-length";
import { RESPONSE_LENGTH_DEFAULTS, } from "./types";

describe("clampTokenCount", () => {
  it("returns value within range", () => {
    expect(clampTokenCount(500,),).toBe(500,);
  });

  it("clamps to minimum 50", () => {
    expect(clampTokenCount(0,),).toBe(50,);
    expect(clampTokenCount(-10,),).toBe(50,);
  });

  it("clamps to maximum 2000", () => {
    expect(clampTokenCount(5000,),).toBe(2000,);
  });

  it("rounds to nearest integer", () => {
    expect(clampTokenCount(100.4,),).toBe(100,);
    expect(clampTokenCount(100.6,),).toBe(101,);
  });
});

describe("isValidPreset", () => {
  it("accepts valid presets", () => {
    expect(isValidPreset("short",),).toBe(true,);
    expect(isValidPreset("medium",),).toBe(true,);
    expect(isValidPreset("long",),).toBe(true,);
    expect(isValidPreset("custom",),).toBe(true,);
  });

  it("rejects invalid presets", () => {
    expect(isValidPreset("tiny",),).toBe(false,);
    expect(isValidPreset("huge",),).toBe(false,);
    expect(isValidPreset("",),).toBe(false,);
  });
});

describe("resolveResponseLength", () => {
  it("uses server default when nothing set", () => {
    const result = resolveResponseLength(null, null, null,);
    expect(result.preset,).toBe("medium",);
    expect(result.maxTokens,).toBe(RESPONSE_LENGTH_DEFAULTS.medium,);
  });

  it("chat preset overrides user preset", () => {
    const result = resolveResponseLength("long", null, "short",);
    expect(result.preset,).toBe("long",);
    expect(result.maxTokens,).toBe(RESPONSE_LENGTH_DEFAULTS.long,);
  });

  it("user preset overrides server default", () => {
    const result = resolveResponseLength(null, null, "long",);
    expect(result.preset,).toBe("long",);
    expect(result.maxTokens,).toBe(RESPONSE_LENGTH_DEFAULTS.long,);
  });

  it("handles custom preset with chat custom value", () => {
    const result = resolveResponseLength("custom", 750, null,);
    expect(result.preset,).toBe("custom",);
    expect(result.maxTokens,).toBe(750,);
  });

  it("clamps custom token count", () => {
    const result = resolveResponseLength("custom", 10_000, null,);
    expect(result.maxTokens,).toBe(2000,); // clamped to max
  });

  it("uses default custom value when chat custom is null", () => {
    const result = resolveResponseLength("custom", null, null,);
    expect(result.preset,).toBe("custom",);
    expect(result.maxTokens,).toBe(RESPONSE_LENGTH_DEFAULTS.custom,);
  });
});
