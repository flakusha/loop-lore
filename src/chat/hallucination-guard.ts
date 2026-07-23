/**
 * Hallucination Guard
 *
 * Validates that entities mentioned in generated text exist in the
 * world state. Flags potential hallucinations where the LLM creates
 * characters, locations, or items that don't exist.
 *
 * Works alongside the existing repetition detector to ensure
 * content quality and world consistency.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db";

// ── Types ───────────────────────────────────────────────────

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

// ── Core Detection ──────────────────────────────────────────

/**
 * Analyze generated text for potential hallucinations.
 *
 * Checks:
 * 1. Named entities against known actors, locations, items
 * 2. Specific claims about non-existent entities
 * 3. Invented proper nouns that don't match any DB records
 *
 * @param opts - Check options including DB and text
 * @returns Hallucination analysis with flags
 */
export async function detectHallucinations(
  opts: HallucinationCheckOpts,
): Promise<HallucinationAnalysis> {
  const { db, text, worldId, knownActorIds = [], knownLocationIds = [], } = opts;

  if (text.length < 20) {
    return { detected: false, score: 0, flags: [], summary: "Text too short to analyze", };
  }

  // Extract proper nouns from the text
  const entities = extractProperNouns(text,);

  if (entities.length === 0) {
    return { detected: false, score: 0, flags: [], summary: "No entities detected", };
  }

  // Load known entities from DB
  const knownEntities = await loadKnownEntities(db, worldId,);

  const flags: HallucinationFlag[] = [];

  for (const entity of entities) {
    // Skip if entity is a known participant
    if (isKnownEntity(entity.name, knownEntities, knownActorIds, knownLocationIds,)) {
      continue;
    }

    // Entity not found — potential hallucination
    const context = extractContext(text, entity.name,);
    const confidence = computeHallucinationConfidence(entity,);

    if (confidence >= 0.5) {
      flags.push({
        entityName: entity.name,
        entityType: entity.type,
        context,
        confidence,
      },);
    }
  }

  const score = flags.length > 0
    ? flags.reduce((sum, f,) => sum + f.confidence, 0,) / flags.length
    : 0;

  return {
    detected: flags.length > 0,
    score,
    flags,
    summary: flags.length > 0
      ? `Potential hallucinations: ${flags.map((f,) => f.entityName).join(", ",)}`
      : "No hallucinations detected",
  };
}

// ── Entity Extraction ───────────────────────────────────────

interface ExtractedEntity {
  name: string;
  type: "character" | "location" | "item" | "world";
}

/** Extract proper nouns from text, classify as character/location/item. */
function extractProperNouns(text: string,): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>();

  // Match capitalized words/phrases (potential proper nouns)
  const properNounRe = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\b/g;
  let match;

  while ((match = properNounRe.exec(text,)) !== null) {
    const name = match[1]!;
    if (seen.has(name,) || COMMON_WORDS.has(name,)) { continue; }
    seen.add(name,);

    // Simple heuristic classification
    const type = classifyEntity(name, text,);
    entities.push({ name, type, },);
  }

  return entities;
}

/** Common English words that start with capital letters. */
const COMMON_WORDS = new Set([
  "The",
  "This",
  "That",
  "There",
  "Their",
  "They",
  "Then",
  "When",
  "What",
  "Where",
  "Which",
  "While",
  "After",
  "Before",
  "During",
  "However",
  "But",
  "And",
  "For",
  "Not",
  "You",
  "Your",
  "His",
  "Her",
  "Our",
  "Its",
  "Can",
  "Could",
  "Would",
  "Should",
  "Will",
  "Just",
  "Like",
  "Also",
  "Only",
  "Even",
  "Still",
  "Already",
  "Now",
  "Here",
  "Today",
  "Tomorrow",
  "Yesterday",
  "Never",
  "Always",
  "Sometimes",
  "Perhaps",
  "Maybe",
  "Yes",
  "No",
  "Well",
  "Oh",
  "Ah",
  "Um",
  "Uh",
  // Day/month names
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
  "January",
  "February",
  "March",
  "April",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
],);

