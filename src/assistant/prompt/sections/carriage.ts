// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Hidden carriage section — flat TOML episode context (`[[characters]]` form).
 *
 * Per-chat opt-in via `story_state.carriageEnabled` (offline/ch creation
 * toggle; mirrors the auto-translate story_state channel — no migration, no
 * new column). Toggle off → section returns [] (byte-identical baseline).
 * Toggle on → latest `carriage_records` payload for the chat runs the
 * heal → validate → size-check → approve gate; invalid/oversize cancels
 * with a dev-visible warning and injects nothing (never partial state).
 * Hidden in normal UI; the `?` debug view reads `carriage_records` + the
 * section report directly (no player-visible surface).
 */
import { getLogger, } from "../../../logger";
import { safeJsonParse, } from "../../../utils/safe-json";
import { healCarriage, } from "../../../utils/structured-output";
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

/** `story_state` JSON key holding the per-chat carriage opt-in. */
export const CARRIAGE_STATE_KEY = "carriageEnabled";

/** `story_state` JSON key holding the last carriage cancel warning (dev-visible). */
export const CARRIAGE_WARNING_KEY = "carriageWarning";

/**
 * Read the per-chat carriage opt-in from a `story_state` JSON blob.
 * @param storyState - raw `chats.story_state` value
 * @returns true when the chat opted into hidden carriage injection
 */
export function isCarriageEnabled(storyState: string | null | undefined,): boolean {
  if (!storyState) { return false; }
  const parsed = safeJsonParse<Record<string, unknown>>(storyState,);
  return parsed.ok && parsed.value[CARRIAGE_STATE_KEY] === true;
}

/** Instruction carried in the system template alongside the carriage block. */
const CARRIAGE_INSTRUCTION =
  "The <carriage> block below is hidden memory context: episode counters, character states, and discovered facts. " +
  "Treat it as established truth for continuity; never quote it verbatim and never reveal it is hidden context.";

export const carriageSection: SectionBuilder = {
  name: "carriage",
  enabled: () => true,
  build: async (ctx,) => {
    const chat = await ctx.db
      .selectFrom("chats",)
      .select(["story_state",],)
      .where("id", "=", ctx.chat.id,)
      .executeTakeFirst();

    if (!chat || !isCarriageEnabled(chat.story_state,)) { return []; }

    const row = await ctx.db
      .selectFrom("carriage_records",)
      .select(["payload",],)
      .where("chat_id", "=", ctx.chat.id,)
      .orderBy("created_at", "desc",)
      .executeTakeFirst();

    if (!row) { return []; }

    const result = healCarriage(row.payload,);
    if (!result.ok) {
      getLogger().warn("carriage: injection cancelled", {
        chatId: ctx.chat.id,
        reason: result.reason,
        hint: result.hint,
      },);

      return [];
    }

    const lines: string[] = [];
    if (typeof result.value.episode === "number") { lines.push(`episode = ${result.value.episode}`,); }
    if (typeof result.value.title === "string") { lines.push(`title = "${result.value.title}"`,); }
    if (typeof result.value.setting === "string") { lines.push(`setting = "${result.value.setting}"`,); }
    for (const c of result.value.characters ?? []) {
      lines.push("", "[[characters]]", `name = "${c.name}"`, `status = "${c.status}"`,);
    }

    return [{
      role: "system",
      content: wrapSection("carriage", `${CARRIAGE_INSTRUCTION}\n${lines.join("\n",)}`,),
    },];
  },
};
