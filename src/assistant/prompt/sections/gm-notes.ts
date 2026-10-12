// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GM Notes section — narrative directives from the GM.
 *
 * Two kinds, both injected into the LLM prompt (never shown to players in chat):
 * - whitenotes: story-steering directives (narrative direction, tone, pacing,
 *   theme...) with priority 1-10 and optional expiry
 * - shadow notes: hidden narrative metadata (foreshadowing, world secrets,
 *   player motivations...) that steer the story without player visibility
 *
 * Expired whitenotes are filtered out at assembly time. Revealed shadow notes
 * are excluded (they have already been surfaced to players).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { jsonParseOr, } from "../../../utils";
import { wrapSection, } from "../../xml-utils";
import type { InjectableEntry, } from "../carriage-isolation";
import type { SectionBuilder, } from "../types";

const MAX_WHITENOTES = 10;
const MAX_SHADOW_NOTES = 10;

interface WhiteneoteRow {
  type: string;
  content: string;
  priority: number;
  scope: string;
  message_id: string | null;
}

/**
 * Fetch active (non-expired) whitenotes for the chat, highest priority first.
 * @param db
 * @param chatId
 * @returns void
 */
async function fetchActiveWhitenotes(
  db: Kysely<DB>,
  chatId: string,
): Promise<WhiteneoteRow[]> {
  const now = new Date().toISOString();
  const rows = await db
    .selectFrom("whitenotes",)
    .select(["type", "content", "priority", "scope", "message_id",],)
    .where("chat_id", "=", chatId,)
    .where((eb,) =>
      eb.or([
        eb("expires_at", "is", null,),
        eb("expires_at", ">", now,),
      ],)
    )
    .orderBy("priority", "desc",)
    .orderBy("created_at", "asc",)
    .limit(MAX_WHITENOTES,)
    .execute();

  return Array.from(rows, (r,) => ({
    type: r.type,
    content: r.content,
    priority: r.priority,
    scope: r.scope,
    message_id: r.message_id,
  }),);
}

/** One hidden narrative influence steering generation */
export interface ShadowSteeringNote {
  type: string;
  content: string;
  /** Free-form activation trigger, verbatim; null when undeclared. */
  trigger: string | null;
}

/**
 * Fetch unrevealed shadow notes (hidden influences) for the chat.
 * Shared by the gmNotes prompt section and workflow dispatch callers
 * (TASK-gm-shadow-note-steering-into-workflow-dispatch-prompts) so both
 * read the same hidden-note set. Callers MUST enforce the GM-role gate
 * themselves — this fetch does not check roles.
 *
 * Filters out expired notes (where `expires_at <= now`). The DB still
 * holds them until the purge sweep runs; this just keeps stale notes
 * out of the LLM prompt.
 * @param db
 * @param chatId
 * @returns void
 */
export async function fetchUnrevealedShadowNotes(
  db: Kysely<DB>,
  chatId: string,
): Promise<ShadowSteeringNote[]> {
  const now = new Date().toISOString();
  const rows = await db
    .selectFrom("shadow_notes",)
    .select(["type", "content", "trigger_condition",],)
    .where("chat_id", "=", chatId,)
    .where("status", "=", "hidden",)
    .where((eb,) =>
      eb.or([
        eb("expires_at", "is", null,),
        eb("expires_at", ">", now,),
      ],)
    )
    .orderBy("created_at", "asc",)
    .limit(MAX_SHADOW_NOTES,)
    .execute();

  return Array.from(rows, (r,) => ({
    type: r.type,
    content: r.content,
    trigger: r.trigger_condition,
  }),);
}

/**
 * Format shadow notes as a hidden steering block for prompt injection.
 * Same `<shadow_notes>` shape the gmNotes section emits.
 * @param notes - Unrevealed shadow notes
 * @returns Wrapped block, or empty string when no notes
 */
export function formatShadowSteering(notes: readonly ShadowSteeringNote[],): string {
  if (notes.length === 0) { return ""; }
  const text = Array.from(notes, (n,) =>
    n.trigger
      ? `- [${n.type}][trigger: ${n.trigger}] ${n.content}`
      : `- [${n.type}] ${n.content}`,).join("\n",);

  return wrapSection("shadow_notes", text,);
}

/**
 * Build the injectable entries for one assembly: whitenotes are player-class
 * story steering; shadow notes are gm-class hidden metadata. Entry `content`
 * is the plain note text — the cross-system dedup key (a fact another system
 * already submitted drops here); the section re-renders the labeled line per
 * kept id, so gate-off rendering is byte-identical to the pre-gate path.
 * @param whitenotes - active whitenotes (highest priority first)
 * @param shadowNotes - unrevealed shadow notes (already role-gated upstream)
 * @returns entries in canonical render order (whitenotes, then shadow)
 */