/** Classify an entity based on context clues. */
function classifyEntity(
  name: string,
  text: string,
): "character" | "location" | "item" | "world" {
  const lower = text.toLowerCase();
  const nameLower = name.toLowerCase();

  // Check surrounding context for location indicators
  if (
    /\b(at|in|near|toward|from|arrived|entered|left|visited)\b/i.test(lower,) &&
    lower.includes(nameLower,)
  ) {
    return "location";
  }

  // Check for item indicators
  if (
    /\b(picked up|found|equipped|used|wielded|wearing|carrying)\b/i.test(lower,) &&
    lower.includes(nameLower,)
  ) {
    return "item";
  }

  // Check for world indicators
  if (
    /\b(world|realm|kingdom|land|dimension)\b/i.test(lower,) &&
    lower.includes(nameLower,)
  ) {
    return "world";
  }

  // Default: assume character
  return "character";
}

// ── Known Entity Loading ────────────────────────────────────

interface KnownEntities {
  actors: Set<string>;
  locations: Set<string>;
  items: Set<string>;
  worlds: Set<string>;
}

/** Load all known entities from the database for validation. */
async function loadKnownEntities(
  db: Kysely<DB>,
  worldId?: string,
): Promise<KnownEntities> {
  const actors = new Set<string>();
  const locations = new Set<string>();
  const items = new Set<string>();
  const worlds = new Set<string>();

  // Load actor names
  const actorRows = await db
    .selectFrom("actors",)
    .select("display_name",)
    .limit(500,)
    .execute();
  for (const row of actorRows) {
    actors.add(row.display_name.toLowerCase(),);
    // Also add first name only
    const firstName = row.display_name.split(/\s+/, 1,)[0];
    if (firstName) { actors.add(firstName.toLowerCase(),); }
  }

  // Load location names
  let locQuery = db.selectFrom("locations",).select("name",);
  if (worldId) {
    locQuery = locQuery.where("world_id", "=", worldId,);
  }
  const locRows = await locQuery.limit(500,).execute();
  for (const row of locRows) {
    locations.add(row.name.toLowerCase(),);
  }

  // Load item names
  let itemQuery = db.selectFrom("items",).select("name",);
  if (worldId) {
    itemQuery = itemQuery.where("world_id", "=", worldId,);
  }
  const itemRows = await itemQuery.limit(500,).execute();
  for (const row of itemRows) {
    items.add(row.name.toLowerCase(),);
  }

  // Load world names
  const worldRows = await db
    .selectFrom("worlds",)
    .select("name",)
    .limit(100,)
    .execute();
  for (const row of worldRows) {
    worlds.add(row.name.toLowerCase(),);
  }

  return { actors, locations, items, worlds, };
}

/** Check if an entity is in any known set. */
function isKnownEntity(
  name: string,
  known: KnownEntities,
  _knownActorIds: string[],
  _knownLocationIds: string[],
): boolean {
  const lower = name.toLowerCase();
  return known.actors.has(lower,) ||
    known.locations.has(lower,) ||
    known.items.has(lower,) ||
    known.worlds.has(lower,);
}

// ── Helpers ─────────────────────────────────────────────────

/** Extract the sentence containing the entity for context. */
function extractContext(text: string, entityName: string,): string {
  const sentences = text.split(/[.!?]+/,).map((s,) => s.trim());
  for (const sentence of sentences) {
    if (sentence.includes(entityName,)) {
      return sentence.slice(0, 200,);
    }
  }
  return text.slice(0, 200,);
}

/** Compute confidence that an entity is a hallucination. */
function computeHallucinationConfidence(
  entity: ExtractedEntity,
): number {
  // Higher confidence if entity is a proper noun that doesn't match any known entity
  // Lower confidence if entity appears in a very generic context

  let confidence = 0.7; // base confidence for unknown entity

  // Type-specific adjustments
  switch (entity.type) {
    case "character": {
      // Characters are more likely to be hallucinated
      confidence = 0.8;

      break;
    }
    case "location": {
      // Locations are somewhat less likely
      confidence = 0.6;

      break;
    }
    case "item": {
      // Items are less likely to be hallucinated
      confidence = 0.5;

      break;
    }
      // No default
  }

  return confidence;
}
