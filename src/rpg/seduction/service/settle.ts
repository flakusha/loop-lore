// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { MoodService, } from "../../../characters/services/mood-service";
import type { SeductionSkillCategory, } from "../../../db/enums";
import { ContentIntensity, } from "../../../db/enums-character/nsfw";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { logXp, } from "../../service/xp";
import { modifyArousal, } from "./arousal";
import { awardXp, } from "./skills";
import type { SeductionSkill, } from "./types";

/**
 * Settle a resolved attempt: arousal, dual XP, and mood follow-through.
 *
 * Best-effort on the mood event — a missing mood row must not fail the
 * attempt outcome.
 * @param args
 */
export async function settleAttempt(args: {
  db: Kysely<DB>;
  log: ReturnType<typeof getLogger>;
  actorId: string;
  targetId: string;
  skillCategory: SeductionSkillCategory;
  worldId?: string | null;
  relevantSkill: SeductionSkill | undefined;
  success: boolean;
  arousalDelta: number;
  xpGained: number;
  /** Content-intensity tier bounding the arousal ceiling (TASK-034). */
  intensityTier?: ContentIntensity;
},): Promise<void> {
  const {
    db,
    log,
    actorId,
    targetId,
    skillCategory,
    worldId,
    relevantSkill,
    success,
    arousalDelta,
    xpGained,
    intensityTier,
  } = args;
  // Apply arousal change to target (TASK-034): tier ceiling enforced.
  if (arousalDelta !== 0) {
    await modifyArousal(db, targetId, arousalDelta, worldId, `seduction:${skillCategory}`, intensityTier,);
  }

  // Award skill XP (category granularity) + shared-ledger XP (TASK-040).
  // Record the category skill first, then mirror to the shared ledger.
  if (relevantSkill) {
    await awardXp(db, actorId, skillCategory, relevantSkill.name, xpGained,);
    await logXp({ database: db, }, {
      actorId,
      amount: xpGained,
      source: "nsfw_seduction",
      description: `Seduction ${success ? "success" : "failure"} (${skillCategory})`,
      chatId: undefined,
    },);
  }

  // Mood follow-through (TASK-041): one source-tagged event on the target.
  try {
    const mood = MoodService(db,);
    await mood.logEvent({
      actorId: targetId,
      worldId: worldId ?? undefined,
      eventType: success ? "seduction.success" : "seduction.failure",
      happinessDelta: success ? 2 : -1,
      source: "seduction",
      sourceId: `${actorId}:${skillCategory}`,
    },);
  } catch (cause) {
    log.warn(`Mood follow-through skipped for ${targetId}:`, {
      error: cause instanceof Error ? cause.message : String(cause,),
    },);
  }
}
