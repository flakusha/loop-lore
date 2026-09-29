// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Importer result type for character systems.

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
