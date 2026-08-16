// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/importers/character-systems/types.ts — Importer result type

/** Import result with counts */
export interface CharacterSystemsImportResult {
  traitsImported: number;
  moodImported: boolean;
  relationshipsImported: number;
  avatarsImported: number;
  licensingImported: boolean;
  availabilityImported: boolean;
  worldSetupImported: boolean;
  errors: string[];
}
