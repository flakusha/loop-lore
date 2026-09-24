/**
 * Tests for smart-regen style validation (src/generation/smart-regen.ts).
 * Pure module — no I/O. `buildStylePrompt` (removed 2026-09 when no caller
 * consumed it) is back as the payload-side helper: the regenerate route
 * drives the variant generation and appends `buildStylePrompt(style)` to
 * the system message via `appendStylePrompt`.
 */
import { describe, expect, test, } from "bun:test";
import { isValidRegenStyle, VALID_REGEN_STYLES, } from "./smart-regen";

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
