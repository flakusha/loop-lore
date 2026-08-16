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
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

const MAX_WHITENOTES = 10;
const MAX_SHADOW_NOTES = 10;

interface WhiteneoteRow {
  type: string;
  content: string;
  priority: number;
  scope: string;
}

interface ShadowNoteRow {
  type: string;
  content: string;
}

/** Fetch active (non-expired) whitenotes for the chat, highest priority first. */
async function fetchActiveWhitenotes(
  db: Kysely<DB>,
  chatId: string,
): Promise<WhiteneoteRow[]> {
  const now = new Date().toISOString();
  const rows = await db
    .selectFrom("whitenotes",)
    .select(["type", "content", "priority", "scope",],)
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
  }),);
}

/** Fetch unrevealed shadow notes (hidden influences) for the chat. */
async function fetchUnrevealedShadowNotes(
  db: Kysely<DB>,
  chatId: string,
): Promise<ShadowNoteRow[]> {
  const rows = await db
    .selectFrom("shadow_notes",)
    .select(["type", "content",],)
    .where("chat_id", "=", chatId,)
    .where("status", "=", "hidden",)
    .orderBy("created_at", "asc",)
    .limit(MAX_SHADOW_NOTES,)
    .execute();

  return Array.from(rows, (r,) => ({ type: r.type, content: r.content, }),);
}

export const gmNotesSection: SectionBuilder = {
  name: "gmNotes",
  enabled: () => true,
  build: async (ctx,) => {
    const noteResults = await Promise.allSettled([
      fetchActiveWhitenotes(ctx.db, ctx.chat.id,),
      fetchUnrevealedShadowNotes(ctx.db, ctx.chat.id,),
    ],);
    const whitenotesResult = noteResults[0];
    const shadowNotesResult = noteResults[1];
    if (whitenotesResult.status === "rejected") { throw whitenotesResult.reason; }
    if (shadowNotesResult.status === "rejected") { throw shadowNotesResult.reason; }
    const whitenotes = whitenotesResult.value;
    const shadowNotes = shadowNotesResult.value;

    if (whitenotes.length === 0 && shadowNotes.length === 0) { return []; }

    const parts: string[] = [];
    if (whitenotes.length > 0) {
      const text = Array.from(whitenotes, (n,) => `- [${n.type}][priority ${n.priority}][${n.scope}] ${n.content}`,)
        .join("\n",);
      parts.push(wrapSection("whitenotes", text,),);
    }
    if (shadowNotes.length > 0) {
      const text = Array.from(shadowNotes, (n,) => `- [${n.type}] ${n.content}`,).join("\n",);
      parts.push(wrapSection("shadow_notes", text,),);
    }

    return [{ role: "system", content: parts.join("\n\n",), },];
  },
};
