// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Systems Exporter
 *
 * Exports character traits, mood, relationships, avatars,
 * and licensing data in loop-lore native JSON format.
 */
import type { Kysely, } from "kysely";
import type { AvatarSelectionRule, AvatarTagType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { jsonParseOr, safeJsonStringify, } from "../../utils";
import { AvatarService, } from "../services/avatar-service";
import { MoodService, } from "../services/mood-service";
import { RelationshipsService, } from "../services/relationships-service";
import { TraitsService, } from "../services/traits-service";
import {
  LICENSING_FIELDS,
  mapAvatarForExport,
  mapRelationshipForExport,
  mapTraitForExport,
  toExportFields,
} from "../shared/character-systems-utils";
import type {
  WorldSetupInventoryItem,
  WorldSetupLoreEntry,
} from "../world-setup/types";

/**
 * One exported per-world avatar override. Declared concretely (not
 * `Record<string, unknown>`) so the importer can consume it without an
 * `as any` cast at the upsert boundary.
 */
export interface ExportedWorldAvatarConfig {
  worldId?: string;
  selectionRule?: AvatarSelectionRule;
  weights?: Partial<Record<AvatarTagType, number>>;
}

/** Complete character systems export */
export interface CharacterSystemsExport {
  version: "1.0";
  exportedAt: string;
  characterId: string;
  traits?: {
    permanent: Record<string, unknown>[];
    world: Record<string, unknown>[];
    /**
     * Location-scoped traits, each carrying its `locationId` (the row is keyed
     * by actor + location, not by world).
     */
    location: Record<string, unknown>[];
  };
  mood?: Record<string, unknown>;
  relationships?: Record<string, unknown>[];
  avatars?: {
    avatars: Record<string, unknown>[];
    config?: Record<string, unknown>;
    worldConfigs?: ExportedWorldAvatarConfig[];
  };
  licensing?: Record<string, unknown>;
  availability?: Record<string, unknown>;
  worldSetup?: {
    /**
     * World the bundle was exported from. The importer compares it against its
     * target `worldId` so a bundle cannot land in the wrong row.
     */
    worldId: string;
    startingInventory: WorldSetupInventoryItem[];
    loreEntries: WorldSetupLoreEntry[];
    backstory: string | null;
    scenarioOverride: string | null;
    systemPromptOverride: string | null;
    initialState: Record<string, unknown>;
  };
}

/**
 * Export all character systems data for a character.
 * @param db - Database instance
 * @param actorId - Character actor ID
 * @param worldId - Optional world ID for world-specific data
 * @returns Complete character systems export
 */
export async function exportCharacterSystems(
  db: Kysely<DB>,
  actorId: string,
  worldId?: string,
): Promise<CharacterSystemsExport> {
  const traitsService = TraitsService(db,);
  const moodService = MoodService(db,);
  const relationshipsService = RelationshipsService(db,);
  const avatarService = new AvatarService(db,);

  const exportData: CharacterSystemsExport = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    characterId: actorId,
  };

  // Export traits.
  //
  // Location traits (Layer 3) are keyed per location and carry no category, so
  // they get their own mapping instead of `mapTraitForExport`. The row has no
  // world column, so world scoping joins `locations` — previously this array
  // was hardcoded empty, which made location-scoped traits unexportable.
  const permanentTraits = await traitsService.getPermanentTraits(actorId,);
  const worldTraits = worldId
    ? await traitsService.getWorldTraits(actorId, worldId,)
    : [];

  const locationTraitRows = worldId
    ? await db
      .selectFrom("character_location_traits",)
      .innerJoin("locations", "locations.id", "character_location_traits.location_id",)
      .selectAll("character_location_traits",)
      .where("character_location_traits.actor_id", "=", actorId,)
      .where("locations.world_id", "=", worldId,)
      .execute()
    : await db
      .selectFrom("character_location_traits",)
      .selectAll()
      .where("actor_id", "=", actorId,)
      .execute();

  const locationTraits: Record<string, unknown>[] = Array.from(locationTraitRows, (row,) => ({
    locationId: row.location_id,
    name: row.trait_name,
    value: row.trait_value,
    bonus: row.bonus ?? 0,
    penalty: row.penalty ?? 0,
    // Passthrough of the `effects` JSON column: the trait service re-stringifies
    // whatever string it is handed, so a parsed object here would round-trip as
    // a double-encoded JSON string.
    effects: row.effects,
  }),);

  if (permanentTraits.length > 0 || worldTraits.length > 0 || locationTraits.length > 0) {
    exportData.traits = {
      permanent: Array.from(permanentTraits, (t,) => mapTraitForExport(t,),),
      world: Array.from(worldTraits, (t,) => mapTraitForExport(t,),),
      location: locationTraits,
    };
  }

  // Export mood
  const mood = await moodService.getMood(actorId, worldId,);
  if (mood) {
    exportData.mood = {
      happiness: mood.happiness,
      baseMood: mood.baseMood,
      currentMood: mood.currentMood,
      moodStability: mood.moodStability,
      expressionModifiers: mood.expressionModifiers,
    };
  }

  // Export relationships
  const relationships = await relationshipsService.getRelationships(actorId, worldId,);
  if (relationships.length > 0) {
    exportData.relationships = Array.from(relationships, (r,) => mapRelationshipForExport(r,),);
  }

  // Export avatars. World overrides live in `world_avatar_config`, keyed by
  // (actor, world), so they ride along only when the bundle is world-scoped.
  const avatars = await avatarService.getAvatars(actorId,);
  const avatarConfig = await avatarService.getAvatarConfig(actorId,);
  const worldAvatarConfig = worldId
    ? await avatarService.getWorldAvatarConfig(actorId, worldId,)
    : undefined;

  const worldConfigs: ExportedWorldAvatarConfig[] | undefined = worldAvatarConfig
    ? [{
      worldId: worldAvatarConfig.worldId,
      selectionRule: worldAvatarConfig.selectionRuleOverride,
      weights: worldAvatarConfig.weightsOverride,
    },]
    : undefined;

  if (avatars.length > 0 || worldConfigs) {
    exportData.avatars = {
      avatars: Array.from(avatars, (a,) => mapAvatarForExport(a,),),
      config: avatarConfig
        ? {
          selectionRule: avatarConfig.selectionRule,
          weights: avatarConfig.weights,
          fallbackOrder: avatarConfig.fallbackOrder,
        }
        : undefined,
      worldConfigs,
    };
  }

  // Export licensing (from DB directly)
  const licensing = await db
    .selectFrom("character_licensing",)
    .where("actor_id", "=", actorId,)
    .selectAll()
    .executeTakeFirst();

  if (licensing) {
    exportData.licensing = toExportFields(licensing, LICENSING_FIELDS,);
  }

  // Export availability (from DB directly)
  const availability = await db
    .selectFrom("character_availability",)
    .where("actor_id", "=", actorId,)
    .selectAll()
    .executeTakeFirst();

  if (availability) {
    exportData.availability = {
      status: availability.status,
      usagePolicy: jsonParseOr(availability.usage_policy ?? "{}", {},),
      activityRestrictions: jsonParseOr(availability.activity_restrictions ?? "{}", {},),
      contentPolicy: jsonParseOr(availability.content_policy ?? "{}", {},),
      nsfwPolicy: jsonParseOr(availability.nsfw_policy ?? "{}", {},),
    };
  }

  // Export world setup (per-world bundle; only when scoped to a world).
  if (worldId) {
    const setup = await db
      .selectFrom("character_world_setup",)
      .selectAll()
      .where("actor_id", "=", actorId,)
      .where("world_id", "=", worldId,)
      .executeTakeFirst();

    if (setup) {
      exportData.worldSetup = {
        worldId: setup.world_id,
        startingInventory: jsonParseOr(setup.starting_inventory, [] as WorldSetupInventoryItem[],),
        loreEntries: jsonParseOr(setup.lore_entries, [] as WorldSetupLoreEntry[],),
        backstory: setup.backstory,
        scenarioOverride: setup.scenario_override,
        systemPromptOverride: setup.system_prompt_override,
        initialState: jsonParseOr(setup.initial_state, {},),
      };
    }
  }

  return exportData;
}

/**
 * Export character systems to JSON string.
 * @param db - Database instance
 * @param actorId - Character actor ID
 * @param worldId - Optional world ID
 * @returns JSON string
 */
export async function exportCharacterSystemsJson(
  db: Kysely<DB>,
  actorId: string,
  worldId?: string,
): Promise<string> {
  const exportData = await exportCharacterSystems(db, actorId, worldId,);
  const json = safeJsonStringify(exportData, 2,);
  return json.ok ? json.value : "{}";
}
