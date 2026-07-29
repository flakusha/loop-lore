// src/characters/normalizers/json-flat.test.ts
//
// Unit tests for JSON flat normalizer.

import { describe, expect, it, } from "bun:test";
import { normalizeJsonFlat, } from "./json-flat";

describe("normalizeJsonFlat", () => {
  it("normalizes flat JSON data with first_mes", () => {
    const input = {
      name: "Test Character",
      description: "A test character",
      personality: "Friendly",
      scenario: "In a test world",
      first_mes: "Hello!",
      mes_example: "Example message",
      system_prompt: "You are a character",
      post_history_instructions: "Be consistent",
      alternate_greetings: ["Hi!", "Hey!",],
      tags: ["test", "friendly",],
      creator: "Test Creator",
      creator_notes: "Test notes",
      character_version: "1.0",
    };

    const result = normalizeJsonFlat(input,);

    expect(result.name,).toBe("Test Character",);
    expect(result.description,).toBe("A test character",);
    expect(result.personality,).toBe("Friendly",);
    expect(result.scenario,).toBe("In a test world",);
    expect(result.welcome_message,).toBe("Hello!",);
    expect(result.mes_example,).toBe("Example message",);
    expect(result.system_prompt,).toBe("You are a character",);
    expect(result.post_history_instructions,).toBe("Be consistent",);
    expect(result.alternate_greetings,).toEqual(["Hi!", "Hey!",],);
    expect(result.tags,).toEqual(["test", "friendly",],);
    expect(result.creator,).toBe("Test Creator",);
    expect(result.creator_notes,).toBe("Test notes",);
    expect(result.character_version,).toBe("1.0",);
  });

  it("falls back to welcome_message when first_mes is missing", () => {
    const input = {
      name: "Fallback Character",
      description: "Uses welcome_message",
      welcome_message: "Welcome!",
    };

    const result = normalizeJsonFlat(input,);

    expect(result.welcome_message,).toBe("Welcome!",);
  });

  it("prefers first_mes over welcome_message", () => {
    const input = {
      name: "Priority Character",
      description: "Has both fields",
      first_mes: "First message",
      welcome_message: "Welcome message",
    };

    const result = normalizeJsonFlat(input,);

    expect(result.welcome_message,).toBe("First message",);
  });

  it("handles missing optional fields", () => {
    const input = {
      name: "Minimal Character",
      description: "Minimal description",
    };

    const result = normalizeJsonFlat(input,);

    expect(result.name,).toBe("Minimal Character",);
    expect(result.description,).toBe("Minimal description",);
    expect(result.personality,).toBe("",);
    expect(result.scenario,).toBeUndefined();
    expect(result.welcome_message,).toBeUndefined();
    expect(result.mes_example,).toBeUndefined();
    expect(result.system_prompt,).toBeUndefined();
    expect(result.post_history_instructions,).toBeUndefined();
    expect(result.alternate_greetings,).toBeUndefined();
    expect(result.tags,).toBeUndefined();
    expect(result.creator,).toBeUndefined();
    expect(result.creator_notes,).toBeUndefined();
    expect(result.character_version,).toBeUndefined();
  });

  it("handles empty input", () => {
    const input = {};

    const result = normalizeJsonFlat(input,);

    expect(result.name,).toBe("",);
    expect(result.description,).toBe("",);
    expect(result.personality,).toBe("",);
  });
});
