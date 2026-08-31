// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Emotion Avatar Fallback Utilities
 *
 * Provides metadata extraction and prompt construction for the
 * generation fallback path (txt2img when img2img is unavailable).
 * @module characters/services/emotion-avatar-fallback
 */

import type { Kysely, } from "kysely";
import { getAsset, } from "../../assets/service";
import type { EmotionType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { safeJsonParse, } from "../../utils/safe-json";

/**
 * Metadata extracted from an avatar image for prompt construction.
 */
export interface AvatarMetadata {
  /** Image caption (from metadata or alt text) */
  caption?: string;
  /** Alt text provided by user */
  altText?: string;
  /** Asset tags (style, setting, etc.) */
  tags?: Record<string, string>;
  /** Original generation prompt (if available) */
  generationPrompt?: string;
  /** Image dimensions */
  width?: number;
  height?: number;
}

/**
 * Quality tags to append to generated prompts.
 */
const DEFAULT_QUALITY_TAGS = "high quality, detailed, sharp focus, professional";

/**
 * Options for {@link extractAvatarMetadata}.
 *
 * When `actorId` is supplied, the character description is fetched as a
 * caption anchor and the matching `character_avatars` row's `tags` JSON is
 * surfaced. Without `actorId`, the function is a drop-in for its previous
 * signature.
 */
export interface ExtractAvatarMetadataOpts {
  actorId?: string;
}

/**
 * Extract metadata from an avatar's asset for prompt construction.
 *
 * Pulls caption, tags, alt text, and image dimensions from the asset row
 * and (when `opts.actorId` is provided) the character description and the
 * matching `character_avatars.tags` JSON.
 * @param db - Database instance
 * @param assetId - Asset ID to extract metadata from
 * @param opts - Optional extractor knobs; pass `actorId` to enable the
 *               description + tags lookup.
 * @returns Extracted metadata (always shaped `AvatarMetadata`; absent
 *          fields are undefined, never `null`)
 */
export async function extractAvatarMetadata(
  db: Kysely<DB>,
  assetId: string,
  opts: ExtractAvatarMetadataOpts = {},
): Promise<AvatarMetadata> {
  const asset = await getAsset(db, assetId,);

  if (!asset) {
    return {};
  }

  // asset.alt_text wins over any character-derived caption; if absent, fall
  // back to actors.description when the caller knows the actor.
  let caption: string | undefined = asset.alt_text ?? undefined;
  let tags: Record<string, string> | undefined;

  if (opts.actorId) {
    if (!caption) {
      const actor = await db
        .selectFrom("actors",)
        .select("description",)
        .where("id", "=", opts.actorId,)
        .executeTakeFirst();
      if (actor?.description) {
        caption = actor.description;
      }
    }

    const avatarRow = await db
      .selectFrom("character_avatars",)
      .select("tags",)
      .where("actor_id", "=", opts.actorId,)
      .where("asset_id", "=", assetId,)
      .executeTakeFirst();
    if (avatarRow) {
      const parsed = safeJsonParse<Record<string, unknown>>(avatarRow.tags,);
      if (parsed.ok && parsed.value && typeof parsed.value === "object" && !Array.isArray(parsed.value,)) {
        const sanitized: Record<string, string> = {};
        for (const [k, v,] of Object.entries(parsed.value,)) {
          if (typeof v === "string") { sanitized[k] = v; }
        }
        tags = sanitized;
      }
    }
  }
  // Drop-in compat: only surface `tags` when the caller passed `actorId`,
  // otherwise callers using the old single-arg signature get an unchanged
  // shape (no `tags: undefined` key).
  return tags !== undefined
    ? {
      caption,
      altText: asset.alt_text ?? undefined,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
      tags,
    }
    : {
      caption,
      altText: asset.alt_text ?? undefined,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
    };
}

/**
 * Build a prompt for emotion avatar generation from metadata.
 *
 * Combines original character description with emotion-specific modifier
 * and quality tags to create a txt2img prompt.
 * @param metadata - Avatar metadata extracted from asset
 * @param _emotion - Target emotion type (unused, kept for API consistency)
 * @param emotionModifier - Emotion-specific prompt modifier
 * @param qualityTags - Quality tags to append (defaults to standard quality tags)
 * @returns Constructed prompt string
 */
export function buildEmotionPrompt(
  metadata: AvatarMetadata,
  _emotion: EmotionType,
  emotionModifier: string,
  qualityTags: string = DEFAULT_QUALITY_TAGS,
): string {
  const parts: string[] = [];

  // Start with character description if available
  if (metadata.caption) {
    parts.push(metadata.caption,);
  } else if (metadata.altText) {
    parts.push(metadata.altText,);
  } else {
    // Fallback to generic portrait description
    parts.push("character portrait",);
  }

  // Add emotion modifier + quality tags
  parts.push(emotionModifier, qualityTags,);

  return parts.join(", ",);
}
