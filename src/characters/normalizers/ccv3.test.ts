// src/characters/normalizers/ccv3.test.ts
//
// Unit tests for CCv3 normalizer.

import { describe, expect, it, } from "bun:test";
import { normalizeCcV3, } from "./ccv3";

describe("normalizeCcV3", () => {
  it("normalizes basic CCv3 data", () => {
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
      nickname: "Testy",
    };

    const result = normalizeCcV3(input,);

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
    expect(result.nickname,).toBe("Testy",);
  });

  it("extracts data from envelope wrapper", () => {
    const input = {
      spec: "chara_card_v3",
      data: {
        name: "Wrapped Character",
        description: "Wrapped description",
      },
    };

    const result = normalizeCcV3(input,);

    expect(result.name,).toBe("Wrapped Character",);
    expect(result.description,).toBe("Wrapped description",);
  });

  it("handles missing optional fields", () => {
    const input = {
      name: "Minimal Character",
      description: "Minimal description",
    };

    const result = normalizeCcV3(input,);

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
    expect(result.nickname,).toBeUndefined();
  });

  it("normalizes assets", () => {
    const input = {
      name: "Character with Assets",
      description: "Has assets",
      assets: [
        {
          type: "avatar",
          name: "main_avatar",
          uri: "embeded://assets/avatar.png",
          ext: "png",
        },
        {
          type: "audio",
          name: "voice",
          uri: "embeded://assets/voice.mp3",
          ext: "mp3",
        },
      ],
    };

    const result = normalizeCcV3(input,);

    expect(result.assets,).toBeDefined();
    expect(result.assets,).toHaveLength(2,);
    expect(result.assets?.[0]?.type,).toBe("avatar",);
    expect(result.assets?.[0]?.name,).toBe("main_avatar",);
    expect(result.assets?.[0]?.uri,).toBe("embeded://assets/avatar.png",);
    expect(result.assets?.[0]?.ext,).toBe("png",);
    expect(result.assets?.[1]?.type,).toBe("audio",);
    expect(result.assets?.[1]?.name,).toBe("voice",);
    expect(result.assets?.[1]?.uri,).toBe("embeded://assets/voice.mp3",);
    expect(result.assets?.[1]?.ext,).toBe("mp3",);
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

    const result = normalizeCcV3(input,);

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

    const result = normalizeCcV3(input,);

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

    const result = normalizeCcV3(input,);

    expect(result.name,).toBe("",);
    expect(result.description,).toBe("",);
    expect(result.personality,).toBe("",);
  });
});
