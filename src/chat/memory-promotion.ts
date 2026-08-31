// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory Promotion
 *
 * Scope detection and store helpers for the chat context-cut flow.
 * Split from `transitions.ts` to keep that file under the 250-line size
 * limit (see check-file-size).
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../db/schema";
import type { ExtractedMemory, } from "../memory/types";
import { jsonStringifyOr, } from "../utils";

/**
 * Detect memory scope from message content.
 * @param _content
 * @param role
 * @param worldId
 * @param _participantIds
 */
export function detectScope(
  _content: string,
  role: string,
  worldId: string | null,
  _participantIds: string[],
): "character" | "world" | "assistant" {
  if (role === "system" || role === "assistant") {
    return "assistant";
  }
  if (worldId) {
    return "world";
  }
  return "character";
}

/**
 * Store extracted memories with explicit scope.
 * Extends storeMemories by setting scope on inserted memories.
 * @param db
 * @param actorId
 * @param chatId
 * @param memories
 * @param scope
 */
export async function storeMemoriesWithScope(
  db: Kysely<DB>,
  actorId: string,
  chatId: string,
  memories: ExtractedMemory[],
  scope: "character" | "world" | "assistant",
): Promise<string[]> {
  const stored: string[] = [];

  for (const memory of memories) {
    const existing = await db
      .selectFrom("actor_memories",)
      .select("id",)
      .where("actor_id", "=", actorId,)
      .where("content", "=", memory.content,)
      .executeTakeFirst();

    if (existing) { continue; }

    const id = randomUUID();
    await db
      .insertInto("actor_memories",)
      .values({
        id,
        actor_id: actorId,
        content: memory.content,
        memory_type: memory.memoryType,
        confidence: memory.confidence,
        importance: memory.importance,
        keywords: jsonStringifyOr(memory.keywords,),
        source_chat_id: chatId,
        scope,
        privacy: "shared",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },)
      .execute();

    stored.push(id,);
  }

  return stored;
}
