// src/characters/normalizers/character-ai.test.ts
//
// Unit tests for Character.AI normalizer.

import { describe, expect, it, } from "bun:test";
import { normalizeCharacterAI, } from "./character-ai";

describe("normalizeCharacterAI", () => {
  it("normalizes basic Character.AI data", () => {
    const input = {
      name: "Test Character",
      description: "A test character",
      greeting: "Hello!",
      definition: "You are a friendly character",
      examples_of_dialogue: "User: Hi\nCharacter: Hello!",
      tags: ["test", "friendly",],
    };

    const result = normalizeCharacterAI(input,);

    expect(result.name,).toBe("Test Character",);
    expect(result.description,).toBe("A test character\n\nYou are a friendly character",);
    expect(result.personality,).toBe("",);
    expect(result.welcome_message,).toBe("Hello!",);
    expect(result.mes_example,).toBe("User: Hi\nCharacter: Hello!",);
    expect(result.tags,).toEqual(["test", "friendly",],);
  });

  it("handles missing optional fields", () => {
    const input = {
      name: "Minimal Character",
      description: "Minimal description",
    };

    const result = normalizeCharacterAI(input,);

    expect(result.name,).toBe("Minimal Character",);
    expect(result.description,).toBe("Minimal description",);
    expect(result.personality,).toBe("",);
    expect(result.welcome_message,).toBeUndefined();
    expect(result.mes_example,).toBeUndefined();
    expect(result.tags,).toBeUndefined();
  });

  it("preserves macro syntax in definition", () => {
    const input = {
      name: "Macro Character",
      description: "",
      definition: "{{char}} is a character who likes {{user}}",
    };

    const result = normalizeCharacterAI(input,);

    expect(result.description,).toBe("{{char}} is a character who likes {{user}}",);
  });

  it("handles definition without description", () => {
    const input = {
      name: "Definition Only",
      definition: "You are a character",
    };

    const result = normalizeCharacterAI(input,);

    expect(result.description,).toBe("You are a character",);
  });

  it("handles empty input", () => {
    const input = {};

    const result = normalizeCharacterAI(input,);

    expect(result.name,).toBe("",);
    expect(result.description,).toBe("",);
    expect(result.personality,).toBe("",);
  });
});
