// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Reaction Grading — periodic aggregation of message reactions into
 * per-model `model_rankings` rows.
 *
 * G = assistant messages with non-null model_id + provider (the filter
 * also excludes carried/split/merged copies, which drop attribution).
 * R = distinct messages with ≥1 positive reaction. Score = Beta-Binomial
 * posterior mean; below the sample floor the row still appends with
 * `published: false` so the UI shows "unranked — N samples".
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { recordRanking, } from "./rankings";
import { DEFAULT_POSITIVE_EMOJI, isPositiveReaction, MIN_SAMPLE_FLOOR, reactionScore, } from "./reaction-score";

/**
 * Aggregate reactions per (provider, model_id) and append
 * `metric='reaction_rate'` rows (`scope='instance'`, `basis='measured'`).
 * Recomputation appends a new row per model — history is the
 * accumulating evidence.
 * @param db
 * @returns number of models graded
 */
export async function gradeModelsFromReactions(db: Kysely<DB>,): Promise<number> {
  // Denominator: live-generation assistant messages only.
  const denominators = await db
    .selectFrom("messages",)
    .select(["provider", "model_id", db.fn.countAll<number>().as("messages",),],)
    .where("role", "=", "assistant",)
    .where("model_id", "is not", null,)
    .where("provider", "is not", null,)
    .where("visibility", "=", "visible",)
    .where("status", "=", "confirmed",)
    .groupBy(["provider", "model_id",],)
    .execute();

  // Numerator: distinct messages with ≥1 positive reaction.
  // Valence is applied in JS (emoji is free text; no index) over the
  // small reacted subset, not over all messages.
  const reacted = await db
    .selectFrom("message_reactions as r",)
    .innerJoin("messages as m", "m.id", "r.message_id",)
    .select(["m.provider", "m.model_id", "r.message_id", "r.emoji",],)
    .where("m.role", "=", "assistant",)
    .where("m.model_id", "is not", null,)
    .where("m.provider", "is not", null,)
    .where("m.visibility", "=", "visible",)
    .where("m.status", "=", "confirmed",)
    .execute();

  const positiveMessages = new Map<string, Set<string>>();
  for (const row of reacted) {
    if (!isPositiveReaction(row.emoji, DEFAULT_POSITIVE_EMOJI,)) { continue; }
    const key = `${row.provider}|${row.model_id}`;
    let set = positiveMessages.get(key,);
    if (!set) {
      set = new Set<string>();
      positiveMessages.set(key, set,);
    }

    set.add(row.message_id,);
  }

  const observedAt = new Date().toISOString();
  let graded = 0;
  for (const row of denominators) {
    if (row.provider == null || row.model_id == null) { continue; }
    const key = `${row.provider}|${row.model_id}`;
    const reactedCount = positiveMessages.get(key,)?.size ?? 0;
    const score = reactionScore({ messages: Number(row.messages,), reactedMessages: reactedCount, },);
    // ponytail: instance scope key; per-install identity when the
    // instance-id convention lands.
    await recordRanking(db, {
      scope: "instance",
      scopeKey: "local",
      subjectKey: key,
      metric: "reaction_rate",
      value: score.score,
      unit: "rate",
      basis: "measured",
      source: "loop-lore",
      observedAt,
      meta: {
        messages: Number(row.messages,),
        reacted_messages: reactedCount,
        std_error: score.stdError,
        published: score.published,
        sample_floor: MIN_SAMPLE_FLOOR,
        method: "beta-binomial",
        prior_alpha: 1,
        prior_beta: 9,
      },
    },);

    graded++;
  }

  getLogger().child({ module: "reaction-grade", },).info("reaction grading complete", { graded, },);
  return graded;
}
