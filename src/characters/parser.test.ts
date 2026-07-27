// src/characters/parser.test.ts
//
// Tests for character card parser and auto-detection.

import { describe, expect, test, } from "bun:test";
import { parseCharacterCard, validateCharacter, } from "./parser";
import type { CanonicalCharacter, } from "./spec";

describe("parseCharacterCard", () => {
  test("detects CCv2 JSON format", async () => {
    const ccv2 = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "Test Character",
        description: "A test character",
        first_mes: "Hello!",
      },
    };

    const result = await parseCharacterCard(JSON.stringify(ccv2,),);
    expect(result.format,).toBe("ccv2",);
    expect(result.character.name,).toBe("Test Character",);
    expect(result.character.welcome_message,).toBe("Hello!",);
  });

  test("detects CCv3 JSON format", async () => {
    const ccv3 = {
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: {
        name: "V3 Character",
        description: "A V3 character",
        nickname: "V3",
      },
    };

    const result = await parseCharacterCard(JSON.stringify(ccv3,),);
    expect(result.format,).toBe("ccv3",);
    expect(result.character.name,).toBe("V3 Character",);
    expect(result.character.nickname,).toBe("V3",);
  });

  test("detects Character.AI format", async () => {
    const cai = {
      name: "CAI Character",
      description: "A Character.AI character",
      greeting: "Hi there!",
      definition: "{{char}} is a helpful assistant.",
    };

    const result = await parseCharacterCard(JSON.stringify(cai,),);
    expect(result.format,).toBe("character-ai",);
    expect(result.character.name,).toBe("CAI Character",);
    expect(result.character.welcome_message,).toBe("Hi there!",);
  });

  test("detects flat JSON format", async () => {
    const flat = {
      name: "Flat Character",
      description: "A flat JSON character",
    };

    const result = await parseCharacterCard(JSON.stringify(flat,),);
    expect(result.format,).toBe("json-flat",);
    expect(result.character.name,).toBe("Flat Character",);
  });

  test("detects YAML format", async () => {
    const yaml = `name: YAML Character
description: A YAML character
personality: Friendly`;

    const result = await parseCharacterCard(yaml,);
    expect(result.format,).toBe("yaml",);
    expect(result.character.name,).toBe("YAML Character",);
    expect(result.character.personality,).toBe("Friendly",);
  });

  test("detects TOML format", async () => {
    const toml = `[character]
name = "TOML Character"
description = "A TOML character"`;

    const result = await parseCharacterCard(toml,);
    expect(result.format,).toBe("toml",);
    expect(result.character.name,).toBe("TOML Character",);
  });

  test("throws on invalid format", async () => {
    const invalid = "this is not a character card";
    await expect(parseCharacterCard(invalid,),).rejects.toMatchObject({
      code: "FORMAT_NOT_DETECTED",
    },);
  });
});

describe("validateCharacter", () => {
  test("returns errors for missing required fields", () => {
    const character: CanonicalCharacter = {
      name: "",
      description: "",
      personality: "",
    };

    const errors = validateCharacter(character,);
    expect(errors,).toContain("Name is required",);
    expect(errors,).toContain("Description is required",);
  });

  test("returns no errors for valid character", () => {
    const character: CanonicalCharacter = {
      name: "Valid Character",
      description: "A valid character",
      personality: "A valid personality",
    };

    const errors = validateCharacter(character,);
    expect(errors,).toHaveLength(0,);
  });
});

describe("CCv2 normalization", () => {
  test("maps V2 fields to canonical", async () => {
    const ccv2 = {
      spec: "chara_card_v2",
      data: {
        name: "V2 Char",
        description: "Description",
        personality: "Personality",
        scenario: "Scenario",
        first_mes: "Welcome!",
        mes_example: "Example dialogue",
        system_prompt: "System prompt",
        post_history_instructions: "Post instructions",
        alternate_greetings: ["Hello", "Hi",],
        tags: ["tag1", "tag2",],
        creator: "Author",
        character_version: "1.0",
      },
    };

    const result = await parseCharacterCard(JSON.stringify(ccv2,),);
    expect(result.character.name,).toBe("V2 Char",);
    expect(result.character.welcome_message,).toBe("Welcome!",);
    expect(result.character.alternate_greetings,).toEqual(["Hello", "Hi",],);
    expect(result.character.tags,).toEqual(["tag1", "tag2",],);
  });

  test("handles lorebook entries", async () => {
    const ccv2 = {
      spec: "chara_card_v2",
      data: {
        name: "Lore Char",
        description: "Has lore",
        personality: "Lore personality",
        character_book: {
          entries: [
            {
              keys: ["keyword",],
              content: "Lore content",
              enabled: true,
            },
          ],
        },
      },
    };

    const result = await parseCharacterCard(JSON.stringify(ccv2,),);
    expect(result.character.lorebook,).toBeDefined();
    expect(result.character.lorebook?.entries,).toHaveLength(1,);
    expect(result.character.lorebook?.entries[0]?.keys,).toEqual(["keyword",],);
  });
});

describe("CCv3 normalization", () => {
  test("handles V3-specific fields", async () => {
    const ccv3 = {
      spec: "chara_card_v3",
      data: {
        name: "V3 Char",
        description: "V3 description",
        personality: "V3 personality",
        nickname: "V3 Nick",
        assets: [
          {
            type: "icon",
            name: "main",
            uri: "embeded://assets/icon/main.png",
            ext: "png",
          },
        ],
      },
    };

    const result = await parseCharacterCard(JSON.stringify(ccv3,),);
    expect(result.character.nickname,).toBe("V3 Nick",);
    expect(result.character.assets,).toHaveLength(1,);
    expect(result.character.assets?.[0]?.uri,).toBe("embeded://assets/icon/main.png",);
  });

  test("handles V3 lorebook with use_regex", async () => {
    const ccv3 = {
      spec: "chara_card_v3",
      data: {
        name: "Regex Char",
        description: "Has regex lore",
        personality: "Regex personality",
        character_book: {
          entries: [
            {
              keys: ["pattern.*",],
              content: "Regex content",
              use_regex: true,
            },
          ],
        },
      },
    };

    const result = await parseCharacterCard(JSON.stringify(ccv3,),);
    expect(result.character.lorebook?.entries[0]?.use_regex,).toBe(true,);
  });
});
