// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared keyword / context-word helpers used by the lore and memory sections
 * for selective relevance filtering.
 */
import type { Kysely, } from "kysely";
import { MessageRole, MessageStatus, MessageVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { jsonParseOr, } from "../../utils";

/** Parse the `actor_memories.keywords` JSON column (string[] | null). */
export function parseKeywords(raw: unknown,): string[] {
  if (raw == null) { return []; }
  if (Array.isArray(raw,)) { return Array.from(raw, String,); }
  if (typeof raw === "string") {
    const parsed = jsonParseOr<unknown>(raw, null,);
    if (Array.isArray(parsed,)) { return Array.from(parsed, String,); }
    const out: string[] = [];
    for (const s of raw.split(",",)) {
      const trimmed = s.trim();
      if (trimmed) { out.push(trimmed,); }
    }
    return out;
  }
  return [];
}

/** Lowercased word set of the most recent user message in a chat. */
export async function recentUserWords(db: Kysely<DB>, chatId: string,): Promise<Set<string>> {
  const row = await db
    .selectFrom("messages",)
    .select(["content",],)
    .where("chat_id", "=", chatId,)
    .where("role", "=", MessageRole.User,)
    .where("status", "=", MessageStatus.Confirmed,)
    .where("visibility", "=", MessageVisibility.Visible,)
    .orderBy("created_at", "desc",)
    .limit(1,)
    .executeTakeFirst();
  if (!row?.content) { return new Set(); }
  const words: string[] = [];
  for (const w of row.content.toLowerCase().split(/[^a-z0-9]+/i,)) {
    if (w) { words.push(w,); }
  }
  return new Set(words,);
}
