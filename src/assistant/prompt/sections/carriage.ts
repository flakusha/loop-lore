// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Hidden carriage section — flat TOML episode context (`[[characters]]` form).
 *
 * Per-chat opt-in via `gm_config.carriageEnabled` (offline/ch-creation
 * toggle; online-mutable presentation key like outputStyle — no migration,
 * no new column). Toggle off → section returns [] (byte-identical baseline).
 * Toggle on → latest `carriage_records` row with scope `carriage` (authored
 * by the LLM writer in src/chat/service/carriage-authoring.ts, payload
 * `{ toml }`) runs the heal → validate → size-check → approve gate;
 * invalid/oversize cancels with a dev-visible warning and injects nothing
 * (never partial state). When the assembly runs with the injection gate
 * (`ctx.injectables`), the healed facts submit as entries so the
 * single-assembly dedup can drop facts another system already injected.
 * Hidden in normal UI; the `?` debug view reads `carriage_records` + the
 * section report directly (no player-visible surface).
 */
import { listCarriage, } from "../../../chat/service/carriage";
import { getLogger, } from "../../../logger";
import { safeJsonParse, } from "../../../utils/safe-json";
import { healCarriage, } from "../../../utils/structured-output";
import type { CarriageDoc, } from "../../../utils/structured-output";
import { wrapSection, } from "../../xml-utils";
import type { InjectableEntry, } from "../carriage-isolation";
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

/**
 * Split an approved carriage doc into one injectable entry per fact.
 * Entry `content` is the plain fact text — the cross-system dedup key (the
 * same fact submitted by another system drops here). The section re-renders
 * the canonical TOML snippet per kept id, so gate-on rendering is
 * byte-identical to the direct render (the blank line before each
 * `[[characters]]` rides inside the character entry).
 * @param doc - approved carriage document
 * @returns candidate entries, top-to-bottom in canonical block order
 */
export function carriageEntries(doc: CarriageDoc,): InjectableEntry[] {
  const entries: InjectableEntry[] = [];
  if (typeof doc.episode === "number") {
    entries.push({ system: "carriage", id: "episode", content: `episode ${doc.episode}`, visibility: "player", },);
  }

  if (typeof doc.title === "string") {
    entries.push({ system: "carriage", id: "title", content: doc.title, visibility: "player", },);
  }

  if (typeof doc.setting === "string") {
    entries.push({ system: "carriage", id: "setting", content: doc.setting, visibility: "player", },);
  }

  (doc.characters ?? []).forEach((c, i,) => {
    entries.push({
      system: "carriage",
      id: `character-${i}`,
      content: `${c.name}: ${c.status}`,
      visibility: "player",
    },);
  },);

  return entries;
}

/**
 * Canonical TOML snippet rendered per carriage entry id.
 * @param doc - approved carriage document
 * @returns id → exact block text, byte-identical to the direct render
 */
function carriageRenderLines(doc: CarriageDoc,): Map<string, string> {
  const lines = new Map<string, string>();
  if (typeof doc.episode === "number") { lines.set("episode", `episode = ${doc.episode}`,); }
  if (typeof doc.title === "string") { lines.set("title", `title = "${doc.title}"`,); }
  if (typeof doc.setting === "string") { lines.set("setting", `setting = "${doc.setting}"`,); }
  (doc.characters ?? []).forEach((c, i,) => {
    lines.set(`character-${i}`, `\n[[characters]]\nname = "${c.name}"\nstatus = "${c.status}"`,);
  },);

  return lines;
}

/**
 * Extract the raw TOML from a persisted scope=`carriage` payload.
 * @param payload - JSON-stringified record payload
 * @returns the TOML text, or null when the payload does not carry one
 */
function tomlOfPayload(payload: string,): string | null {
  const parsed = safeJsonParse<{ toml?: unknown }>(payload,);
  return parsed.ok && typeof parsed.value.toml === "string" ? parsed.value.toml : null;
}

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
    // it scoped to the `carriage` TOML block keeps one SQL shape for
    // carriage reads instead of two (carry-log rows never reach here).
    const [latest,] = await listCarriage(ctx.db, ctx.chat.id, { limit: 1, scope: "carriage", },);

    const toml = latest ? tomlOfPayload(latest.payload,) : null;
    if (!toml) { return []; }

    const result = healCarriage(toml,);
    if (!result.ok) {
      getLogger().warn("carriage: injection cancelled", {
        chatId: ctx.chat.id,
        reason: result.reason,
        hint: result.hint,
      },);

      return [];
    }

    const candidates = carriageEntries(result.value,);
    const kept = ctx.injectables ? ctx.injectables.submit(candidates,) : candidates;
    if (kept.length === 0) { return []; }
    // Render the canonical TOML snippet per surviving id — never entry
    // content (the plain fact text is the dedup key, not the render unit).
    const renderLines = carriageRenderLines(result.value,);

    return [{
      role: "system",
      content: wrapSection(
        "carriage",
        `${CARRIAGE_INSTRUCTION}\n${kept.map((e,) => renderLines.get(e.id,) ?? "").join("\n",).trimStart()}`,
      ),
    },];
  },
};
