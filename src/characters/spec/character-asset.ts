// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/spec/character-asset.ts — character-attached asset shape
// (CHARX imports carry raw bytes; URI/uri/ext is the normalized form).
// Re-exported from `character.ts`.

/** */
export interface CharacterAsset {
  type: string;
  name: string;
  uri: string;
  ext: string;
  data?: Buffer; // For CHARX imports
}
