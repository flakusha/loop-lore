/**
 * Character Systems Importer
 *
 * Imports character traits, mood, relationships, avatars,
 * and licensing data from loop-lore native JSON format.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { CharacterSystemsExport, } from "../exporters/character-systems";
import { AvatarService, } from "../services/avatar-service";
import { MoodService, } from "../services/mood-service";
import { RelationshipsService, } from "../services/relationships-service";
import { TraitsService, } from "../services/traits-service";

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

function errMsg(error: unknown,): string {
  return error instanceof Error ? error.message : String(error,);
}

/**
 * Import character systems data from loop-lore native format.
 */
export async function importCharacterSystems(
  db: Kysely<DB>,
  actorId: string,
  data: CharacterSystemsExport,
  worldId?: string,
): Promise<CharacterSystemsImportResult> {
  const traitsService = new TraitsService(db,);
  const moodService = new MoodService(db,);
  const relationshipsService = new RelationshipsService(db,);
  const avatarService = new AvatarService(db,);

  const result: CharacterSystemsImportResult = {
    traitsImported: 0,
    moodImported: false,
    relationshipsImported: 0,
    avatarsImported: 0,
    licensingImported: false,
    availabilityImported: false,
    errors: [],
  };

  // ── Import traits ────────────────────────────────────────
  if (data.traits) {
    for (const trait of data.traits.permanent) {
      try {
        const existing = await traitsService.getPermanentTrait(actorId, trait.name as string,);
        if (existing) {
          await traitsService.updatePermanentTrait(actorId, {
            name: trait.name as string,
            value: trait.value as string,
          },);
        } else {
          await traitsService.createPermanentTrait({
            actorId,
            category: trait.category as any,
            name: trait.name as string,
            value: trait.value as string,
          },);
        }
        result.traitsImported++;
      } catch (error: unknown) {
        result.errors.push(`Failed to import permanent trait "${String(trait.name,)}": ${errMsg(error,)}`,);
      }
    }

    if (worldId) {
      for (const trait of data.traits.world) {
        try {
          const existing = await traitsService.getWorldTrait(actorId, worldId, trait.name as string,);
          if (existing) {
            await traitsService.updateWorldTrait(actorId, worldId, {
              name: trait.name as string,
              value: trait.value as string,
            },);
          } else {
            await traitsService.createWorldTrait({
              actorId,
              worldId,
              category: trait.category as any,
              name: trait.name as string,
              value: trait.value as string,
            },);
          }
          result.traitsImported++;
        } catch (error: unknown) {
          result.errors.push(`Failed to import world trait "${String(trait.name,)}": ${errMsg(error,)}`,);
        }
      }
    }
  }

  // ── Import mood ──────────────────────────────────────────
  if (data.mood) {
    try {
      const existing = await moodService.getMood(actorId, worldId,);
      if (existing) {
        await moodService.updateMood(actorId, worldId, {
          happiness: data.mood.happiness as number,
          currentMood: data.mood.currentMood as string,
          moodStability: data.mood.moodStability as number,
          expressionModifiers: data.mood.expressionModifiers as Record<string, number>,
        },);
      } else {
        await moodService.createMood({
          actorId,
          worldId,
          happiness: data.mood.happiness as number,
          baseMood: data.mood.baseMood as string,
          moodStability: data.mood.moodStability as number,
        },);
      }
      result.moodImported = true;
    } catch (error: unknown) {
      result.errors.push(`Failed to import mood: ${errMsg(error,)}`,);
    }
  }

  // ── Import relationships ─────────────────────────────────
  if (data.relationships) {
    for (const rel of data.relationships) {
      try {
        const existing = await relationshipsService.getRelationship(
          actorId,
          rel.targetActorId as string,
          worldId,
        );
        if (existing) {
          await relationshipsService.updateRelationship(actorId, rel.targetActorId as string, worldId, {
            relationshipType: rel.relationshipType as any,
            standing: rel.standing as number,
            trust: rel.trust as number,
            familiarity: rel.familiarity as number,
            metadata: rel.metadata as Record<string, unknown>,
          },);
        } else {
          await relationshipsService.createRelationship({
            actorId,
            targetActorId: rel.targetActorId as string,
            worldId,
            relationshipType: rel.relationshipType as any,
            standing: rel.standing as number,
            trust: rel.trust as number,
            familiarity: rel.familiarity as number,
            isBidirectional: rel.isBidirectional as boolean,
            metadata: rel.metadata as Record<string, unknown>,
          },);
        }
        result.relationshipsImported++;
      } catch (error: unknown) {
        result.errors.push(`Failed to import relationship with "${String(rel.targetActorId,)}": ${errMsg(error,)}`,);
      }
    }
  }

  // ── Import avatars ───────────────────────────────────────
  if (data.avatars) {
    for (const avatar of data.avatars.avatars) {
      try {
        await avatarService.createAvatar({
          actorId,
          assetId: avatar.assetId as string,
          label: avatar.label as string,
          tags: avatar.tags as any,
          isPrimary: avatar.isPrimary as boolean,
          sortOrder: avatar.sortOrder as number,
        },);
        result.avatarsImported++;
      } catch (error: unknown) {
        result.errors.push(`Failed to import avatar "${String(avatar.label,)}": ${errMsg(error,)}`,);
      }
    }

    if (data.avatars.config) {
      try {
        await avatarService.upsertAvatarConfig(actorId, {
          selectionRule: data.avatars.config.selectionRule as any,
          weights: data.avatars.config.weights as any,
          fallbackChain: data.avatars.config.fallbackChain as any,
        },);
      } catch (error: unknown) {
        result.errors.push(`Failed to import avatar config: ${errMsg(error,)}`,);
      }
    }
  }

  // ── Import licensing ─────────────────────────────────────
  if (data.licensing) {
    try {
      const existing = await db.selectFrom("character_licensing",).where("actor_id", "=", actorId,).select("id",)
        .executeTakeFirst();
      const now = new Date().toISOString();
      if (existing) {
        await db.updateTable("character_licensing",).set({
          license_type: data.licensing.licenseType as any,
          custom_license_text: (data.licensing.customLicenseText as string) ?? null,
          attribution: (data.licensing.attribution as string) ?? null,
          allow_derivatives: (data.licensing.allowDerivatives as number) ?? 1,
          allow_commercial: (data.licensing.allowCommercial as number) ?? 1,
          share_alike: (data.licensing.shareAlike as number) ?? 0,
          updated_at: now,
        },).where("actor_id", "=", actorId,).execute();
      } else {
        await db.insertInto("character_licensing",).values({
          id: crypto.randomUUID(),
          actor_id: actorId,
          license_type: data.licensing.licenseType as any,
          custom_license_text: (data.licensing.customLicenseText as string) ?? null,
          attribution: (data.licensing.attribution as string) ?? null,
          allow_derivatives: (data.licensing.allowDerivatives as number) ?? 1,
          allow_commercial: (data.licensing.allowCommercial as number) ?? 1,
          share_alike: (data.licensing.shareAlike as number) ?? 0,
          created_at: now,
          updated_at: now,
        },).execute();
      }
      result.licensingImported = true;
    } catch (error: unknown) {
      result.errors.push(`Failed to import licensing: ${errMsg(error,)}`,);
    }
  }

  // ── Import availability ──────────────────────────────────
  if (data.availability) {
    try {
      const existing = await db.selectFrom("character_availability",).where("actor_id", "=", actorId,).select("id",)
        .executeTakeFirst();
      const now = new Date().toISOString();
      if (existing) {
        await db.updateTable("character_availability",).set({
          status: data.availability.status as any,
          usage_policy: JSON.stringify(data.availability.usagePolicy ?? {},),
          activity_restrictions: JSON.stringify(data.availability.activityRestrictions ?? {},),
          content_policy: JSON.stringify(data.availability.contentPolicy ?? {},),
          nsfw_policy: JSON.stringify(data.availability.nsfwPolicy ?? {},),
          updated_at: now,
        },).where("actor_id", "=", actorId,).execute();
      } else {
        await db.insertInto("character_availability",).values({
          id: crypto.randomUUID(),
          actor_id: actorId,
          status: data.availability.status as any,
          usage_policy: JSON.stringify(data.availability.usagePolicy ?? {},),
          activity_restrictions: JSON.stringify(data.availability.activityRestrictions ?? {},),
          content_policy: JSON.stringify(data.availability.contentPolicy ?? {},),
          nsfw_policy: JSON.stringify(data.availability.nsfwPolicy ?? {},),
          created_at: now,
          updated_at: now,
        },).execute();
      }
      result.availabilityImported = true;
    } catch (error: unknown) {
      result.errors.push(`Failed to import availability: ${errMsg(error,)}`,);
    }
  }

  return result;
}
