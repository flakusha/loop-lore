/**
 * Scenario Source Store (Epic 42)
 *
 * Creative LLMs generate new worlds/ideas that become reusable assistant
 * scenario sources for future generation of scenarios.
 *
 * Bridges into the blog system (generated_world_seed) and world/locations.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";

/** Origin of a scenario source */
export type ScenarioOrigin = "creative_llm" | "blog_seed" | "manual";

/** A reusable scenario source */
export interface ScenarioSource {
  id: string;
  /** Where this source originated */
  origin: ScenarioOrigin;
  /** World sketch / description */
  world_sketch: string;
  /** Whether this source can be reused for generation */
  reusable: boolean;
  /** Tags for categorization */
  tags: string[];
  /** Creation timestamp */
  created_at: string;
  /** Last used timestamp */
  last_used_at?: string;
}

/**
 * Store a new scenario source.
 *
 * @param db - Database instance
 * @param source - Scenario source to store
 * @returns Stored scenario source ID
 */
export async function storeScenarioSource(
  _db: Kysely<DB>,
  _source: Omit<ScenarioSource, "id" | "created_at">,
): Promise<string> {
  // TODO: Insert into scenario_sources table (or reuse world_seeds table)
  // TODO: Index by tags for fast lookup
  // TODO: Track usage count for popularity ranking

  return `scenario-${Date.now()}`;
}

/**
 * Find reusable scenario sources matching a query.
 *
 * @param db - Database instance
 * @param query - Search query (matched against world_sketch and tags)
 * @param limit - Maximum results
 * @returns Matching scenario sources
 */
export async function findScenarioSources(
  _db: Kysely<DB>,
  _query: string,
  _limit = 10,
): Promise<ScenarioSource[]> {
  // TODO: Query scenario_sources table with FTS
  // TODO: Match against world_sketch and tags
  // TODO: Sort by relevance and last_used_at

  return [];
}

/**
 * Get a random reusable scenario source for inspiration.
 *
 * @param db - Database instance
 * @returns Random scenario source or null
 */
export async function getRandomScenarioSource(_db: Kysely<DB>,): Promise<ScenarioSource | null> {
  // TODO: Select random reusable source from DB
  return null;
}

/**
 * Bridge: Create a blog world seed from a scenario source.
 *
 * @param db - Database instance
 * @param scenarioId - Scenario source ID
 * @param blogPostId - Blog post to link
 * @returns Bridge record ID
 */
export async function bridgeToBlog(
  _db: Kysely<DB>,
  _scenarioId: string,
  _blogPostId: string,
): Promise<string> {
  // TODO: Insert into scenario_blog_bridges table
  // TODO: Link scenario source to blog world seed
  return `bridge-${Date.now()}`;
}
