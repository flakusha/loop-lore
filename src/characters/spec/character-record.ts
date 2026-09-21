// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/spec/character-record.ts — database-shaped character record
// (extends the canonical shape with persistence columns).
// Re-exported from `character.ts` for back-compat.

import type { CanonicalCharacter, } from "./character";
import type {
  ContentRating,
  ImportFormat,
  MigrationStatus,
  ReviewState,
  StorageFormat,
} from "./enums";

/** */
export interface CharacterRecord extends CanonicalCharacter {
  id: string;
  owner_id: string;
  user_id: string | null;
  actor_type: string;
  display_name: string;
  visibility: string;
  content_rating: ContentRating;
  review_state: ReviewState;
  storage_format: StorageFormat;
  data_source_format: StorageFormat;
  data_json: string;
  data_yaml: string | null;
  data_toml: string | null;
  import_format: ImportFormat | null;
  import_source: string | null;
  migration_status: MigrationStatus;
  migration_from_version: string | null;
  migration_to_version: string;
  allowed_age: number | null;
  created_at: string;
  updated_at: string;
}
