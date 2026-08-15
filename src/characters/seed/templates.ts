// src/characters/seed/templates.ts — Character template seeding logic

import type { Kysely, } from "kysely";
import { createAsset, } from "../../assets/service";
import type { CharactersConfig, } from "../../config/schema";
import type { CharacterTemplate, } from "../../config/sections/characters/types";
import { TraitCategory, } from "../../db/enums-character";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { safeJsonStringify, uid, } from "../../utils";
import { AvatarService, } from "../services/avatar-service";
import { TraitsService, } from "../services/traits-service";
import { ContentRating, } from "../spec";
import { ensureSystemUser, normalizeSpecies, resolveTemplateAvatar, } from "./avatar";

interface SeedResult {
  created: number;
  skipped: number;
  errors: string[];
}

/**
 * Seed default characters from config templates.
 * Runs on app start — idempotent (skips existing by name+owner).
 * Supports hard IDs for deterministic test reseeding.
 *
 * @param database - Kysely DB instance
 * @param config - Characters config section
 * @param ownerId - Owner ID for seeded characters (system user or null)
 * @param uploadDir - Upload directory for seeded avatar assets (required only when a template sets `avatar`)
 * @returns Seed result with counts
 */
export async function seedCharacterTemplates(
  database: Kysely<DB>,
  config: CharactersConfig,
  ownerId: string | null = null,
  uploadDir?: string,
): Promise<SeedResult> {
  const result: SeedResult = { created: 0, skipped: 0, errors: [], };

  if (config.enabled && config.templates.length > 0) {
    const traits = TraitsService(database,);
    const avatars = new AvatarService(database,);

    for (const template of config.templates) {
      await seedTemplate(database, template, ownerId, uploadDir, traits, avatars, result,);
    }
  }

  return result;
}

/** Seed a single character template: insert, traits, and avatar link. */
async function seedTemplate(
  database: Kysely<DB>,
  template: CharacterTemplate,
  ownerId: string | null,
  uploadDir: string | undefined,
  traits: ReturnType<typeof TraitsService>,
  avatars: AvatarService,
  result: SeedResult,
): Promise<void> {
  const logger = getLogger();
  try {
    const exists = await database
      .selectFrom("actors",)
      .select("id",)
      .where("display_name", "=", template.name,)
      .where((eb,) =>
        ownerId
          ? eb("owner_id", "=", ownerId,)
          : eb("owner_id", "is", null,)
      )
      .executeTakeFirst();

    if (exists) {
      result.skipped++;
      return;
    }

    const id = template.id ?? uid();
    const tags = template.tags ?? [];
    const settingsResult = safeJsonStringify(
      tags.length > 0
        ? { tags, is_template: template.is_template, is_default: template.is_default, }
        : { is_template: template.is_template, is_default: template.is_default, },
    );
    const settings = settingsResult.ok ? settingsResult.value : "{}";

    await database
      .insertInto("actors",)
      .values({
        id,
        actor_type: "character",
        display_name: template.name,
        user_id: ownerId,
        owner_id: ownerId,
        agent_type: "ai",
        description: template.description,
        personality: template.personality ?? null,
        scenario: template.scenario ?? null,
        welcome_message: template.welcome_message ?? null,
        system_prompt: template.system_prompt ?? null,
        mes_example: template.mes_example ?? null,
        creator: template.creator ?? null,
        visibility: template.visibility ?? "public",
        content_rating: template.content_rating ?? ContentRating.Sfw,
        settings,
        import_spec: "template",
        data_source_format: "json",
        data_raw: null,
        format_version: 0,
      },)
      .execute();

    await persistIdentityTraits(traits, id, template,);
    await linkTemplateAvatar(database, uploadDir, ownerId, template, id, avatars,);

    result.created++;
    logger.info("seeded character template", { module: "characters", name: template.name, id, },);
  } catch (error_) {
    const error = error_ instanceof Error ? error_ : new Error(String(error_,),);
    result.errors.push(`${template.name}: ${error.message}`,);
    logger.error("failed to seed character template", error, { module: "characters", name: template.name, },);
  }
}

/** Persist identity traits from a template (species/age/etc). */
async function persistIdentityTraits(
  traits: ReturnType<typeof TraitsService>,
  id: string,
  template: CharacterTemplate,
): Promise<void> {
  const identityTraits: { name: string; value: string; category: string }[] = [];
  if (template.species) {
    identityTraits.push({
      name: "species",
      value: normalizeSpecies(template.species,),
      category: TraitCategory.Identity,
    },);
  }
  if (template.subrace) {
    identityTraits.push({
      name: "subrace",
      value: normalizeSpecies(template.subrace,),
      category: TraitCategory.Identity,
    },);
  }
  if (template.gender) {
    identityTraits.push({ name: "gender", value: template.gender, category: TraitCategory.Identity, },);
  }
  if (template.age !== undefined && template.age !== null) {
    identityTraits.push({ name: "age", value: String(template.age,), category: TraitCategory.Identity, },);
  }
  if (template.homeland) {
    identityTraits.push({
      name: "homeland",
      value: normalizeSpecies(template.homeland,),
      category: TraitCategory.Background,
    },);
  }
  if (template.culture) {
    identityTraits.push({
      name: "culture",
      value: normalizeSpecies(template.culture,),
      category: TraitCategory.Background,
    },);
  }
  for (const t of identityTraits) {
    await traits.createPermanentTrait({ actorId: id, category: t.category, name: t.name, value: t.value, },);
  }
}

/** Create + link a template avatar when one is specified and writable. */
async function linkTemplateAvatar(
  database: Kysely<DB>,
  uploadDir: string | undefined,
  ownerId: string | null,
  template: CharacterTemplate,
  id: string,
  avatars: AvatarService,
): Promise<void> {
  if (!uploadDir || !template.avatar) { return; }
  const resolved = await resolveTemplateAvatar(template.avatar,);
  if (!resolved) { return; }

  // Fill (or backfill) a system user so the asset can satisfy the
  // `assets.owner_id` FK even when the character has no real owner.
  const assetOwner = ownerId ?? (await ensureSystemUser(database,));
  const { asset, } = await createAsset({
    database,
    uploadDir,
    input: {
      ownerId: assetOwner,
      filename: resolved.filename,
      mimeType: resolved.mimeType,
      assetType: "image",
      sizeBytes: resolved.buffer.length,
      buffer: resolved.buffer,
    },
  },);
  await avatars.createAvatar({ actorId: id, assetId: asset.id, label: "default", isPrimary: true, },);
}
