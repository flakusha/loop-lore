// src/characters/validator/fields.test.ts
//
// Edge-case tests for field-level validators.
// Trust boundary: empty/whitespace required strings, non-string values,
// length and item-count boundaries, mode-dependent severity, and
// growth-mode/llm-assist toggle validation.

import { describe, expect, it, } from "bun:test";

import type {
  CanonicalCharacter,
  ValidationError,
  ValidationWarning,
} from "../spec";
import { GrowthMode, } from "../spec/growth";
import {
  validateArrayConstraints,
  validateGrowthFields,
  validateOptionalFields,
  validateRequiredString,
  validateStringLength,
} from "./fields";

const baseCharacter: CanonicalCharacter = {
  name: "Test",
  description: "Test desc",
  personality: "Test personality",
  appearance: "Test appearance",
  default_outfit: "travel-gear",
  outfits: [
    { id: "travel-gear", name: "Travel Gear", descriptor: "Sturdy traveling clothes", },
  ],
};

function charWith(overrides: Record<string, unknown>,): CanonicalCharacter {
  return { ...baseCharacter, ...overrides, } as unknown as CanonicalCharacter;
}

function fresh(): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  return { errors: [], warnings: [], };
}

describe("validateRequiredString", () => {
  it("accepts a non-empty string", () => {
    const { errors, } = fresh();
    validateRequiredString(baseCharacter, "name", errors,);
    expect(errors,).toHaveLength(0,);
  });

  it("rejects an empty string", () => {
    const { errors, } = fresh();
    validateRequiredString(charWith({ name: "", },), "name", errors,);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.code,).toBe("REQUIRED",);
  });

  it("rejects a whitespace-only string", () => {
    const { errors, } = fresh();
    validateRequiredString(charWith({ name: "   \t\n  ", },), "name", errors,);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.code,).toBe("REQUIRED",);
    expect(errors[0]?.value,).toBe("   \t\n  ",);
  });

  it("rejects a non-string value", () => {
    const { errors, } = fresh();
    validateRequiredString(charWith({ name: 42, },), "name", errors,);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.code,).toBe("REQUIRED",);
    expect(errors[0]?.value,).toBe(42,);
  });

  it("rejects undefined", () => {
    const { errors, } = fresh();
    validateRequiredString(charWith({ name: undefined, },), "name", errors,);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.code,).toBe("REQUIRED",);
  });

  it("rejects null", () => {
    const { errors, } = fresh();
    validateRequiredString(charWith({ name: null, },), "name", errors,);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.code,).toBe("REQUIRED",);
  });

  it("reports field, code, message, and value in the error", () => {
    const { errors, } = fresh();
    validateRequiredString(charWith({ description: "", },), "description", errors,);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("description",);
    expect(errors[0]?.code,).toBe("REQUIRED",);
    expect(errors[0]?.message,).toContain("description",);
    expect(errors[0]?.message,).toContain("non-empty string",);
    expect(errors[0]?.value,).toBe("",);
  });

  it("validates other required fields independently", () => {
    const { errors, } = fresh();
    validateRequiredString(charWith({ personality: "", },), "personality", errors,);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("personality",);
  });
});

