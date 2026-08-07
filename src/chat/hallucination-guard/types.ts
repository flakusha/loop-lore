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
