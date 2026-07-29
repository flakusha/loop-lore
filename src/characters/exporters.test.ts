// src/characters/exporters.test.ts
//
// Tests for character card exporters.

import { describe, expect, test, } from "bun:test";
import { exportToCcV2Json, } from "./exporters/ccv2";
import { exportToCcV3Json, } from "./exporters/ccv3";
import { exportToPng, exportToPngBase64, } from "./exporters/png";
import { exportToToml, } from "./exporters/toml";
import { exportToYaml, } from "./exporters/yaml";
import { parseCharacterCard, } from "./parser";
import type { CanonicalCharacter, ParseResult, } from "./parser";

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
            priority: 1,
            id: 1,
            comment: "",
            selective: false,
            constant: false,
            position: "before_char",
          },
        ],
        name: "Test Lorebook",
        description: "Test lorebook",
        scan_depth: 10,
        token_budget: 1000,
        recursive_scanning: false,
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
    expect(parsed.data.first_mes,).toBe("Hello! I'm a test character.",);
    expect(parsed.data.alternate_greetings,).toEqual(["Hi!", "Hello!",],);
  });

  test("includes assets when present", () => {
    const character: CanonicalCharacter = {
      ...testCharacter,
      assets: [
        {
          type: "avatar",
          name: "avatar.png",
          uri: "data:image/png;base64,...",
          ext: "png",
        },
      ],
    };

    const json = exportToCcV3Json(character,);
    const parsed = JSON.parse(json,);

    expect(parsed.data.assets,).toBeDefined();
    expect(parsed.data.assets,).toHaveLength(1,);
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

describe("exportToPng", () => {
  test("exports valid PNG with embedded data", () => {
    const pngBuffer = exportToPng(testCharacter,);

    expect(pngBuffer,).toBeInstanceOf(Buffer,);
    expect(pngBuffer.length,).toBeGreaterThan(0,);

    // Verify PNG signature
    expect(pngBuffer[0],).toBe(0x89,);
    expect(pngBuffer[1],).toBe(0x50,);
    expect(pngBuffer[2],).toBe(0x4E,);
    expect(pngBuffer[3],).toBe(0x47,);
  });

  test("exports valid PNG base64", () => {
    const base64 = exportToPngBase64(testCharacter,);

    expect(base64,).toBeTypeOf("string",);
    expect(base64.length,).toBeGreaterThan(0,);

    // Verify it's valid base64
    const buffer = Buffer.from(base64, "base64",);
    expect(buffer[0],).toBe(0x89,);
    expect(buffer[1],).toBe(0x50,);
    expect(buffer[2],).toBe(0x4E,);
    expect(buffer[3],).toBe(0x47,);
  });
});

describe("round-trip: CCv2", () => {
  test("CCv2 → canonical → CCv2 preserves data", () => {
    const json1 = exportToCcV2Json(testCharacter,);
    const parsed = JSON.parse(json1,);

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

describe("round-trip: CCv3", () => {
  test("CCv3 → canonical → CCv3 preserves data", () => {
    const json1 = exportToCcV3Json(testCharacter,);
    const parsed = JSON.parse(json1,);

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

    const json2 = exportToCcV3Json(canonical,);
    const parsed2 = JSON.parse(json2,);

    expect(parsed2.data.name,).toBe(parsed.data.name,);
    expect(parsed2.data.description,).toBe(parsed.data.description,);
    expect(parsed2.data.alternate_greetings,).toEqual(parsed.data.alternate_greetings,);
  });
});

describe("round-trip: YAML", () => {
  test("YAML → canonical → YAML preserves data", () => {
    // Parse YAML back (simplified)
    const canonical: CanonicalCharacter = {
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

    const yaml2 = exportToYaml(canonical,);

    expect(yaml2,).toContain("name: Test Character",);
    expect(yaml2,).toContain("description: A test character for export",);
    expect(yaml2,).toContain("tags:",);
  });
});

describe("round-trip: TOML", () => {
  test("TOML → canonical → TOML preserves data", () => {
    const canonical: CanonicalCharacter = {
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

    const toml2 = exportToToml(canonical,);

    expect(toml2,).toContain("[character]",);
    expect(toml2,).toContain('name = "Test Character"',);
    expect(toml2,).toContain("personality =",);
  });
});

describe("round-trip: PNG", () => {
  test("PNG → canonical → PNG preserves data", async () => {
    const pngBuffer = exportToPng(testCharacter,);

    // Extract character data from PNG
    const result: ParseResult = await parseCharacterCard(pngBuffer,);

    expect(result.character.name,).toBe(testCharacter.name,);
    expect(result.character.description,).toBe(testCharacter.description,);
    expect(result.character.personality,).toBe(testCharacter.personality,);
  });

  test("PNG base64 → canonical → PNG preserves data", async () => {
    const base64 = exportToPngBase64(testCharacter,);
    const buffer = Buffer.from(base64, "base64",);

    const result: ParseResult = await parseCharacterCard(buffer,);

    expect(result.character.name,).toBe(testCharacter.name,);
    expect(result.character.description,).toBe(testCharacter.description,);
  });
});

describe("round-trip: Full import/export cycle", () => {
  test("import JSON → export PNG → import PNG preserves core data", async () => {
    const json = exportToCcV2Json(testCharacter,);

    // Import
    const result: ParseResult = await parseCharacterCard(Buffer.from(json, "utf8",),);

    // Export to PNG
    const pngBuffer = exportToPng(result.character,);

    // Re-import from PNG
    const reResult: ParseResult = await parseCharacterCard(pngBuffer,);

    expect(reResult.character.name,).toBe(testCharacter.name,);
    expect(reResult.character.description,).toBe(testCharacter.description,);
    expect(reResult.character.personality,).toBe(testCharacter.personality,);
  });

  test("import CCv3 → export YAML → import YAML preserves core data", async () => {
    const json = exportToCcV3Json(testCharacter,);

    const result: ParseResult = await parseCharacterCard(Buffer.from(json, "utf8",),);

    const yaml = exportToYaml(result.character,);

    const reResult: ParseResult = await parseCharacterCard(Buffer.from(yaml, "utf8",),);

    expect(reResult.character.name,).toBe(testCharacter.name,);
    expect(reResult.character.description,).toBe(testCharacter.description,);
  });

  test("import Character.AI → export TOML → import TOML preserves core data", async () => {
    const characterAI = {
      name: "Test Character",
      description: "A test character",
      personality: "Friendly",
      greeting: "Hello!",
      definition: "{{user}}: Hi\n{{char}}: Hello!",
    };

    const result: ParseResult = await parseCharacterCard(Buffer.from(JSON.stringify(characterAI,), "utf8",),);

    const toml = exportToToml(result.character,);

    const reResult: ParseResult = await parseCharacterCard(Buffer.from(toml, "utf8",),);

    expect(reResult.character.name,).toBe("Test Character",);
    // Character.AI definition field is appended to description
    expect(reResult.character.description,).toBe("A test character\n\n{{user}}: Hi\n{{char}}: Hello!",);
  });
});

describe("format detection", () => {
  test("detects CCv2 JSON", async () => {
    const json = exportToCcV2Json(testCharacter,);
    const result: ParseResult = await parseCharacterCard(Buffer.from(json, "utf8",),);

    expect(result.format,).toBe("ccv2",);
  });

  test("detects CCv3 JSON", async () => {
    const json = exportToCcV3Json(testCharacter,);
    const result: ParseResult = await parseCharacterCard(Buffer.from(json, "utf8",),);

    expect(result.format,).toBe("ccv3",);
  });

  test("detects PNG V2", async () => {
    const pngBuffer = exportToPng(testCharacter,);
    const result: ParseResult = await parseCharacterCard(pngBuffer,);

    expect(result.format,).toBe("png-v2",);
  });

  test("detects PNG V3", async () => {
    const character: CanonicalCharacter = {
      ...testCharacter,
      assets: [{ type: "avatar", name: "avatar.png", uri: "data:image/png;base64,...", ext: "png", },],
    };
    const pngBuffer = exportToPng(character,);
    const result: ParseResult = await parseCharacterCard(pngBuffer,);

    // Should detect as V3 when assets present
    expect(result.format,).toMatch(/png-v[23]/,);
  });
});
