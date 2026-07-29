// src/characters/normalizers/yaml.test.ts
//
// Unit tests for YAML normalizer.

import { describe, expect, it, } from "bun:test";
import { normalizeYaml, } from "./yaml";

describe("normalizeYaml", () => {
  it("normalizes YAML data", () => {
    const input = {
      name: "Test Character",
      description: "A test character",
      personality: "Friendly",
      scenario: "In a test world",
      welcome_message: "Hello!",
      mes_example: "Example message",
      system_prompt: "You are a character",
      post_history_instructions: "Be consistent",
      alternate_greetings: ["Hi!", "Hey!",],
      tags: ["test", "friendly",],
      creator: "Test Creator",
      creator_notes: "Test notes",
      character_version: "1.0",
    };

    const result = normalizeYaml(input,);

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

  it("handles missing optional fields", () => {
    const input = {
      name: "Minimal Character",
      description: "Minimal description",
    };

    const result = normalizeYaml(input,);

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

  it("uses welcome_message key", () => {
    const input = {
      name: "YAML Character",
      description: "Uses welcome_message",
      welcome_message: "Welcome!",
    };

    const result = normalizeYaml(input,);

    expect(result.welcome_message,).toBe("Welcome!",);
  });

  it("handles empty input", () => {
    const input = {};

    const result = normalizeYaml(input,);

    expect(result.name,).toBe("",);
    expect(result.description,).toBe("",);
    expect(result.personality,).toBe("",);
  });
});
