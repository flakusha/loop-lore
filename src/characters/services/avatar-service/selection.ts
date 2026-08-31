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

/**
 * Select the best avatar based on context.
 * @param db
 * @param actorId
 * @param context
 * @param worldId
 */
export async function selectAvatar(
  db: Kysely<DB>,
  actorId: string,
  context: AvatarSelectionContext,
  worldId?: string,
): Promise<Avatar> {
  const avatars = await getAvatars(db, actorId,);
  if (avatars.length === 0) {
    throw new Error(`No avatars found for actor ${actorId}`,);
  }

  // Get config (world-specific or default)
  const worldConfig = worldId
    ? await getWorldAvatarConfig(db, actorId, worldId,)
    : undefined;
  const defaultConfig = await getAvatarConfig(db, actorId,);

  // Merge world-specific overrides with default config
  const selectionRule = worldConfig?.selectionRuleOverride ?? defaultConfig?.selectionRule ?? "emotion_first";
  const weights = worldConfig?.weightsOverride
    ? { ...defaultConfig?.weights, ...worldConfig.weightsOverride, }
    : defaultConfig?.weights ?? {
      emotion: 0.4,
      mood: 0.3,
      action: 0.2,
      location: 0.1,
      time: 0.05,
      outfit: 0.05,
    };

  // Apply selection rule
  const rule = selectionRule;

  let bestAvatar: Avatar | undefined = avatars[0];
  let bestScore = -1;

  for (const avatar of avatars) {
    const score = calculateAvatarScore(avatar, context, weights, rule,);
    if (score > bestScore) {
      bestScore = score;
      bestAvatar = avatar;
    }
  }

  if (!bestAvatar) {
    throw new Error(`No avatars found for actor ${actorId}`,);
  }

  return bestAvatar;
}

/**
 * Calculate score for an avatar based on context and weights.
 * Iterates over all tag types, comparing context values to avatar tags.
 * @param avatar
 * @param context
 * @param weights
 * @param rule
 */
export function calculateAvatarScore(
  avatar: Avatar,
  context: AvatarSelectionContext,
  weights: Record<AvatarTagType, number>,
  rule: AvatarSelectionRule,
): number {
  let score = 0;

  // Score each tag type
  for (const tag of ALL_TAG_TYPES) {
    const contextValue = context[tag];
    const avatarValue = avatar.tags[tag];
    if (contextValue && avatarValue) {
      const match = avatarValue.toLowerCase() === contextValue.toLowerCase();
      score += match ? weights[tag] * 100 : 0;
    }
  }

  // Apply rule modifiers
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
      // "weighted", "random", "fixed" - no boost
  }

  // Bonus for primary avatar (tiebreaker)
  if (avatar.isPrimary) {
    score += 0.1;
  }

  return score;
}
