// src/characters/exporters.test.ts
//
// Tests for character card exporters.

import { describe, expect, test, } from "bun:test";
import { exportToCcV2Json, } from "./exporters/ccv2";
import { exportToCcV3Json, } from "./exporters/ccv3";
import { exportToToml, } from "./exporters/toml";
import { exportToYaml, } from "./exporters/yaml";
import type { CanonicalCharacter, } from "./parser";

const testCharacter: CanonicalCharacter = {
  name: "Test Character",
  description: "A test character for export",
  personality: "Friendly, helpful",
  scenario: "Testing environment",
  welcome_message: "Hello! I'm a test character.",
  mes_example: "User: Hi\nCharacter: Hello there!",
  system_prompt: "You are a test character.",
  post_history_instructions: "Stay in character.",
  alternate_greetings: ["Hi!", "Hello!",],
  tags: ["test", "example",],
  creator: "Test Author",
  character_version: "1.0",
};

describe("exportToCcV2Json", () => {
  test("exports valid CCv2 JSON", () => {
    const json = exportToCcV2Json(testCharacter,);
    const parsed = JSON.parse(json,);

    expect(parsed.spec,).toBe("chara_card_v2",);
    expect(parsed.spec_version,).toBe("2.0",);
    expect(parsed.data.name,).toBe("Test Character",);
    expect(parsed.data.first_mes,).toBe("Hello! I'm a test character.",);
    expect(parsed.data.alternate_greetings,).toEqual(["Hi!", "Hello!",],);
  });

  test("includes lorebook when present", () => {
    const character: CanonicalCharacter = {
      ...testCharacter,
      lorebook: {
        entries: [
          {
            keys: ["keyword",],
            content: "Lore content",
            enabled: true,
            insertion_order: 0,
            case_sensitive: false,
            name: "Test Lore",
            priority: 0,
            id: 0,
            selective: false,
            constant: false,
            position: "before_char",
          },
        ],
      },
    };

    const json = exportToCcV2Json(character,);
    const parsed = JSON.parse(json,);

    expect(parsed.data.character_book,).toBeDefined();
    expect(parsed.data.character_book.entries,).toHaveLength(1,);
  });
});

describe("exportToCcV3Json", () => {
  test("exports valid CCv3 JSON", () => {
    const json = exportToCcV3Json(testCharacter,);
    const parsed = JSON.parse(json,);

    expect(parsed.spec,).toBe("chara_card_v3",);
    expect(parsed.spec_version,).toBe("3.0",);
    expect(parsed.data.name,).toBe("Test Character",);
    expect(parsed.data.creation_date,).toBeDefined();
    expect(parsed.data.modification_date,).toBeDefined();
  });

  test("includes assets when present", () => {
    const character: CanonicalCharacter = {
      ...testCharacter,
      assets: [
        {
          type: "icon",
          name: "main",
          uri: "embeded://assets/icon/main.png",
          ext: "png",
        },
      ],
    };

    const json = exportToCcV3Json(character,);
    const parsed = JSON.parse(json,);

    expect(parsed.data.assets,).toHaveLength(1,);
    expect(parsed.data.assets[0].uri,).toBe("embeded://assets/icon/main.png",);
  });
});

describe("exportToYaml", () => {
  test("exports valid YAML", () => {
    const yaml = exportToYaml(testCharacter,);

    expect(yaml,).toContain("name: Test Character",);
    expect(yaml,).toContain("description: A test character for export",);
    expect(yaml,).toContain("personality: Friendly, helpful",);
    expect(yaml,).toContain("tags:",);
    expect(yaml,).toContain("  - test",);
  });
});

describe("exportToToml", () => {
  test("exports valid TOML", () => {
    const toml = exportToToml(testCharacter,);

    expect(toml,).toContain("[character]",);
    expect(toml,).toContain('name = "Test Character"',);
    expect(toml,).toContain("personality =",);
    expect(toml,).toContain("[character.metadata]",);
    expect(toml,).toContain("[character.prompts]",);
  });
});

describe("round-trip", () => {
  test("CCv2 → canonical → CCv2 preserves data", () => {
    const json1 = exportToCcV2Json(testCharacter,);
    const parsed = JSON.parse(json1,);

    // Simulate import
    const canonical: CanonicalCharacter = {
      name: parsed.data.name,
      description: parsed.data.description,
      personality: parsed.data.personality,
      scenario: parsed.data.scenario,
      welcome_message: parsed.data.first_mes,
      mes_example: parsed.data.mes_example,
      system_prompt: parsed.data.system_prompt,
      post_history_instructions: parsed.data.post_history_instructions,
      alternate_greetings: parsed.data.alternate_greetings,
      tags: parsed.data.tags,
      creator: parsed.data.creator,
      character_version: parsed.data.character_version,
    };

    const json2 = exportToCcV2Json(canonical,);
    const parsed2 = JSON.parse(json2,);

    expect(parsed2.data.name,).toBe(parsed.data.name,);
    expect(parsed2.data.description,).toBe(parsed.data.description,);
    expect(parsed2.data.alternate_greetings,).toEqual(parsed.data.alternate_greetings,);
  });
});
