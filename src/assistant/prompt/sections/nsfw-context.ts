// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Context section — injects NSFW-relevant information into prompts.
 *
 * Adds intimacy levels, arousal state, and content rating context
 * when NSFW content is enabled and the chat involves NSFW characters.
 */
import { jsonParseOr, } from "../../../utils";
import type { SectionBuilder, } from "../types";

/** Create an NSFW context section. */
export const nsfwContextSection: SectionBuilder = {
  name: "nsfwContext",
  enabled: (ctx,) => {
    // Only enable if NSFW config is enabled
    return ctx.params.includeStoryContext ?? false;
  },
  build: async (ctx,) => {
    const sections: string[] = [];
    const actorId = ctx.actor.id;
    const worldId = ctx.chat.world_id;
    const database = ctx.db;

    // Get group participants
    const participantIds = ctx.params.groupParticipantIds ?? [];

    // Get intimacy levels with other participants
    for (const participantId of participantIds) {
      const participant = await database
        .selectFrom("actors",)
        .select(["display_name",],)
        .where("id", "=", participantId,)
        .executeTakeFirst();

      const pair = await database
        .selectFrom("character_intimacy",)
        .select(["score",],)
        .where("actor_id", "=", actorId,)
        .where("target_actor_id", "=", participantId,)
        .where("world_id", "is", worldId,)
        .executeTakeFirst();

      if (pair) {
        const level = getLevelLabel(pair.score,);
        sections.push(
          `Intimacy with ${participant?.display_name ?? "Unknown"}: ${pair.score}/100 (${level})`,
        );
      }
    }

    // Get arousal state
    const arousal = await database
      .selectFrom("character_arousal",)
      .select(["level",],)
      .where("actor_id", "=", actorId,)
      .where("world_id", "is", worldId,)
      .executeTakeFirst();

    if (arousal && arousal.level > 0) {
      const arousalLabel = getArousalLabel(arousal.level,);
      sections.push(`Current arousal: ${arousal.level}/100 (${arousalLabel})`,);
    }

    // Get desire profile summary
    const desire = await database
      .selectFrom("character_desire_profile",)
      .select(["turn_ons", "hard_limits",],)
      .where("actor_id", "=", actorId,)
      .executeTakeFirst();

    if (desire) {
      const turnOns = jsonParseOr(desire.turn_ons, [],);
      const hardLimits = jsonParseOr(desire.hard_limits, [],);

      if (turnOns.length > 0) {
        sections.push(`Turn-ons: ${turnOns.join(", ",)}`,);
      }
      if (hardLimits.length > 0) {
        sections.push(`Hard limits: ${hardLimits.join(", ",)}`,);
      }
    }

    if (sections.length === 0) { return []; }

    return [
      {
        role: "system",
        content: [
          "[NSFW Context]",
          ...sections,
          "",
          "Use this context to inform intimate scenes. Respect hard limits absolutely.",
          "Adjust narrative intensity based on arousal and intimacy levels.",
        ].join("\n",),
      },
    ];
  },
};

/**
 * @param score
 */
function getLevelLabel(score: number,): string {
  if (score >= 100) { return "Soulbonded"; }
  if (score >= 85) { return "Intimate"; }
  if (score >= 70) { return "Dating"; }
  if (score >= 55) { return "Romantic Interest"; }
  if (score >= 40) { return "Close Friends"; }
  if (score >= 25) { return "Friends"; }
  if (score >= 10) { return "Acquaintances"; }
  return "Strangers";
}

/**
 * @param level
 */
function getArousalLabel(level: number,): string {
  if (level >= 80) { return "Desperate"; }
  if (level >= 60) { return "Highly Aroused"; }
  if (level >= 40) { return "Aroused"; }
  if (level >= 20) { return "Mildly Aroused"; }
  return "Calm";
}
