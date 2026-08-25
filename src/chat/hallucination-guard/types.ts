// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db";

/** Type of entity that may be hallucinated. */
export type HallucinationEntityType = "character" | "location" | "item" | "world";

/** A potential hallucination detected in generated text. */
export interface HallucinationFlag {
  /** The entity name that may be hallucinated */
  entityName: string;
  /** Type of entity */
  entityType: HallucinationEntityType;
  /** The sentence or fragment where it appears */
  context: string;
  /** Confidence that this is a hallucination (0-1) */
  confidence: number;
}

/** Result of hallucination analysis. */
export interface HallucinationAnalysis {
  /** Whether hallucinations were detected */
  detected: boolean;
  /** Overall hallucination score (0-1) */
  score: number;
  /** Individual flagged entities */
  flags: HallucinationFlag[];
  /** Summary of analysis */
  summary: string;
}

/** Options for hallucination checking. */
export interface HallucinationCheckOpts {
  db: Kysely<DB>;
  /** The generated text to check */
  text: string;
  /** World ID to validate against (optional — if null, skip world-specific checks) */
  worldId?: string;
  /** Actor IDs that are known participants (always valid) */
  knownActorIds?: string[];
  /** Location IDs that are known (always valid) */
  knownLocationIds?: string[];
  /**
   * Transient/dynamic entity names that are valid for this check even though
   * they are not (yet) persisted in the database. Use for session-created
   * objects, NPCs spawned this turn, or other world-state entities that exist
   * but are absent from the static snapshot — prevents false-positive
   * hallucination flags. (B2, 2026-08-25)
   */
  knownEntityNames?: string[];
}

/** A proper noun extracted from text, pending classification. */
interface ExtractedEntity {
  name: string;
  type: "character" | "location" | "item" | "world";
}

export type { ExtractedEntity, };

/** Known entity name sets loaded from the database. */
export interface KnownEntities {
  actors: Set<string>;
  locations: Set<string>;
  items: Set<string>;
  worlds: Set<string>;
}
