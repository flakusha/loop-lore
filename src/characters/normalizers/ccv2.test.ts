// src/characters/normalizers/ccv2.test.ts
//
// Unit tests for CCv2 normalizer.

import { describe, expect, it, } from "bun:test";
import { normalizeCcV2, } from "./ccv2";

describe("normalizeCcV2", () => {
  it("normalizes basic CCv2 data", () => {
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

    const result = normalizeCcV2(input,);

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

  it("extracts data from envelope wrapper", () => {
    const input = {
      spec: "chara_card_v2",
      data: {
        name: "Wrapped Character",
        description: "Wrapped description",
      },
    };

    const result = normalizeCcV2(input,);

    expect(result.name,).toBe("Wrapped Character",);
    expect(result.description,).toBe("Wrapped description",);
  });

  it("handles missing optional fields", () => {
    const input = {
      name: "Minimal Character",
      description: "Minimal description",
    };

    const result = normalizeCcV2(input,);

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

  it("preserves extensions", () => {
    const input = {
      name: "Character with Extensions",
      description: "Has extensions",
      extensions: {
        custom_field: "custom_value",
        nested: { key: "value", },
      },
    };

    const result = normalizeCcV2(input,);

    expect(result.extensions,).toEqual({
      custom_field: "custom_value",
      nested: { key: "value", },
    },);
  });

  it("builds lorebook from character_book", () => {
    const input = {
      name: "Character with Lorebook",
      description: "Has a lorebook",
      character_book: {
        name: "Test Lorebook",
        description: "A test lorebook",
        scan_depth: 5,
        token_budget: 100,
        recursive_scanning: true,
        entries: [
          {
            keys: ["test", "lore",],
            content: "Test lore content",
            enabled: true,
            insertion_order: 1,
            case_sensitive: false,
            name: "Test Entry",
            priority: 10,
            id: 1,
            comment: "Test comment",
            selective: false,
            constant: false,
            position: "before_char",
          },
        ],
      },
    };

    const result = normalizeCcV2(input,);

    expect(result.lorebook,).toBeDefined();
    expect(result.lorebook?.name,).toBe("Test Lorebook",);
    expect(result.lorebook?.description,).toBe("A test lorebook",);
    expect(result.lorebook?.scan_depth,).toBe(5,);
    expect(result.lorebook?.token_budget,).toBe(100,);
    expect(result.lorebook?.recursive_scanning,).toBe(true,);
    expect(result.lorebook?.entries,).toHaveLength(1,);
    expect(result.lorebook?.entries[0]?.keys,).toEqual(["test", "lore",],);
    expect(result.lorebook?.entries[0]?.content,).toBe("Test lore content",);
  });

  it("handles empty input", () => {
    const input = {};

    const result = normalizeCcV2(input,);

    expect(result.name,).toBe("",);
    expect(result.description,).toBe("",);
    expect(result.personality,).toBe("",);
  });
});
