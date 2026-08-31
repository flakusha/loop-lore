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

/**
 * Parse the `actor_memories.keywords` JSON column (string[] | null).
 * @param raw
 */
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

/**
 * Parse a `key_groups` JSON column (string[][] | null) for AND/OR lore
 * activation groups. Each inner array is an AND group (every keyword must
 * match); the outer array is OR (any group activates). Returns `null` when
 * the column is empty, invalid, or not a well-formed nest of string arrays —
 * callers should fall back to plain keyword matching.
 * @param raw
 */
export function parseKeyGroups(raw: unknown,): string[][] | null {
  if (raw == null) { return null; }
  const value = typeof raw === "string" ? jsonParseOr<unknown>(raw, null,) : raw;
  if (!Array.isArray(value,)) { return null; }
  const groups: string[][] = [];
  for (const group of value) {
    if (!Array.isArray(group,)) { continue; }
    const keys: string[] = [];
    for (const key of group) {
      const trimmed = String(key,).trim();
      if (trimmed) { keys.push(trimmed,); }
    }
    if (keys.length > 0) { groups.push(keys,); }
  }
  return groups.length > 0 ? groups : null;
}

/**
 * Lowercased word set built from the most recent user message content in a chat.
 *
 * Tokenizes on non-alphanumeric boundaries and lowercases each word, matching
 * the keyword-matching semantics elsewhere in the project.
 * @param text
 */
function wordsFromText(text: string,): Set<string> {
  const words: string[] = [];
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/i,)) {
    if (w) { words.push(w,); }
  }
  return new Set(words,);
}

/**
 * Recent user messages in a chat, most recent first (confirmed + visible).
 * @param db
 * @param chatId
 * @param limit
 */
async function recentUserMessages(
  db: Kysely<DB>,
  chatId: string,
  limit: number,
): Promise<string[]> {
  const rows = await db
    .selectFrom("messages",)
    .select(["content",],)
    .where("chat_id", "=", chatId,)
    .where("role", "=", MessageRole.User,)
    .where("status", "=", MessageStatus.Confirmed,)
    .where("visibility", "=", MessageVisibility.Visible,)
    .orderBy("created_at", "desc",)
    .limit(limit,)
    .execute();
  const contents: string[] = [];
  for (const row of rows) {
    if (row.content) { contents.push(row.content,); }
  }
  return contents;
}

/**
 * Scan a conversation for lore-activation context: the lowercased word set and
 * the raw (newline-joined) text of up to `scanDepth` most recent user messages.
 *
 * `scanDepth` governs conversation-depth activation (ticket FEAT-055): entries
 * with `scan_depth` > 1 match against keywords appearing several messages back,
 * and regex entries match against the joined text of the scanned window.
 * @param db
 * @param chatId
 * @param scanDepth
 * @returns Empty word set and empty text when there are no user messages.
 */
export async function recentConversation(
  db: Kysely<DB>,
  chatId: string,
  scanDepth: number,
): Promise<{ words: Set<string>; text: string }> {
  const contents = await recentUserMessages(db, chatId, Math.max(1, scanDepth,),);
  const words = new Set<string>();
  const textParts: string[] = [];
  for (const content of contents) {
    for (const w of wordsFromText(content,)) { words.add(w,); }
    textParts.push(content,);
  }
  return { words, text: textParts.join("\n",), };
}

/**
 * Lowercased word set of the most recent user message in a chat.
 * @param db
 * @param chatId
 */
export async function recentUserWords(db: Kysely<DB>, chatId: string,): Promise<Set<string>> {
  const { words, } = await recentConversation(db, chatId, 1,);
  return words;
}
