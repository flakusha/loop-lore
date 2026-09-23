// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Question answer side effects.
 *
 * Applies a question's `effect` JSON best-effort: a missing quest/item or an
 * illegal quest transition skips the effect (logged) instead of failing the
 * answer. Applied effects are reported as human-readable labels plus chat
 * message fragments describing what happened.
 */
import type { Kysely, } from "kysely";
import { ItemVisibility, QuestStatus, } from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import {
  requireQuestTransition,
  upsertQuestProgress,
} from "../../story/shared/quest-engine-utils";
import { uid, } from "../../utils";
import { getRpgLog, } from "../shared/rpg-service-utils";
import type { QuestionEffect, } from "./types";

/** */
function getLog() {
  return getRpgLog("questions:effects",);
}

/** Outcome of applying a question's effect. */
export interface AppliedEffects {
  /** Machine-ish labels, e.g. `quest:<id>:progress`, `item:<id>`. */
  effectsApplied: string[];
  /** Human-readable chat message fragments, e.g. `Quest "X" progress 3/5`. */
  messageParts: string[];
}

/**
 * Apply a question's effect on behalf of the answering actor.
 * @param db - Database handle.
 * @param chatId - Chat the question belongs to (progress-row scope).
 * @param answeredBy - Actor id receiving granted items.
 * @param effect - Parsed effect JSON (`{}` = no-op).
 * @returns The labels and message fragments of everything that applied.
 */
export async function applyQuestionEffects(
  db: Kysely<DB>,
  chatId: string,
  answeredBy: string,
  effect: QuestionEffect,
): Promise<AppliedEffects> {
  const effectsApplied: string[] = [];
  const messageParts: string[] = [];

  let grantedWorldId: string | null = null;
  if (effect.quest?.questId) {
    grantedWorldId = await applyQuestEffect(
      db,
      chatId,
      effect.quest,
      effectsApplied,
      messageParts,
    );
  }

  if (effect.grantItemId) {
    await applyItemGrant(
      db,
      chatId,
      answeredBy,
      effect.grantItemId,
      grantedWorldId,
      effectsApplied,
      messageParts,
    );
  }

  return { effectsApplied, messageParts, };
}

/**
 * Advance or complete a quest, mirroring the quest engine's
 * progress-apply semantics (delta clamped at the quest target).
 * @returns The quest's world id when the effect applied, else `null`.
 */
async function applyQuestEffect(
  db: Kysely<DB>,
  chatId: string,
  questEffect: NonNullable<QuestionEffect["quest"]>,
  effectsApplied: string[],
  messageParts: string[],
): Promise<string | null> {
  const quest = await db.selectFrom("quests",).selectAll()
    .where("id", "=", questEffect.questId,).executeTakeFirst();
  if (!quest) {
    getLog().warn("Question effect: quest not found", { questId: questEffect.questId, },);
    return null;
  }

  try {
    const delta = questEffect.progressDelta ?? 0;
    const newProgress = Math.min(quest.progress + delta, quest.target,);
    const completed = questEffect.complete === true || newProgress >= quest.target;

    if (completed) {
      // Completion is a status transition — an already-terminal quest skips
      // the effect instead of failing the answer (best-effort).
      await requireQuestTransition(db, quest.id, QuestStatus.Completed,);
    }

    await db.updateTable("quests",)
      .set({
        progress: newProgress,
        ...(completed && {
          status: QuestStatus.Completed,
          completed_at: new Date().toISOString(),
        }),
      },)
      .where("id", "=", quest.id,)
      .execute();

    await upsertQuestProgress(db, quest.id, chatId, newProgress, completed,);

    if (delta !== 0) {
      effectsApplied.push(`quest:${quest.id}:progress`,);
      messageParts.push(`Quest "${quest.name}" progress ${newProgress}/${quest.target}`,);
    }
    if (completed) {
      effectsApplied.push(`quest:${quest.id}:complete`,);
      messageParts.push(`Quest "${quest.name}" completed`,);
    }
    return quest.world_id;
  } catch (error) {
    getLog().warn("Question effect: quest update skipped", {
      questId: quest.id,
      error: error instanceof Error ? error.message : String(error,),
    },);
    return null;
  }
}

/**
 * Grant an item definition to the answering actor's inventory as a
 * `world_items` instance (same pattern as loot `giveToNpc`).
 * @param chatWorldId - World id resolved for the quest effect, if any.
 */
async function applyItemGrant(
  db: Kysely<DB>,
  chatId: string,
  answeredBy: string,
  grantItemId: string,
  chatWorldId: string | null,
  effectsApplied: string[],
  messageParts: string[],
): Promise<void> {
  const item = await db.selectFrom("items",).selectAll()
    .where("id", "=", grantItemId,).executeTakeFirst();
  if (!item) {
    getLog().warn("Question effect: item definition not found", { grantItemId, },);
    return;
  }

  // Prefer the quest's world; fall back to the chat's world.
  let worldId = chatWorldId;
  if (!worldId) {
    const chat = await db.selectFrom("chats",).select("world_id",)
      .where("id", "=", chatId,).executeTakeFirst();
    worldId = chat?.world_id ?? null;
  }
  if (!worldId) {
    getLog().warn("Question effect: no world context for item grant", {
      chatId,
      grantItemId,
    },);
    return;
  }

  await db.insertInto("world_items",).values({
    id: uid(),
    world_id: worldId,
    item_id: item.id,
    owner_actor_id: answeredBy,
    quantity: 1,
    location_id: null,
    visibility: ItemVisibility.Visible,
    respawnable: 0,
    spawn_condition: null,
  },).execute();

  effectsApplied.push(`item:${item.id}`,);
  messageParts.push(`Received: ${item.name}`,);
}
