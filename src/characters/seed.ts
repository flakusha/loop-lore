// src/characters/seed.ts — Character template seeder
//
// Seeds default characters from config on app start.
// Idempotent: checks by display_name + owner_id before insert.
// Never overrides existing DB records.
// Supports hard IDs for deterministic test reseeding.

import type { Kysely, } from "kysely";
import { readFileSync, } from "node:fs";
import { basename, } from "node:path";
import { createAsset, mimeFromExtension, } from "../assets/service";
import type { CharactersConfig, } from "../config/schema";
import { UserRole, UserStatus, } from "../db/enums";
import { TraitCategory, } from "../db/enums-character";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { safeJsonStringify, uid, } from "../utils";
import { AvatarService, } from "./services/avatar-service";
import { TraitsService, } from "./services/traits-service";

interface SeedResult {
  created: number;
  skipped: number;
  errors: string[];
}

/**
 * Normalize a species/race value for consistent storage.
 * Trims whitespace and title-cases each word (e.g. "high elf" -> "High Elf").
 * Matching in `isLoreVisibleTo` is case-insensitive, so this is for display/consistency.
 */
function normalizeSpecies(value: string,): string {
  return value
    .trim()
    .replace(/\s+/g, " ",)
    .replace(/\S+/g, (w,) => w[0]!.toUpperCase() + w.slice(1,).toLowerCase(),);
}

/** Resolved avatar image for seeding. */
interface ResolvedAvatar {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

/**
 * Resolve a template avatar source to image bytes.
 * `file` reads the bundled image from disk (path resolved relative to cwd).
 * `default` produces a minimal deterministic SVG placeholder so the wiring is always exercised.
 * Returns null when a `file` source cannot be read.
 */
function resolveTemplateAvatar(
  source: NonNullable<CharactersConfig["templates"][number]["avatar"]>,
): ResolvedAvatar | null {
  if (source.type === "file") {
    try {
      const buffer = readFileSync(source.path,);
      const mimeType = mimeFromExtension(source.path,);
      return { buffer, mimeType, filename: basename(source.path,), };
    } catch {
      return null;
    }
  }
  // type === "default" — deterministic SVG placeholder
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">' +
    '<rect width="256" height="256" fill="#4b5563"/>' +
    '<circle cx="128" cy="104" r="52" fill="#d1d5db"/>' +
    '<path d="M32 240c12-52 56-76 96-76s84 24 96 76z" fill="#d1d5db"/></svg>';
  return { buffer: Buffer.from(svg, "utf8",), mimeType: "image/svg+xml", filename: "default-avatar.svg", };
}

/** Stable id for the system user that owns assets of ownerless (system-seeded) characters. */
const SYSTEM_USER_ID = "system-user";

/**
 * Ensure a system user row exists (idempotent) to satisfy the `assets.owner_id`
 * FK (`NOT NULL references users.id`) when a seeded character has no real owner.
 * Returns the id to use as the asset owner.
 */
async function ensureSystemUser(database: Kysely<DB>,): Promise<string> {
  const existing = await database.selectFrom("users",).select("id",).where("id", "=", SYSTEM_USER_ID,)
    .executeTakeFirst();
  if (existing) { return existing.id; }
  await database
    .insertInto("users",)
    .values({
      id: SYSTEM_USER_ID,
      username: "system",
      display_name: "System",
      password_hash: null,
      role: UserRole.Admin,
      status: UserStatus.Active,
      settings: "{}",
      format_version: 0,
    },)
    .execute();
  return SYSTEM_USER_ID;
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
  const logger = getLogger();
  const result: SeedResult = { created: 0, skipped: 0, errors: [], };

  if (!config.enabled || config.templates.length === 0) {
    return result;
  }

  const traits = new TraitsService(database,);
  const avatars = new AvatarService(database,);

  for (const template of config.templates) {
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
        continue;
      }

      // Use hard ID if provided, otherwise generate
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
          content_rating: template.content_rating ?? "sfw",
          settings,
          import_spec: "template",
          data_source_format: "json",
          data_raw: null,
          format_version: 0,
        },)
        .execute();

      // Persist identity traits (species/subrace/gender/age -> identity, homeland/culture -> background)
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

      // Create + link avatar if the template specifies one and an uploadDir is available
      if (template.avatar && uploadDir) {
        const resolved = await resolveTemplateAvatar(template.avatar,);
        if (resolved) {
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
      }

      result.created++;
      logger.info("seeded character template", { module: "characters", name: template.name, id, },);
    } catch (error_) {
      const error = error_ instanceof Error ? error_ : new Error(String(error_,),);
      result.errors.push(`${template.name}: ${error.message}`,);
      logger.error("failed to seed character template", error, { module: "characters", name: template.name, },);
    }
  }

  return result;
}

/**
 * Merge built-in defaults with user config templates.
 * User templates override built-in by name (case-insensitive).
 *
 * @param defaults - Built-in character templates
 * @param userTemplates - User config templates
 * @returns Merged templates
 */
export function mergeCharacterTemplates(
  defaults: CharactersConfig["templates"],
  userTemplates: CharactersConfig["templates"],
): CharactersConfig["templates"] {
  const merged = new Map<string, CharactersConfig["templates"][number]>();

  // Add built-in defaults first
  for (const template of defaults) {
    merged.set(template.name.toLowerCase(), template,);
  }

  // User templates override built-in by name
  for (const template of userTemplates) {
    merged.set(template.name.toLowerCase(), template,);
  }

  return Array.from(merged.values(),);
}
