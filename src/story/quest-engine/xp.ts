// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Quest-completion XP leg (FEAT-xp-sources).
 *
 * Completing a quest awards character XP to the quest's creator through the
 * shared LevelService pipeline. Best-effort by contract: a failed grant is
 * logged and swallowed so quest completion never fails because bookkeeping
 * did. Idempotency rides on the (actor, `quest`, quest id) ledger key, so
 * both completion paths (quest-engine progress and the /quest command) can
 * safely award through this one leg.
 */
import type { Kysely, } from "kysely";
import { QuestCategory, } from "../../db/enums";
import type { DB, } from "../../db/schema.js";
import { getLogger, } from "../../logger";
import { awardXpToActor, } from "../../rpg/level/index.js";
import { getCharacterStats, } from "../../rpg/service/character-stats.js";
import { xpForQuest, XpSource, } from "../../rpg/xp/sources.js";

/** Minimal quest projection the XP leg needs. */
export interface QuestXpSource {
  id: string;
  name: string;
  creator_id: string;
  category?: string | null;
}

/**
 * Award quest-completion XP to the quest creator.
 * @param db
 * @param quest
 * @returns {Promise<void>}
 */
export async function awardQuestCompletionXp(
  db: Kysely<DB>,
  quest: QuestXpSource,
): Promise<void> {
  const log = getLogger().child({ module: "quest-engine", },);
  try {
    if (!quest.creator_id) { return; }

    // character_stats / xp_ledger carry no FK to actors: a dangling
    // creator_id (deleted or never-existing actor) would bootstrap a ghost
    // sheet and pay out. Verify existence before awarding.
    const creator = await db
      .selectFrom("actors",)
      .select("id",)
      .where("id", "=", quest.creator_id,)
      .executeTakeFirst();

    if (!creator) {
      log.debug("Quest completion XP skipped: creator actor does not exist", {
        questId: quest.id,
        actorId: quest.creator_id,
      },);

      return;
    }

    // Read (never ensure) the creator's sheet for the payout level: the
    // award pipeline bootstraps missing rows inside its own transaction, so
    // a concurrent completion cannot duplicate the sheet here.
    const stats = await getCharacterStats({ database: db, }, quest.creator_id,);
    const difficulty = difficultyForCategory(quest.category,);
    const amount = xpForQuest(stats?.level ?? 1, difficulty,);

    await awardXpToActor(db, {
      actorId: quest.creator_id,
      amount,
      source: XpSource.Quest,
      referenceId: quest.id,
      description: `Quest completed: ${quest.name}`,
    },);

    log.debug("Quest completion XP granted", {
      questId: quest.id,
      actorId: quest.creator_id,
      amount,
    },);
  } catch (cause) {
    log.warn(`Quest completion XP skipped for ${quest.id}:`, {
      error: cause instanceof Error ? cause.message : String(cause,),
    },);
  }
}

/**
 * Map the quest's narrative category onto the XP difficulty ladder.
 * @param category
 */
function difficultyForCategory(
  category: string | null | undefined,
): "easy" | "medium" | "hard" {
  switch (category) {
    case QuestCategory.Main: {
      return "hard";
    }

    case QuestCategory.Bounty:
    case QuestCategory.Daily: {
      return "easy";
    }

    default: {
      return "medium";
    }
  }
}
