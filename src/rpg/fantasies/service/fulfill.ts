// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { MoodService, } from "../../../characters/services/mood-service";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { IntimacyService, } from "../../intimacy/service";
import { recordExploration as recordExplorationCrud, } from "./crud";
import { getRow, } from "./row";
import type {
  Fantasy,
  FulfillmentEffects,
} from "./types";

/**
 * Fulfill a fantasy for a target: applies the stored fulfillment
 * effects (intimacy bonus via the canonical pair path, mood bonus via
 * one source-tagged event) and counts the exploration. Returns the
 * fulfillment effects so encounter narration can consume them.
 *
 * Disclosure stays per-actor: fantasies are keyed on the owning actor
 * (actor_id), never global — `forTarget` only scopes the effect legs.
 * Extreme intensities (intense/extreme) emit a content-warning log
 * before fulfillment; the fulfillment still proceeds (warning, not
 * filter — Open Q5).
 * @param db
 * @param fantasyId
 * @param forTarget
 */
export async function fulfillFantasy(
  db: Kysely<DB>,
  fantasyId: string,
  forTarget?: { actorId: string; worldId?: string | null },
): Promise<FulfillmentEffects | null> {
  const row = await db
    .selectFrom("character_fantasies",)
    .where("id", "=", fantasyId,)
    .selectAll()
    .executeTakeFirst();
  if (!row) { return null; }
  const log = getLogger().child({ module: "fantasies", },);
  const fantasy = getRow(row as any,);
  if (fantasy.intensity === "intense" || fantasy.intensity === "extreme") {
    log.warn(`nsfw.content_warning: fulfilling ${fantasy.intensity} fantasy "${fantasy.name}" (${fantasy.category})`,);
  }
  const target = forTarget?.actorId ?? fantasy.actorId;
  const effects = fantasy.fulfillmentEffects;
  await applyFulfillIntimacy(db, log, fantasy, forTarget, effects,);
  await applyFulfillMood(db, log, fantasy, forTarget, target, effects,);
  await recordExplorationCrud(db, fantasyId,);
  return effects;
}

/**
 * Intimacy leg of fulfillment: pair bonus toward the owning actor.
 * Skipped when the target IS the owner (no self-pair) or the bonus
 * is zero. Best-effort: failures only warn.
 * @param db
 * @param log
 * @param fantasy
 * @param forTarget
 * @param effects
 */
async function applyFulfillIntimacy(
  db: Kysely<DB>,
  log: ReturnType<typeof getLogger>,
  fantasy: Fantasy,
  forTarget: { actorId: string; worldId?: string | null } | undefined,
  effects: FulfillmentEffects,
): Promise<void> {
  const target = forTarget?.actorId ?? fantasy.actorId;
  if (effects.intimacyBonus === 0 || target === fantasy.actorId) { return; }
  try {
    const intimacy = new IntimacyService(db,);
    await intimacy.applyAction({
      database: db,
      actorId: target,
      targetActorId: fantasy.actorId,
      worldId: forTarget?.worldId ?? null,
      action: {
        id: `fantasy:${fantasy.id}`,
        name: `Fantasy fulfilled: ${fantasy.name}`,
        type: "intimate",
        delta: effects.intimacyBonus,
        minIntimacy: 0,
        requiresConsent: false,
      },
    },);
  } catch (cause) {
    log.warn(`Fantasy intimacy leg skipped for ${target}:`, {
      error: cause instanceof Error ? cause.message : String(cause,),
    },);
  }
}

/**
 * Mood leg of fulfillment: one source-tagged `fantasy.fulfilled`
 * event on the target. Best-effort: failures only warn.
 * @param db
 * @param log
 * @param fantasy
 * @param forTarget
 * @param target
 * @param effects
 */
async function applyFulfillMood(
  db: Kysely<DB>,
  log: ReturnType<typeof getLogger>,
  fantasy: Fantasy,
  forTarget: { actorId: string; worldId?: string | null } | undefined,
  target: string,
  effects: FulfillmentEffects,
): Promise<void> {
  if (effects.moodBonus === 0) { return; }
  try {
    const mood = MoodService(db,);
    await mood.logEvent({
      actorId: target,
      worldId: forTarget?.worldId ?? undefined,
      eventType: "fantasy.fulfilled",
      happinessDelta: effects.moodBonus,
      source: "fantasy",
      sourceId: `${fantasy.id}:${fantasy.category}`,
    },);
  } catch (cause) {
    log.warn(`Fantasy mood leg skipped for ${target}:`, {
      error: cause instanceof Error ? cause.message : String(cause,),
    },);
  }
}