export function gmNoteEntries(
  whitenotes: readonly WhiteneoteRow[],
  shadowNotes: readonly ShadowSteeringNote[],
): InjectableEntry[] {
  const entries: InjectableEntry[] = [];
  whitenotes.forEach((n, i,) => {
    entries.push({
      system: "notes",
      id: `whitenote-${i}`,
      content: n.content,
      visibility: "player",
    },);
  },);

  for (const [i, n,] of shadowNotes.entries()) {
    entries.push({
      system: "gmNotes-shadow",
      id: `shadow-${i}`,
      content: n.content,
      visibility: "gm",
    },);
  }

  return entries;
}

/**
 * Canonical labeled render line per note entry id.
 * @param whitenotes - active whitenotes (highest priority first)
 * @param shadowNotes - unrevealed shadow notes
 * @returns id → exact `- [type]…` line, byte-identical to the pre-gate render
 */
function gmNoteRenderLines(
  whitenotes: readonly WhiteneoteRow[],
  shadowNotes: readonly ShadowSteeringNote[],
): Map<string, string> {
  const lines = new Map<string, string>();
  whitenotes.forEach((n, i,) => {
    // Message-scoped notes carry a `[message <id>]` label so the model can
    // tell anchored directives apart from chat-scoped ones.
    lines.set(
      `whitenote-${i}`,
      n.message_id
        ? `- [${n.type}][priority ${n.priority}][${n.scope}][message ${n.message_id}] ${n.content}`
        : `- [${n.type}][priority ${n.priority}][${n.scope}] ${n.content}`,
    );
  },);

  shadowNotes.forEach((n, i,) => {
    lines.set(
      `shadow-${i}`,
      n.trigger ? `- [${n.type}][trigger: ${n.trigger}] ${n.content}` : `- [${n.type}] ${n.content}`,
    );
  },);

  return lines;
}

export const gmNotesSection: SectionBuilder = {
  name: "gmNotes",
  enabled: () => true,

  build: async (ctx,) => {
    // Shadow notes are GM-only narrative metadata (foreshadowing, world
    // secrets, player motivations). Only expose them when the chat's
    // effective assistant role is `gm` — a non-GM chat leaking them into
    // the prompt would be an information leak (BUG-gm-shadow-notes-leak-
    // into-any-prompt). Whitenotes stay unconditional: they are story-
    // steering directives for any chat.
    const assistantRole = ctx.chat.gm_config
      ? jsonParseOr<{ assistantRole?: string }>(ctx.chat.gm_config, {},).assistantRole
      : undefined;

    const isGmRole = assistantRole === "gm";

    const noteResults = await Promise.allSettled([
      fetchActiveWhitenotes(ctx.db, ctx.chat.id,),
      isGmRole ? fetchUnrevealedShadowNotes(ctx.db, ctx.chat.id,) : Promise.resolve([],),
    ],);

    const whitenotesResult = noteResults[0];
    const shadowNotesResult = noteResults[1];
    if (whitenotesResult.status === "rejected") { throw whitenotesResult.reason; }
    if (shadowNotesResult.status === "rejected") { throw shadowNotesResult.reason; }
    const whitenotes = whitenotesResult.value;
    const shadowNotes = shadowNotesResult.value;

    if (whitenotes.length === 0 && shadowNotes.length === 0) { return []; }

    // Single-assembly gate: with the gate active the entries flow through
    // { system, visibility } filtering + content-hash dedup server-side;
    // without it the same entries render verbatim (byte-identical baseline).
    // Rendering uses the canonical labeled line per kept id — never entry
    // content (the plain note text is the dedup key, not the render unit).
    const candidates = gmNoteEntries(whitenotes, shadowNotes,);
    const kept = ctx.injectables ? ctx.injectables.submit(candidates,) : candidates;
    const renderLines = gmNoteRenderLines(whitenotes, shadowNotes,);
    const keptWhitenotes = kept.filter((e,) => e.system === "notes");
    const keptShadow = kept.filter((e,) => e.system === "gmNotes-shadow");

    if (keptWhitenotes.length === 0 && keptShadow.length === 0) { return []; }

    const parts: string[] = [];
    if (keptWhitenotes.length > 0) {
      parts.push(wrapSection("whitenotes", keptWhitenotes.map((e,) => renderLines.get(e.id,) ?? "").join("\n",),),);
    }

    if (keptShadow.length > 0) {
      parts.push(wrapSection("shadow_notes", keptShadow.map((e,) => renderLines.get(e.id,) ?? "").join("\n",),),);
    }

    return [{ role: "system", content: parts.join("\n\n",), },];
  },
};
