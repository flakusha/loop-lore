// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Turn-skip absence section — GM contract for hold / advance handling
 * (TASK-turn-skip-gm-absence-contract).
 *
 * When a chat participant has issued a `turn_skip` event, the GM must:
 *   - hold: keep the scene at the current beat; the skipping actor is
 *     conspicuously inactive. Other actors may notice, react, or simply
 *     carry on; the absent actor MUST NOT be narrated into autonomous
 *     action.
 *   - advance: elapse scene time past the actor's inaction ("meanwhile,
 *     the rest of the group moved on..."). The skipping actor MUST still
 *     not be narrated into autonomous action — they were absent, not
 *     covertly active.
 *
 * The contract is injected as a hidden steering block (no player-visible
 * rendering) so the LLM is bound by it without leaking it into chat. It
 * fires only when at least one turn_skip is in the recent message log.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import { MessageContentType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

/** How many recent messages we scan for turn_skip events. */
const RECENT_WINDOW = 50;

/** Summary line for the prompt steering block (hold mode). */
const HOLD_RULE = "An absent actor is NOT narrated into autonomous action. " +
  "Other actors may notice or react; the beat stays at its current cue.";

/** Summary line for the prompt steering block (advance mode). */
const ADVANCE_RULE = "An absent actor is NOT narrated into autonomous action. " +
  "You may elapse scene time past their inaction (move location, mark a " +
  "time skip), but the actor's own choices remain unwritten.";
interface RecentSkip {
  actor_id: string;
  mode: string | null;
  created_at: string;
}

/**
 * Fetch the recent turn_skip events for the chat (most recent first).
 *
 * Reads the messages log filtered by `content_type = 'turn_skip'` and
 * capped at {@link RECENT_WINDOW} rows. Mode is parsed from
 * `metadata.turnSkip.mode` (JSON column) — `messages.mode` does not
 * exist. SQLite `json_extract` returns NULL on malformed JSON, so a bad
 * metadata blob gracefully falls through to the `null` branch in the
 * caller (counts ignored, no clause rendered).
 * @param db
 * @param chatId
 */
async function fetchRecentSkips(db: Kysely<DB>, chatId: string,): Promise<RecentSkip[]> {
  return db
    .selectFrom("messages",)
    .select([
      "actor_id",
      sql<string | null>`json_extract(metadata, '$.turnSkip.mode')`.as("mode",),
      "created_at",
    ],)
    .where("chat_id", "=", chatId,)
    .where("content_type", "=", MessageContentType.TurnSkip,)
    .orderBy(sql`rowid`, "desc",)
    .limit(RECENT_WINDOW,)
    .execute();
}

export const turnSkipAbsenceSection: SectionBuilder = {
  name: "turnSkipAbsence",
  enabled: () => true,
  build: async (ctx,) => {
    const skips = await fetchRecentSkips(ctx.db, ctx.chat.id,);
    if (skips.length === 0) { return []; }

    let holdCount = 0;
    let advanceCount = 0;
    for (const s of skips) {
      if (s.mode === "advance") { advanceCount++; }
      else if (s.mode === "hold") { holdCount++; }
    }
    const parts: string[] = [];
    if (holdCount > 0) {
      parts.push(
        wrapSection(
          "turn_skip_hold",
          `Some actors (${holdCount}) issued hold skips. ${HOLD_RULE}`,
        ),
      );
    }
    if (advanceCount > 0) {
      parts.push(
        wrapSection(
          "turn_skip_advance",
          `Some actors (${advanceCount}) issued advance skips. ${ADVANCE_RULE}`,
        ),
      );
    }
    return [{ role: "system", content: parts.join("\n\n",), },];
  },
};