describe("validateStringLength", () => {
  it("ignores non-string values", () => {
    const { errors, warnings, } = fresh();
    validateStringLength(charWith({ name: 123, },), "name", errors, warnings, "strict",);
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(0,);
  });

  it("ignores fields without constraints", () => {
    const { errors, warnings, } = fresh();
    validateStringLength(charWith({ lorebook: "x".repeat(100,), },), "lorebook", errors, warnings, "strict",);
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(0,);
  });

  it("ignores constrained fields without a maxLength", () => {
    const { errors, warnings, } = fresh();
    // nsfw_categories has maxItems but no maxLength; a string value is not a string length check.
    validateStringLength(
      charWith({ nsfw_categories: "x".repeat(1000,), },),
      "nsfw_categories",
      errors,
      warnings,
      "strict",
    );

    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(0,);
  });

  it("accepts a value at the maxLength boundary", () => {
    const { errors, warnings, } = fresh();
    validateStringLength(charWith({ name: "x".repeat(64,), },), "name", errors, warnings, "strict",);
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(0,);
  });

  it("errors when value exceeds maxLength in strict mode", () => {
    const { errors, warnings, } = fresh();
    validateStringLength(charWith({ name: "x".repeat(65,), },), "name", errors, warnings, "strict",);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.code,).toBe("MAX_LENGTH_EXCEEDED",);
    expect(errors[0]?.field,).toBe("name",);
    expect(errors[0]?.message,).toContain("64",);
    expect(warnings,).toHaveLength(0,);
  });

  it("warns when value exceeds maxLength in relaxed mode", () => {
    const { errors, warnings, } = fresh();
    validateStringLength(charWith({ name: "x".repeat(65,), },), "name", errors, warnings, "relaxed",);
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(1,);
    expect(warnings[0]?.code,).toBe("MAX_LENGTH_EXCEEDED",);
  });

  it("uses 'maximum' wording in strict and 'recommended' in relaxed", () => {
    const strict = fresh();
    validateStringLength(
      charWith({ creator: "x".repeat(65,), },),
      "creator",
      strict.errors,
      strict.warnings,
      "strict",
    );

    expect(strict.errors[0]?.message,).toContain("maximum",);
    expect(strict.errors[0]?.message,).not.toContain("recommended",);

    const relaxed = fresh();
    validateStringLength(
      charWith({ creator: "x".repeat(65,), },),
      "creator",
      relaxed.errors,
      relaxed.warnings,
      "relaxed",
    );

    expect(relaxed.warnings[0]?.message,).toContain("recommended",);
  });

  it("enforces per-field caps (character_version max 16)", () => {
    const { errors, warnings, } = fresh();
    validateStringLength(
      charWith({ character_version: "1.2.3.4.5.6.7.8.9", },),
      "character_version",
      errors,
      warnings,
      "strict",
    );

    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.message,).toContain("16",);
  });

  it("accepts a value one character under the cap", () => {
    const { errors, warnings, } = fresh();
    validateStringLength(
      charWith({ character_version: "x".repeat(15,), },),
      "character_version",
      errors,
      warnings,
      "strict",
    );

    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(0,);
  });
});

