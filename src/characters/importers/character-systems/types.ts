// src/characters/importers/character-systems/types.ts — Importer result type

/** Import result with counts */
export interface CharacterSystemsImportResult {
  traitsImported: number;
  moodImported: boolean;
  relationshipsImported: number;
  avatarsImported: number;
  licensingImported: boolean;
  availabilityImported: boolean;
  errors: string[];
}
