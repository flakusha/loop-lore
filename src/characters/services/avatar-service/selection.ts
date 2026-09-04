// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { AvatarSelectionRule, AvatarTagType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { getAvatarConfig, } from "./config";
import { getAvatars, } from "./crud";
import type { Avatar, AvatarSelectionContext, } from "./types";
import { getWorldAvatarConfig, } from "./world-config";

/** All tag types for iteration */
const ALL_TAG_TYPES: AvatarTagType[] = ["emotion", "mood", "action", "location", "time", "outfit",];

/** Default fallback chain used when no avatar_config is set. */
const DEFAULT_FALLBACK_CHAIN: AvatarTagType[] = ["emotion", "mood", "action", "location", "time", "outfit",];

/**
 * Resolve a base avatar for an actor that has zero emotion avatars.
 *
 * Returns the synthesized base `Avatar` when the actor has a base asset;
 * returns `null` when neither emotion avatars nor a base asset exist.
 * BUG-avatar-select-empty-throws-no-frontend-fallback.
 */
async function resolveBaseAvatar(
  db: Kysely<DB>,
  actorId: string,
): Promise<Avatar | null> {
  const actor = await db
    .selectFrom("actors",)
    .select(["id", "avatar_asset_id", "created_at", "updated_at",],)
    .where("id", "=", actorId,)
    .executeTakeFirst();
  if (!actor?.avatar_asset_id) { return null; }
  const now = new Date().toISOString();
  return {
    id: `base:${actorId}`,
    actorId,
    assetId: actor.avatar_asset_id,
    label: "base portrait",
    tags: {},
    isPrimary: true,
    sortOrder: -1,
    createdAt: actor.created_at,
    updatedAt: actor.updated_at ?? now,
  };
}

/**
 * Select the best avatar based on context.
 *
 * Resolution order:
 *  1. Empty-list: zero emotion avatars → return base portrait (or null).
 *  2. Primary pass: weighted-score ≥ 1 → return that avatar.
 *  3. Fallback chain: when primary score is below 1 (no tag actually
 *     matched), walk `fallback_chain` and pick the first avatar that has
 *     a value for that chain tag at all (tag-presence, not value-match).
 *  4. Base portrait: when chain yields nothing, return base portrait.
 *
 * BUG-avatar-select-fallback-chain-unwired.
 */
export async function selectAvatar(
  db: Kysely<DB>,
  actorId: string,
  context: AvatarSelectionContext,
  worldId?: string,
): Promise<Avatar | null> {
  const avatars = await getAvatars(db, actorId,);
  if (avatars.length === 0) {
    return resolveBaseAvatar(db, actorId,);
  }

  const worldConfig = worldId
    ? await getWorldAvatarConfig(db, actorId, worldId,)
    : undefined;
  const defaultConfig = await getAvatarConfig(db, actorId,);

  const selectionRule: AvatarSelectionRule = worldConfig?.selectionRuleOverride ??
    defaultConfig?.selectionRule ??
    "emotion_first";
  const weights: Record<AvatarTagType, number> = worldConfig?.weightsOverride
    ? { ...defaultConfig?.weights, ...worldConfig.weightsOverride, }
    : defaultConfig?.weights ?? {
      emotion: 0.4,
      mood: 0.3,
      action: 0.2,
      location: 0.1,
      time: 0.05,
      outfit: 0.05,
    };
  const fallbackChain: AvatarTagType[] = defaultConfig?.fallbackChain ??
    DEFAULT_FALLBACK_CHAIN;

  let primaryAvatar: Avatar | undefined;
  let primaryScore = -1;
  for (const avatar of avatars) {
    const score = calculateAvatarScore(avatar, context, weights, selectionRule,);
    if (score > primaryScore) {
      primaryScore = score;
      primaryAvatar = avatar;
    }
  }

  // Threshold of 1.0: at least one tag type must have matched (the
  // isPrimary 0.1 tiebreak alone is not enough to claim a winner). Below
  // the threshold we treat the primary pass as inconclusive and defer to
  // the fallback chain.
  if (primaryScore >= 1 && primaryAvatar) {
    return primaryAvatar;
  }

  // Fallback chain walk: pick the first avatar that has a value for each
  // chain tag in order. This is tag-presence based — the chain decides
  // which tag type is most authoritative when the weighted-score pass
  // cannot produce a clear winner.
  for (const tag of fallbackChain) {
    const match = avatars.find((a,) => typeof a.tags[tag] === "string" && a.tags[tag].length > 0);
    if (match) { return match; }
  }

  return resolveBaseAvatar(db, actorId,);
}

/**
 * Calculate score for an avatar based on context and weights.
 */
export function calculateAvatarScore(
  avatar: Avatar,
  context: AvatarSelectionContext,
  weights: Record<AvatarTagType, number>,
  rule: AvatarSelectionRule,
): number {
  let score = 0;

  for (const tag of ALL_TAG_TYPES) {
    const contextValue = context[tag];
    const avatarValue = avatar.tags[tag];
    if (contextValue && avatarValue) {
      const match = avatarValue.toLowerCase() === contextValue.toLowerCase();
      score += match ? weights[tag] * 100 : 0;
    }
  }

  switch (rule) {
    case "emotion_first":
      if (context.emotion && avatar.tags.emotion) { score *= 1.5; }
      break;
    case "mood_first":
      if (context.mood && avatar.tags.mood) { score *= 1.5; }
      break;
    case "action_first":
      if (context.action && avatar.tags.action) { score *= 1.5; }
      break;
    case "context_first":
      if (
        context.location && avatar.tags.location === context.location ||
        context.time && avatar.tags.time === context.time
      ) { score *= 1.5; }
      break;
  }

  if (avatar.isPrimary) {
    score += 0.1;
  }

  return score;
}