describe("validateArrayConstraints", () => {
  it("ignores non-array values", () => {
    const { errors, warnings, } = fresh();
    validateArrayConstraints(charWith({ tags: "not-an-array", },), "tags", errors, warnings, "strict",);
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(0,);
  });

  it("ignores fields without constraints", () => {
    const { errors, warnings, } = fresh();
    validateArrayConstraints(charWith({ lorebook: [1, 2, 3,], },), "lorebook", errors, warnings, "strict",);
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(0,);
  });

  it("accepts an array at the maxItems boundary", () => {
    const { errors, warnings, } = fresh();
    validateArrayConstraints(charWith({ tags: Array(20,).fill("t",), },), "tags", errors, warnings, "strict",);
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(0,);
  });

  it("errors when array exceeds maxItems in strict mode", () => {
    const { errors, warnings, } = fresh();
    validateArrayConstraints(charWith({ tags: Array(21,).fill("t",), },), "tags", errors, warnings, "strict",);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.code,).toBe("MAX_ITEMS_EXCEEDED",);
    expect(errors[0]?.message,).toContain("20",);
    expect(warnings,).toHaveLength(0,);
  });

  it("warns when array exceeds maxItems in relaxed mode", () => {
    const { errors, warnings, } = fresh();
    validateArrayConstraints(charWith({ tags: Array(21,).fill("t",), },), "tags", errors, warnings, "relaxed",);
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(1,);
    expect(warnings[0]?.code,).toBe("MAX_ITEMS_EXCEEDED",);
    expect(warnings[0]?.message,).toContain("recommended",);
  });

  it("flags non-string items as errors in strict mode", () => {
    const { errors, warnings, } = fresh();
    validateArrayConstraints(charWith({ tags: ["ok", 42,], },), "tags", errors, warnings, "strict",);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("tags[1]",);
    expect(errors[0]?.code,).toBe("INVALID_TYPE",);
    expect(errors[0]?.value,).toBe(42,);
  });

  it("flags non-string items as errors in relaxed mode too", () => {
    const { errors, warnings, } = fresh();
    validateArrayConstraints(charWith({ tags: ["ok", null,], },), "tags", errors, warnings, "relaxed",);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("tags[1]",);
    expect(errors[0]?.code,).toBe("INVALID_TYPE",);
    expect(warnings,).toHaveLength(0,);
  });

  it("accepts an item at the maxItemLength boundary", () => {
    const { errors, warnings, } = fresh();
    validateArrayConstraints(charWith({ tags: ["x".repeat(32,),], },), "tags", errors, warnings, "strict",);
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(0,);
  });

  it("errors when an item exceeds maxItemLength in strict mode", () => {
    const { errors, warnings, } = fresh();
    validateArrayConstraints(charWith({ tags: ["x".repeat(33,),], },), "tags", errors, warnings, "strict",);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("tags[0]",);
    expect(errors[0]?.code,).toBe("MAX_LENGTH_EXCEEDED",);
    expect(errors[0]?.value,).toBe("x".repeat(33,),);
  });

  it("warns when an item exceeds maxItemLength in relaxed mode", () => {
    const { errors, warnings, } = fresh();
    validateArrayConstraints(charWith({ tags: ["x".repeat(33,),], },), "tags", errors, warnings, "relaxed",);
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(1,);
    expect(warnings[0]?.field,).toBe("tags[0]",);
  });

  it("enforces alternate_greetings maxItems of 10", () => {
    const { errors, warnings, } = fresh();
    validateArrayConstraints(
      charWith({ alternate_greetings: Array(11,).fill("hi",), },),
      "alternate_greetings",
      errors,
      warnings,
      "strict",
    );

    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.message,).toContain("10",);
  });

  it("only enforces count for fields without maxItemLength", () => {
    // nsfw_categories: maxItems 50, no maxItemLength.
    const over = fresh();
    validateArrayConstraints(
      charWith({ nsfw_categories: Array(51,).fill("x",), },),
      "nsfw_categories",
      over.errors,
      over.warnings,
      "strict",
    );

    expect(over.errors,).toHaveLength(1,);
    expect(over.errors[0]?.code,).toBe("MAX_ITEMS_EXCEEDED",);

    // Long strings in nsfw_categories are not length-checked.
    const long = fresh();
    validateArrayConstraints(
      charWith({ nsfw_categories: ["x".repeat(5000,),], },),
      "nsfw_categories",
      long.errors,
      long.warnings,
      "strict",
    );

    expect(long.errors,).toHaveLength(0,);
    expect(long.warnings,).toHaveLength(0,);
  });
});

describe("validateOptionalFields", () => {
  it("accepts a character with all optional fields as strings", () => {
    const { errors, } = fresh();
    validateOptionalFields(
      charWith({
        scenario: "A scenario",
        welcome_message: "Welcome!",
        mes_example: "Example",
        system_prompt: "Prompt",
        post_history_instructions: "Instructions",
        creator: "Creator",
        creator_notes: "Notes",
        character_version: "1.0",
        nickname: "Nick",
      },),
      errors,
      [],
    );

    expect(errors,).toHaveLength(0,);
  });

  it("accepts undefined and null optional values", () => {
    const { errors, } = fresh();
    validateOptionalFields(
      charWith({
        scenario: undefined,
        nickname: null,
      },),
      errors,
      [],
    );

    expect(errors,).toHaveLength(0,);
  });

  it("flags a non-string optional value as INVALID_TYPE", () => {
    const { errors, } = fresh();
    validateOptionalFields(charWith({ scenario: 42, },), errors, [],);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("scenario",);
    expect(errors[0]?.code,).toBe("INVALID_TYPE",);
    expect(errors[0]?.value,).toBe(42,);
  });

  it("flags a non-string creator_notes as INVALID_TYPE", () => {
    const { errors, } = fresh();
    validateOptionalFields(charWith({ creator_notes: ["x",], },), errors, [],);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("creator_notes",);
    expect(errors[0]?.code,).toBe("INVALID_TYPE",);
  });

  it("flags non-array alternate_greetings", () => {
    const { errors, } = fresh();
    validateOptionalFields(charWith({ alternate_greetings: "just one", },), errors, [],);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("alternate_greetings",);
    expect(errors[0]?.code,).toBe("INVALID_TYPE",);
    expect(errors[0]?.message,).toContain("array",);
  });

  it("accepts array alternate_greetings", () => {
    const { errors, } = fresh();
    validateOptionalFields(charWith({ alternate_greetings: ["hi", "hey",], },), errors, [],);
    expect(errors,).toHaveLength(0,);
  });

  it("flags non-array tags", () => {
    const { errors, } = fresh();
    validateOptionalFields(charWith({ tags: "solo", },), errors, [],);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("tags",);
    expect(errors[0]?.code,).toBe("INVALID_TYPE",);
  });

  it("accepts array tags", () => {
    const { errors, } = fresh();
    validateOptionalFields(charWith({ tags: ["a", "b",], },), errors, [],);
    expect(errors,).toHaveLength(0,);
  });
});

