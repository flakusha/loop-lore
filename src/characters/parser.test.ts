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

  test("drops card fields whose type is wrong", async () => {
    const card = {
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: {
        name: "Typed",
        description: "A card with wrong field types",
        personality: 42,
        appearance: { nope: true, },
        tags: ["ok", 7,],
        alternate_greetings: "not a list",
        outfits: [{ id: 5, name: "Casual", },],
      },
    };

    const result = await parseCharacterCard(JSON.stringify(card,),);
    // A card field is untyped JSON: only a real string is a string, only a real
    // list is a list. A wrong-typed field is dropped, never cast through - a
    // number in `personality` would otherwise reach a `.trim()` and 500.
    expect(result.character.personality,).toBe("",);
    expect(result.character.appearance,).toBe("",);
    expect(result.character.tags,).toEqual(["ok",],);
    expect(result.character.alternate_greetings,).toBeUndefined();
    expect(result.character.outfits,).toEqual([{ id: "", name: "Casual", descriptor: "", },],);
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

  test("detects an Agnai native card and keeps its persona", async () => {
    const agnai = {
      name: "Aria",
      persona: { kind: "attributes", attributes: { species: ["elf",], }, },
      greeting: "Greetings",
      sampleChat: "{{user}}: hi",
      scenario: "A tavern at dusk",
    };

    const result = await parseCharacterCard(JSON.stringify(agnai,),);
    expect(result.format,).toBe("agnai",);
    expect(result.character.description,).toBe("Name: Aria\nspecies: elf",);
    expect(result.character.mes_example,).toBe("{{user}}: hi",);
    expect(result.character.scenario,).toBe("A tavern at dusk",);
  });

  test("reads the appearance a Tavern hybrid parks in extensions.agnai", async () => {
    const tavern = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "Aria",
        description: "Name: Aria\nspecies: elf",
        personality: "",
        first_mmes: "Greetings",
        extensions: { agnai: { appearance: "Silver hair", }, },
      },
    };

    const result = await parseCharacterCard(JSON.stringify(tavern,),);
    expect(result.format,).toBe("ccv2",);
    expect(result.character.appearance,).toBe("Silver hair",);
    // The card carries no personality of its own - it stays empty instead of
    // being filled with a copy of the description.
    expect(result.character.personality,).toBe("",);
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
      appearance: "",
      default_outfit: "",
      outfits: [],
    };

    const errors = validateCharacter(character,);
    expect(errors,).toContain("Name is required",);
    expect(errors,).toContain("Description is required",);
  });

  test("accepts a foreign card with no personality, appearance or wardrobe", () => {
    // The import maps the card faithfully: loop-lore's authoring spec is
    // enforced where a character is created, not where one is imported.
    const character: CanonicalCharacter = {
      name: "Foreign",
      description: "A tall elven ranger in silver armor.",
      personality: "",
      appearance: "",
      default_outfit: "",
      outfits: [],
    };

    expect(validateCharacter(character,),).toEqual([],);
  });

  test("returns errors for duplicate outfit ids", () => {
    const character: CanonicalCharacter = {
      name: "Dup",
      description: "d",
      personality: "p",
      appearance: "Tall",
      default_outfit: "gear",
      outfits: [
        { id: "gear", name: "Gear", descriptor: "x", },
        { id: "gear", name: "Gear 2", descriptor: "y", },
      ],
    };

    const errors = validateCharacter(character,);
    expect(errors,).toContain('Duplicate outfit id "gear"',);
  });

  test("returns no errors for valid character", () => {
    const character: CanonicalCharacter = {
      name: "Valid Character",
      description: "A valid character",
      personality: "A valid personality",
      appearance: "A valid appearance",
      default_outfit: "travel-gear",
      outfits: [
        { id: "travel-gear", name: "Travel Gear", descriptor: "Sturdy traveling clothes", },
      ],
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
