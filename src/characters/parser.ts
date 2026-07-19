// src/characters/parser.ts
//
// Auto-detection and format dispatch for character card imports.
// Tries each format in order, returning the first successful parse.

import { parse as parseToml } from "smol-toml";
import { load as yamlLoad } from "js-yaml";
import { extractCharacterDataFromPng } from "./steganography";
import { normalizeCcV2 } from "./normalizers/ccv2";
import { normalizeCcV3 } from "./normalizers/ccv3";
import { normalizeCharacterAI } from "./normalizers/character-ai";
import { normalizeJsonFlat } from "./normalizers/json-flat";
import { normalizeYaml } from "./normalizers/yaml";
import { normalizeToml } from "./normalizers/toml";
import { extractCharx } from "./charx";
import { jsonParseOr } from "../utils/safe-json";

// Canonical character card format (superset of CCv2/V3)
export interface CanonicalCharacter {
  name: string;
  description: string;
  personality?: string;
  scenario?: string;
  welcome_message?: string;
  mes_example?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  tags?: string[];
  creator?: string;
  creator_notes?: string;
  character_version?: string;
  nickname?: string;
  extensions?: Record<string, unknown>;
  lorebook?: LorebookData;
  assets?: CharacterAsset[];
}

export interface LorebookData {
  name?: string;
  description?: string;
  scan_depth?: number;
  token_budget?: number;
  recursive_scanning?: boolean;
  entries: LorebookEntry[];
}

export interface LorebookEntry {
  keys: string[];
  content: string;
  enabled: boolean;
  insertion_order: number;
  case_sensitive: boolean;
  name: string;
  priority: number;
  id: number;
  comment?: string;
  selective: boolean;
  constant: boolean;
  position: "before_char" | "after_char";
  use_regex?: boolean;
  extensions?: Record<string, unknown>;
}

export interface CharacterAsset {
  type: string;
  name: string;
  uri: string;
  ext: string;
  data?: Buffer; // For CHARX imports
}

export type CharacterFormat =
  "ccv2" | "ccv3" | "character-ai" | "json-flat" | "yaml" | "toml" | "png-v2" | "png-v3" | "charx";

export interface ParseResult {
  character: CanonicalCharacter;
  format: CharacterFormat;
  warnings: string[];
}

export interface ParseError {
  code:
    "FORMAT_NOT_DETECTED" | "PARSE_ERROR" | "VALIDATION_ERROR" | "UNSUPPORTED_VERSION" | "FILE_READ_ERROR";
  message: string;
  details?: {
    line?: number;
    column?: number;
    field?: string;
    expected?: string;
    actual?: string;
  };
  suggestion?: string;
}

// PNG magic bytes: 0x89 0x50 0x4E 0x47
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
// ZIP magic bytes: 0x50 0x4B 0x03 0x04
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function isPngMagic(data: Buffer): boolean {
  return data.length >= 4 && data.subarray(0, 4).equals(PNG_MAGIC);
}

function isZipMagic(data: Buffer): boolean {
  return data.length >= 4 && data.subarray(0, 4).equals(ZIP_MAGIC);
}

/**
 * Auto-detect format and parse character card.
 * Tries formats in priority order, returning the first successful parse.
 */
export async function parseCharacterCard(input: Buffer | string, _filename?: string): Promise<ParseResult> {
  const warnings: string[] = [];
  const data = typeof input === "string" ? Buffer.from(input) : input;

  // 1. Check magic bytes for PNG
  if (isPngMagic(data)) {
    const result = extractCharacterDataFromPng(data);
    if (result) {
      const format: CharacterFormat = result.spec === "chara_card_v3" ? "png-v3" : "png-v2";
      const character = format === "png-v3" ? normalizeCcV3(result.data) : normalizeCcV2(result.data);
      warnings.push(`PNG ${format === "png-v3" ? "V3" : "V2"} card detected`);
      return { character, format, warnings };
    }
  }

  // 2. Check magic bytes for ZIP (CHARX)
  if (isZipMagic(data)) {
    try {
      const charxResult = await extractCharx(data);
      const character = normalizeCcV3(charxResult.card);
      character.assets = charxResult.assets;
      warnings.push(`CHARX bundle with ${charxResult.assets.length} assets`);
      return { character, format: "charx", warnings };
    } catch (error) {
      warnings.push(`CHARX extraction failed: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  // 3. Try text-based formats
  const text = data.toString("utf8");

  // Try JSON
  const jsonResult = tryParseJson(text);
  if (jsonResult) return jsonResult;

  // Try TOML
  const tomlResult = tryParseToml(text);
  if (tomlResult) return { ...tomlResult, warnings };

  // Try YAML
  const yamlResult = tryParseYaml(text);
  if (yamlResult) return { ...yamlResult, warnings };

  // 4. All formats failed
  const error = new Error("Unable to detect character card format") as Error & ParseError;
  error.code = "FORMAT_NOT_DETECTED";
  error.suggestion = "Ensure file is JSON, YAML, TOML, PNG with embedded data, or CHARX bundle";
  throw error;
}

function tryParseJson(text: string): ParseResult | null {
  const parsed = jsonParseOr(text, null);
  if (!parsed || typeof parsed !== "object") return null;

  const obj = parsed as Record<string, unknown>;
  const warnings: string[] = [];

  // Check for CCv3
  if (obj.spec === "chara_card_v3") {
    warnings.push("CCv3 format detected");
    return { character: normalizeCcV3(obj), format: "ccv3", warnings };
  }

  // Check for CCv2
  if (obj.spec === "chara_card_v2") {
    warnings.push("CCv2 format detected");
    return { character: normalizeCcV2(obj), format: "ccv2", warnings };
  }

  // Check for Character.AI
  if (obj.definition || obj.greeting) {
    warnings.push("Character.AI format detected");
    return { character: normalizeCharacterAI(obj), format: "character-ai", warnings };
  }

  // Flat JSON (assume V1-like)
  warnings.push("Flat JSON format detected");
  return { character: normalizeJsonFlat(obj), format: "json-flat", warnings };
}

function tryParseToml(text: string): ParseResult | null {
  try {
    // Only try TOML if it looks like TOML (has [sections])
    if (!text.includes("[") || !text.includes("]")) return null;

    const parsed = parseToml(text);
    if (!parsed || typeof parsed !== "object") return null;

    const obj = parsed as Record<string, unknown>;
    if (!obj.character) return null;

    const warnings = ["TOML format detected"];
    return { character: normalizeToml(obj), format: "toml", warnings };
  } catch {
    return null;
  }
}

function tryParseYaml(text: string): ParseResult | null {
  try {
    // Only try YAML if it looks like YAML (has key: value pairs)
    if (!text.includes(":") || text.includes("{")) return null;

    const parsed = yamlLoad(text);
    if (!parsed || typeof parsed !== "object") return null;

    const obj = parsed as Record<string, unknown>;
    // YAML should have character-like fields
    if (!obj.name && !obj.description) return null;

    const warnings = ["YAML format detected"];
    return { character: normalizeYaml(obj), format: "yaml", warnings };
  } catch {
    return null;
  }
}

/**
 * Parse character card from file content.
 */
export async function parseCharacterFile(content: Buffer): Promise<ParseResult> {
  return parseCharacterCard(content);
}

/**
 * Validate a canonical character card.
 */
export function validateCharacter(character: CanonicalCharacter): string[] {
  const errors: string[] = [];

  if (!character.name || character.name.trim() === "") {
    errors.push("Name is required");
  }

  if (!character.description || character.description.trim() === "") {
    errors.push("Description is required");
  }

  return errors;
}
