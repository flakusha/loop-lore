/**
 * Emotion Avatar Fallback Utilities
 *
 * Provides metadata extraction and prompt construction for the
 * generation fallback path (txt2img when img2img is unavailable).
 *
 * @module characters/services/emotion-avatar-fallback
 */

import type { Kysely, } from "kysely";
import { getAsset, } from "../../assets/service";
import type { EmotionType, } from "../../db/enums";
import type { DB, } from "../../db/schema";

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
 * Extract metadata from an avatar's asset for prompt construction.
 *
 * Pulls caption, tags, alt text, and generation prompt from the asset record.
 *
 * @param db - Database instance
 * @param assetId - Asset ID to extract metadata from
 * @returns Extracted metadata
 */
export async function extractAvatarMetadata(
  db: Kysely<DB>,
  assetId: string,
): Promise<AvatarMetadata> {
  const asset = await getAsset(db, assetId,);

  if (!asset) {
    return {};
  }

  return {
    caption: asset.alt_text ?? undefined,
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
 *
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

  // Add emotion modifier
  parts.push(emotionModifier,);

  // Add quality tags
  parts.push(qualityTags,);

  return parts.join(", ",);
}
