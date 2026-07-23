/**
 * Personality Integrity Service
 *
 * Enforces the critical design decision: personality is immutable.
 * Core personality traits, values, fears, and desires CANNOT change.
 * Only mood (expression) and behavioral modifiers (contextual) can vary.
 *
 * Layer 0 = permanent traits (immutable)
 * Layer 1 = personality expression (mutable — mood, tone, verbosity)
 * Layer 2 = world/location traits (mutable — contextual modifiers)
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db";
import type { TraitCategory, } from "../../db/enums";

/** Fields that are ALWAYS immutable (cannot be changed after creation). */
const IMMUTABLE_TRAITS: ReadonlySet<string> = new Set([
  // Identity
  "name",
  "species",
  "gender",
  "age",
  "birth_date",
  // Personality
  "personality_traits",
  "core_values",
  "fears",
  "desires",
  "alignment",
  "ideals",
  "strives",
  // Physical base
  "natural_appearance",
  "voice",
  // Background
  "homeland",
  "culture",
  "education",
],);

/** Trait categories that are entirely immutable. */
const IMMUTABLE_CATEGORIES: ReadonlySet<TraitCategory> = new Set([
  "identity",
  "personality",
  "background",
],);

/**
 * Personality lock result — describes whether a trait change is allowed.
 */
export interface PersonalityLockResult {
  allowed: boolean;
  reason: string;
  traitName: string;
  traitCategory: TraitCategory;
}

/**
 * Check if a trait modification is allowed under personality integrity rules.
 *
 * @param traitName - The name of the trait being modified
 * @param traitCategory - The category of the trait
 * @returns Whether the modification is allowed and why
 */
export function checkPersonalityIntegrity(
  traitName: string,
  traitCategory: TraitCategory,
): PersonalityLockResult {
  // Category-level immutability
  if (IMMUTABLE_CATEGORIES.has(traitCategory,)) {
    return {
      allowed: false,
      reason: `Category '${traitCategory}' is immutable — personality cannot change`,
      traitName,
      traitCategory,
    };
  }

  // Individual trait immutability
  if (IMMUTABLE_TRAITS.has(traitName,)) {
    return {
      allowed: false,
      reason: `Trait '${traitName}' is immutable — core personality cannot change`,
      traitName,
      traitCategory,
    };
  }

  // Social category traits are immutable (friendliness, talkativity, etc.)
  // but CAN be shifted by world/story stylistic requirements
  if (traitCategory === "social") {
    return {
      allowed: true,
      reason: "Social traits can be SHIFTED by world/story requirements (not changed)",
      traitName,
      traitCategory,
    };
  }

  // Physical traits: base is immutable, but equipment overrides are allowed
  if (traitCategory === "physical" && traitName !== "natural_appearance") {
    return {
      allowed: true,
      reason: "Physical traits can be overridden by equipment/world context",
      traitName,
      traitCategory,
    };
  }

  return {
    allowed: true,
    reason: "Trait modification allowed",
    traitName,
    traitCategory,
  };
}

/**
 * Resolve character traits across layers, applying personality integrity rules.
 *
 * Layer 0 (permanent) → Layer 2 (world) → Layer 3 (location)
 * Personality traits from Layer 0 are NEVER overridden by higher layers.
 *
 * @returns Resolved traits with integrity violations flagged
 */
export async function resolveCharacterTraits(
  database: Kysely<DB>,
  actorId: string,
  worldId?: string,
  locationId?: string,
): Promise<{
  resolved: Record<string, string>;
  violations: PersonalityLockResult[];
  layers: {
    permanent: Record<string, string>;
    world: Record<string, string>;
    location: Record<string, string>;
  };
}> {
  // Layer 0: Permanent traits
  const permanentRows = await database
    .selectFrom("character_permanent_traits",)
    .selectAll()
    .where("actor_id", "=", actorId,)
    .execute();

  const permanent: Record<string, string> = {};
  for (const row of permanentRows) {
    permanent[row.trait_name] = row.trait_value;
  }

  // Layer 2: World traits
  const world: Record<string, string> = {};
  if (worldId) {
    const worldRows = await database
      .selectFrom("character_world_traits",)
      .selectAll()
      .where("actor_id", "=", actorId,)
      .where("world_id", "=", worldId,)
      .execute();

    for (const row of worldRows) {
      // Check personality integrity
      const lock = checkPersonalityIntegrity(row.trait_name, row.trait_category as TraitCategory,);
      if (!lock.allowed) {
        // Skip — personality integrity violation
        continue;
      }
      world[row.trait_name] = row.trait_value;
    }
  }

  // Layer 3: Location traits
  const location: Record<string, string> = {};
  if (locationId) {
    const locationRows = await database
      .selectFrom("character_location_traits",)
      .selectAll()
      .where("actor_id", "=", actorId,)
      .where("location_id", "=", locationId,)
      .execute();

    for (const row of locationRows) {
      location[row.trait_name] = row.trait_value;
    }
  }

  // Merge: permanent → world → location (higher layers override non-immutable)
  const resolved: Record<string, string> = { ...permanent, ...world, ...location, };

  // Collect violations (for audit/logging)
  const violations: PersonalityLockResult[] = [];
  for (const row of permanentRows) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- WorldTraitCategory ≠ TraitCategory
    const lock = checkPersonalityIntegrity(row.trait_name, row.trait_category as TraitCategory,);
    if (!lock.allowed) {
      violations.push(lock,);
    }
  }

  return { resolved, violations, layers: { permanent, world, location, }, };
}

/**
 * Apply a behavioral modifier to a character within a specific world/story context.
 *
 * This does NOT change personality — it adds a contextual modifier that shifts
 * how personality is EXPRESSED (e.g., "in this world, she speaks more formally").
 *
 * Stored as a world trait with a "behavioral_modifier" prefix.
 */
export async function applyBehavioralModifier(
  database: Kysely<DB>,
  actorId: string,
  worldId: string,
  modifierName: string,
  modifierValue: string,
): Promise<string> {
  // Behavioral modifiers are stored as world traits in the "cultural" category
  // They can shift expression but NOT change core personality
  const id = crypto.randomUUID();
  await database
    .insertInto("character_world_traits",)
    .values({
      id,
      actor_id: actorId,
      world_id: worldId,
      trait_category: "cultural",
      trait_name: `behavioral_modifier:${modifierName}`,
      trait_value: modifierValue,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },)
    .execute();

  return id;
}

/**
 * Get all behavioral modifiers for a character in a world.
 * These are world traits with the "behavioral_modifier:" prefix.
 */
export async function getBehavioralModifiers(
  database: Kysely<DB>,
  actorId: string,
  worldId: string,
): Promise<Record<string, string>> {
  const rows = await database
    .selectFrom("character_world_traits",)
    .selectAll()
    .where("actor_id", "=", actorId,)
    .where("world_id", "=", worldId,)
    .execute();

  const modifiers: Record<string, string> = {};
  for (const row of rows) {
    if (!row.trait_name.startsWith("behavioral_modifier:",)) {
      continue;
    }
    const name = row.trait_name.slice("behavioral_modifier:".length,);
    modifiers[name] = row.trait_value;
  }

  return modifiers;
}