describe("validateGrowthFields", () => {
  it("accepts growth_mode 'dynamic'", () => {
    const { errors, } = fresh();
    validateGrowthFields(charWith({ growth_mode: GrowthMode.Dynamic, },), errors,);
    expect(errors,).toHaveLength(0,);
  });

  it("accepts growth_mode 'static'", () => {
    const { errors, } = fresh();
    validateGrowthFields(charWith({ growth_mode: GrowthMode.Static, },), errors,);
    expect(errors,).toHaveLength(0,);
  });

  it("rejects an unknown growth_mode string", () => {
    const { errors, } = fresh();
    validateGrowthFields(charWith({ growth_mode: "chaotic", },), errors,);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("growth_mode",);
    expect(errors[0]?.code,).toBe("INVALID_VALUE",);
    expect(errors[0]?.message,).toContain("dynamic",);
    expect(errors[0]?.value,).toBe("chaotic",);
  });

  it("rejects a non-string growth_mode", () => {
    const { errors, } = fresh();
    validateGrowthFields(charWith({ growth_mode: 7, },), errors,);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.code,).toBe("INVALID_VALUE",);
  });

  it("ignores undefined and null growth_mode", () => {
    const undef = fresh();
    validateGrowthFields(charWith({ growth_mode: undefined, },), undef.errors,);
    expect(undef.errors,).toHaveLength(0,);

    const nul = fresh();
    validateGrowthFields(charWith({ growth_mode: null, },), nul.errors,);
    expect(nul.errors,).toHaveLength(0,);
  });

  it("accepts boolean llm_assist_enabled true and false", () => {
    const yes = fresh();
    validateGrowthFields(charWith({ llm_assist_enabled: true, },), yes.errors,);
    expect(yes.errors,).toHaveLength(0,);

    const no = fresh();
    validateGrowthFields(charWith({ llm_assist_enabled: false, },), no.errors,);
    expect(no.errors,).toHaveLength(0,);
  });

  it("rejects non-boolean llm_assist_enabled", () => {
    const { errors, } = fresh();
    validateGrowthFields(charWith({ llm_assist_enabled: "yes", },), errors,);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("llm_assist_enabled",);
    expect(errors[0]?.code,).toBe("INVALID_TYPE",);
    expect(errors[0]?.value,).toBe("yes",);
  });

  it("ignores undefined and null llm_assist_enabled", () => {
    const undef = fresh();
    validateGrowthFields(charWith({ llm_assist_enabled: undefined, },), undef.errors,);
    expect(undef.errors,).toHaveLength(0,);

    const nul = fresh();
    validateGrowthFields(charWith({ llm_assist_enabled: null, },), nul.errors,);
    expect(nul.errors,).toHaveLength(0,);
  });

  it("reports both growth fields when both are invalid", () => {
    const { errors, } = fresh();
    validateGrowthFields(charWith({ growth_mode: "bogus", llm_assist_enabled: 1, },), errors,);
    expect(errors,).toHaveLength(2,);
    expect(errors.some((e,) => e.field === "growth_mode"),).toBe(true,);
    expect(errors.some((e,) => e.field === "llm_assist_enabled"),).toBe(true,);
  });
});
