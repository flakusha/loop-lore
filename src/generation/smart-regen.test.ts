/**
 * Tests for smart-regen style validation and prompt building
 * (src/generation/smart-regen.ts). Pure module — no I/O.
 */
import { describe, expect, test, } from "bun:test";
import { buildStylePrompt, isValidRegenStyle, VALID_REGEN_STYLES, } from "./smart-regen";

describe("VALID_REGEN_STYLES", () => {
  test("defines the six expected styles", () => {
    expect(Object.keys(VALID_REGEN_STYLES,),).toEqual([
      "shorter",
      "longer",
      "funnier",
      "darker",
      "formal",
      "casual",
    ],);
  });

  test("each style maps to a non-empty instruction", () => {
    for (const instruction of Object.values(VALID_REGEN_STYLES,)) {
      expect(instruction.length,).toBeGreaterThan(0,);
    }
  });
});

describe("isValidRegenStyle", () => {
  test("accepts every defined style key", () => {
    for (const key of Object.keys(VALID_REGEN_STYLES,)) {
      expect(isValidRegenStyle(key,),).toBe(true,);
    }
  });

  test("rejects unknown string styles", () => {
    expect(isValidRegenStyle("louder",),).toBe(false,);
    expect(isValidRegenStyle("",),).toBe(false,);
  });

  test("rejects non-string values", () => {
    expect(isValidRegenStyle(null,),).toBe(false,);
    expect(isValidRegenStyle(undefined,),).toBe(false,);
    expect(isValidRegenStyle(42,),).toBe(false,);
    expect(isValidRegenStyle({},),).toBe(false,);
  });
});

describe("buildStylePrompt", () => {
  test("returns an empty string for null (plain regen)", () => {
    expect(buildStylePrompt(null,),).toBe("",);
  });

  test("returns a distinct non-empty prompt for each style", () => {
    const outputs = new Set<string>();
    for (const key of Object.keys(VALID_REGEN_STYLES,)) {
      const prompt = buildStylePrompt(key,);
      expect(prompt.length,).toBeGreaterThan(0,);
      outputs.add(prompt,);
    }
    // Every style maps to a distinct instruction
    expect(outputs.size,).toBe(6,);
  });

  test("each style prompt is more verbose than its VALID_REGEN_STYLES one-liner", () => {
    for (const key of Object.keys(VALID_REGEN_STYLES,)) {
      const concise = VALID_REGEN_STYLES[key] ?? "";
      const verbose = buildStylePrompt(key,);
      expect(verbose.length,).toBeGreaterThan(concise.length,);
    }
  });
});
