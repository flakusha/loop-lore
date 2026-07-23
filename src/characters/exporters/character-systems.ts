/**
 * Character Systems Exporter
 *
 * Exports character traits, mood, relationships, avatars,
 * and licensing data in loop-lore native JSON format.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonParseOr, } from "../../utils";
import { AvatarService, } from "../services/avatar-service";
import { MoodService, } from "../services/mood-service";
import { RelationshipsService, } from "../services/relationships-service";
import { TraitsService, } from "../services/traits-service";

/** Complete character systems export */
export interface CharacterSystemsExport {
  version: "1.0";
  exportedAt: string;
  characterId: string;
  traits?: {
    permanent: Record<string, unknown>[];
    world: Record<string, unknown>[];
    location: Record<string, unknown>[];
  };
  mood?: Record<string, unknown>;
  relationships?: Record<string, unknown>[];
  avatars?: {
    avatars: Record<string, unknown>[];
    config?: Record<string, unknown>;
    worldConfigs?: Record<string, unknown>[];
  };
  licensing?: Record<string, unknown>;
  availability?: Record<string, unknown>;
}

/**
 * Export all character systems data for a character.
 *
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
  const traitsService = new TraitsService(db,);
  const moodService = new MoodService(db,);
  const relationshipsService = new RelationshipsService(db,);
  const avatarService = new AvatarService(db,);

  const exportData: CharacterSystemsExport = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    characterId: actorId,
  };

  // Export traits
  const permanentTraits = await traitsService.getPermanentTraits(actorId,);
  const worldTraits = worldId
    ? await traitsService.getWorldTraits(actorId, worldId,)
    : [];
  const locationTraits: Record<string, unknown>[] = []; // Location traits need locationId

  if (permanentTraits.length > 0 || worldTraits.length > 0) {
    exportData.traits = {
      permanent: permanentTraits.map((t,) => ({
        category: t.trait_category,
        name: t.trait_name,
        value: t.trait_value,
      })),
      world: worldTraits.map((t,) => ({
        category: t.trait_category,
        name: t.trait_name,
        value: t.trait_value,
      })),
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
    exportData.relationships = relationships.map((r,) => ({
      targetActorId: r.targetActorId,
      relationshipType: r.relationshipType,
      standing: r.standing,
      trust: r.trust,
      familiarity: r.familiarity,
      isBidirectional: r.isBidirectional,
      metadata: r.metadata,
    }));
  }

  // Export avatars
  const avatars = await avatarService.getAvatars(actorId,);
  const avatarConfig = await avatarService.getAvatarConfig(actorId,);
  if (avatars.length > 0) {
    exportData.avatars = {
      avatars: avatars.map((a,) => ({
        assetId: a.assetId,
        label: a.label,
        tags: a.tags,
        isPrimary: a.isPrimary,
        sortOrder: a.sortOrder,
      })),
      config: avatarConfig
        ? {
          selectionRule: avatarConfig.selectionRule,
          weights: avatarConfig.weights,
          fallbackChain: avatarConfig.fallbackChain,
        }
        : undefined,
    };
  }

  // Export licensing (from DB directly)
  const licensing = await db
    .selectFrom("character_licensing",)
    .where("actor_id", "=", actorId,)
    .selectAll()
    .executeTakeFirst();

  if (licensing) {
    exportData.licensing = {
      licenseType: licensing.license_type,
      customLicenseText: licensing.custom_license_text,
      attribution: licensing.attribution,
      allowDerivatives: licensing.allow_derivatives,
      allowCommercial: licensing.allow_commercial,
      shareAlike: licensing.share_alike,
    };
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

  return exportData;
}

/**
 * Export character systems to JSON string.
 *
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
  return JSON.stringify(exportData, null, 2,);
}
