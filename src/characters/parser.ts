// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Auto-detection and format dispatch for character card imports.
// Tries each format in order, returning the first successful parse.

// Adoption status (TASK-adopt-bun-yaml-to-replace-js-yaml):
//   DEFERRED on Bun.YAML.parse for parse symmetry — Bun.YAML.stringify is
//   also blocked on `lineWidth` (https://github.com/oven-sh/bun/issues/39959),
//   and swapping the parser without the serializer would diverge the
//   round-trip (export one flavor, import another). Re-evaluate together
//   with the yaml.ts exporter.
import { load as yamlLoad, } from "js-yaml";
import { jsonParseOr, } from "../utils";
import { safeFromString, } from "../utils/safe-buffer";
import { extractCharx, } from "./charx";
import { normalizeCcV2, } from "./normalizers/ccv2";
import { normalizeCcV3, } from "./normalizers/ccv3";
import { normalizeCharacterAI, } from "./normalizers/character-ai";
import { normalizeJsonFlat, } from "./normalizers/json-flat";
import { normalizeToml, } from "./normalizers/toml";
import { normalizeYaml, } from "./normalizers/yaml";
import { extractCharacterDataFromPng, } from "./steganography";

import type {
  CanonicalCharacter,
  CharacterFormat,
  ParseError,
  ParseResult,
} from "./spec";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47,],);
const ZIP_MAGIC = Buffer.from([0x50, 0x4B, 0x03, 0x04,],);

/**
 * @param data
 */
function isPngMagic(data: Buffer,): boolean {
  return data.length >= 4 && data.subarray(0, 4,).equals(PNG_MAGIC,);
}

/**
 * @param data
 */
function isZipMagic(data: Buffer,): boolean {
  return data.length >= 4 && data.subarray(0, 4,).equals(ZIP_MAGIC,);
}

/**
 * @param input
 * @param _filename
 */
export async function parseCharacterCard(input: Buffer | string, _filename?: string,): Promise<ParseResult> {
  const warnings: string[] = [];
  let data: Buffer;
  if (typeof input === "string") {
    const result = safeFromString(input,);
    if (!result.ok) { throw result.error; }
    data = result.buffer;
  } else {
    data = input;
  }

  if (isPngMagic(data,)) {
    const pngResult = parsePngCard(data, warnings,);
    if (pngResult) { return pngResult; }
  }

  if (isZipMagic(data,)) {
    const charxResult = await parseCharxCard(data, warnings,);
    if (charxResult) { return charxResult; }
  }

  const text = data.toString("utf8",);

  const jsonResult = tryParseJson(text,);
  if (jsonResult) { return jsonResult; }

  const tomlResult = tryParseToml(text,);
  if (tomlResult) { return { ...tomlResult, warnings, }; }

  const yamlResult = tryParseYaml(text,);
  if (yamlResult) { return { ...yamlResult, warnings, }; }

  const error = new Error("Unable to detect character card format",) as Error & ParseError;
  error.code = "FORMAT_NOT_DETECTED";
  error.suggestion = "Ensure file is JSON, YAML, TOML, PNG with embedded data, or CHARX bundle";
  throw error;
}

/**
 * @param data
 * @param warnings
 */
function parsePngCard(data: Buffer, warnings: string[],): ParseResult | null {
  const result = extractCharacterDataFromPng(data,);
  if (!result) { return null; }
  const format: CharacterFormat = result.spec === "chara_card_v3" ? "png-v3" : "png-v2";
  const character = format === "png-v3" ? normalizeCcV3(result.data,) : normalizeCcV2(result.data,);
  warnings.push(`PNG ${format === "png-v3" ? "V3" : "V2"} card detected`,);
  return { character, format, warnings, };
}

/**
 * @param data
 * @param warnings
 */
async function parseCharxCard(data: Buffer, warnings: string[],): Promise<ParseResult | null> {
  try {
    const charxResult = await extractCharx(data,);
    const character = normalizeCcV3(charxResult.card,);
    character.assets = charxResult.assets;
    warnings.push(`CHARX bundle with ${charxResult.assets.length} assets`,);
    return { character, format: "charx", warnings, };
  } catch (error) {
    warnings.push(`CHARX extraction failed: ${error instanceof Error ? error.message : "unknown"}`,);
    return null;
  }
}

/**
 * @param text
 */
function tryParseJson(text: string,): ParseResult | null {
  const parsed = jsonParseOr(text, null,);
  if (!parsed || typeof parsed !== "object") { return null; }

  const obj = parsed as Record<string, unknown>;
  const warnings: string[] = [];

  if (obj.spec === "chara_card_v3") {
    warnings.push("CCv3 format detected",);
    return { character: normalizeCcV3(obj,), format: "ccv3", warnings, };
  }

  if (obj.spec === "chara_card_v2") {
    warnings.push("CCv2 format detected",);
    return { character: normalizeCcV2(obj,), format: "ccv2", warnings, };
  }

  if (obj.definition || obj.greeting) {
    warnings.push("Character.AI format detected",);
    return { character: normalizeCharacterAI(obj,), format: "character-ai", warnings, };
  }

  warnings.push("Flat JSON format detected",);
  return { character: normalizeJsonFlat(obj,), format: "json-flat", warnings, };
}

/**
 * @param text
 */
function tryParseToml(text: string,): ParseResult | null {
  try {
    if (!text.includes("[",) || !text.includes("]",)) { return null; }

    const parsed = Bun.TOML.parse(text,);
    if (!parsed || typeof parsed !== "object") { return null; }

    const obj = parsed as Record<string, unknown>;
    if (!obj.character) { return null; }

    const warnings = ["TOML format detected",];
    return { character: normalizeToml(obj,), format: "toml", warnings, };
  } catch {
    return null;
  }
}

/**
 * @param text
 */
function tryParseYaml(text: string,): ParseResult | null {
  try {
    if (!text.includes(":",) || text.includes("{",)) { return null; }

    const parsed = yamlLoad(text,);
    if (!parsed || typeof parsed !== "object") { return null; }

    const obj = parsed as Record<string, unknown>;
    if (!obj.name && !obj.description) { return null; }

    const warnings = ["YAML format detected",];
    return { character: normalizeYaml(obj,), format: "yaml", warnings, };
  } catch {
    return null;
  }
}

/**
 * @param content
 */
export async function parseCharacterFile(content: Buffer,): Promise<ParseResult> {
  return parseCharacterCard(content,);
}

/**
 * @param character
 */
export function validateCharacter(character: CanonicalCharacter,): string[] {
  const errors: string[] = [];

  if (!character.name || character.name.trim() === "") {
    errors.push("Name is required",);
  }

  if (!character.description || character.description.trim() === "") {
    errors.push("Description is required",);
  }

  return errors;
}

export { type CanonicalCharacter, type CharacterFormat, type ParseError, type ParseResult, } from "./spec";
