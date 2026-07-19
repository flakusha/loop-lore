/**
 * Shared keyword / context-word helpers used by the lore and memory sections
 * for selective relevance filtering.
 */
import type { Kysely } from "kysely";
import { MessageRole, MessageStatus, MessageVisibility } from "../../db/enums";
import type { DB } from "../../db/schema";
import { jsonParseOr } from "../../utils";

/** Parse the `actor_memories.keywords` JSON column (string[] | null). */
export function parseKeywords(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    const parsed = jsonParseOr<unknown>(raw, null);
    if (Array.isArray(parsed)) return parsed.map(String);
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** Lowercased word set of the most recent user message in a chat. */
export async function recentUserWords(db: Kysely<DB>, chatId: string): Promise<Set<string>> {
  const row = await db
    .selectFrom("messages")
    .select(["content"])
    .where("chat_id", "=", chatId)
    .where("role", "=", MessageRole.User)
    .where("status", "=", MessageStatus.Confirmed)
    .where("visibility", "=", MessageVisibility.Visible)
    .orderBy("created_at", "desc")
    .limit(1)
    .executeTakeFirst();
  if (!row?.content) return new Set();
  return new Set(
    row.content
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter(Boolean),
  );
}
