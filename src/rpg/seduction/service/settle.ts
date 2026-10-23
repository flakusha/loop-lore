// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import type { Kysely, } from "kysely";
import { MoodService, } from "../../../characters/services/mood-service";
import type { SeductionSkillCategory, } from "../../../db/enums";
import { ContentIntensity, } from "../../../db/enums-character/nsfw";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { awardXpToActor, } from "../../level/index.js";
import { checkMechanicEnabled, RpgMechanic, } from "../../service/world-gate.js";
import { logXp, } from "../../service/xp";
import { XpSource, } from "../../xp/sources";
import { modifyArousal, } from "./arousal";
import { awardXp, } from "./skills";
import type { SeductionSkill, } from "./types";

/**
 * Settle a resolved attempt: arousal, dual XP, and mood follow-through.
 *
 * Best-effort on the mood event — a missing mood row must not fail the
 * attempt outcome.
 * @param args
 * @param args.db
 * @param args.log
 * @param args.actorId
 * @param args.targetId
 * @param args.skillCategory
 * @param args.worldId
 * @param args.relevantSkill
 * @param args.success
 * @param args.arousalDelta
 * @param args.xpGained
 * @param args.intensityTier
 * @returns {Promise<void>}
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
  // Per-world rpg_xp opt-in (FEAT-gate-xp): seduction carries its own worldId,
  // so a denial is a real opt-out. The pipeline call is best-effort like
  // every reward leg; a LevelService rejection falls back to the raw ledger
  // mirror so the seduction payout is never silently lost.
  if (relevantSkill) {
    await awardXp(db, actorId, skillCategory, relevantSkill.name, xpGained,);
    let pipelined = false;
    if (worldId) {
      const gate = await checkMechanicEnabled(db, worldId, RpgMechanic.Xp,);
      if (gate.allowed) {
        try {
          await awardXpToActor(db, {
            actorId,
            amount: xpGained,
            source: XpSource.NsfwSeduction,
            description: `Seduction ${success ? "success" : "failure"} (${skillCategory})`,
            chatId: undefined,
          },);

          pipelined = true;
        } catch (cause) {
          log.warn(`Seduction pipeline XP skipped for ${actorId}, falling back to ledger:`, {
            error: cause instanceof Error ? cause.message : String(cause,),
          },);
        }
      }
    }

    if (!pipelined) {
      await logXp({ database: db, }, {
        actorId,
        amount: xpGained,
        source: XpSource.NsfwSeduction,
        description: `Seduction ${success ? "success" : "failure"} (${skillCategory})`,
        chatId: undefined,
      },);
    }
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
