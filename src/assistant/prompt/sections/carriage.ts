// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Hidden carriage section — flat TOML episode context (`[[characters]]` form).
 *
 * Per-chat opt-in via `gm_config.carriageEnabled` (offline/ch-creation
 * toggle; online-mutable presentation key like outputStyle — no migration,
 * no new column). Toggle off → section returns [] (byte-identical baseline).
 * Toggle on → latest `carriage_records` payload for the chat runs the
 * heal → validate → size-check → approve gate; invalid/oversize cancels
 * with a dev-visible warning and injects nothing (never partial state).
 * Hidden in normal UI; the `?` debug view reads `carriage_records` + the
 * section report directly (no player-visible surface).
 */
import { listCarriage, } from "../../../chat/service/carriage";
import { getLogger, } from "../../../logger";
import { safeJsonParse, } from "../../../utils/safe-json";
import { healCarriage, } from "../../../utils/structured-output";
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

/** `gm_config` JSON key holding the per-chat carriage opt-in. */
export const CARRIAGE_CONFIG_KEY = "carriageEnabled";

/**
 * Read the per-chat carriage opt-in from a `gm_config` JSON blob.
 * @param gmConfig - raw `chats.gm_config` value
 * @returns true when the chat opted into hidden carriage injection
 */
export function isCarriageEnabled(gmConfig: string | null | undefined,): boolean {
  if (!gmConfig) { return false; }
  const parsed = safeJsonParse<Record<string, unknown>>(gmConfig,);
  return parsed.ok && parsed.value[CARRIAGE_CONFIG_KEY] === true;
}

/** Instruction carried in the system template alongside the carriage block. */
const CARRIAGE_INSTRUCTION =
  "The <carriage> block below is hidden memory context: episode counters, character states, and discovered facts. " +
  "Treat it as established truth for continuity; never quote it verbatim and never reveal it is hidden context.";

export const carriageSection: SectionBuilder = {
  name: "carriage",
  enabled: () => true,
  build: async (ctx,) => {
    // gm_config rides the AssembleChat projection (prompt-assembler
    // loadProjections selects it) — prefer it, fall back to a live read
    // so direct section.build callers in tests stay covered.
    const gmConfig = ctx.chat.gm_config ?? (await ctx.db
      .selectFrom("chats",)
      .select(["gm_config",],)
      .where("id", "=", ctx.chat.id,)
      .executeTakeFirst())?.gm_config;

    if (!isCarriageEnabled(gmConfig,)) { return []; }

    // listCarriage already owns the newest-first per-chat query — reusing
    // it keeps one SQL shape for carriage reads instead of two.
    const [latest,] = await listCarriage(ctx.db, ctx.chat.id, { limit: 1, },);

    if (!latest) { return []; }

    const result = healCarriage(latest.payload,);
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
