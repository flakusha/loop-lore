// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/index.ts
//
// Character import/export module

export { createCharx, extractCharx, resolveEmbededUri, } from "./charx";
export * from "./exporters";
export * from "./normalizers";
export { parseCharacterCard, parseCharacterFile, validateCharacter, } from "./parser";
export type {
  CanonicalCharacter,
  CharacterAsset,
  CharacterFormat,
  LorebookData,
  LorebookEntry,
  ParseError,
  ParseResult,
} from "./spec";
