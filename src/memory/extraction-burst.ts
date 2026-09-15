// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Burst extraction over a known message chain (compaction pass,
 * carry-forward, manual "try hard" reruns).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db";
import { extractMemories, storeMemories, } from "./extraction";
import { MAX_CHAIN_IDS, } from "./history-search";
import type { ExtractionOpts, } from "./types";

/**
 * Extract memories from a known message chain.
 *
 * Loads the chain rows oldest-first, builds a role-labeled transcript using
 * the read path's plaintext-mirror rule (`content_plaintext ?? content`;
 * E2E rows without a mirror are dropped), then extracts and binds the chain.
 * @param db
 * @param opts
 * @param chain - message IDs (any order) plus the chats they span
 */
export async function extractFromBurst(
  db: Kysely<DB>,
  opts: Omit<ExtractionOpts, "aiContent" | "userContent">,
  chain: { messageIds: string[]; chatIds?: string[] },
): Promise<number> {
  if (chain.messageIds.length === 0) { return 0; }
  const rows = await db
    .selectFrom("messages",)
    .select(["id", "role", "content", "content_plaintext", "key_id", "created_at",],)
    .where("id", "in", chain.messageIds.slice(0, MAX_CHAIN_IDS,),)
    .orderBy("created_at", "asc",)
    .execute();

  const lines: string[] = [];
  for (const row of rows) {
    if (row.key_id && !row.content_plaintext) { continue; }
    const label = row.role === "assistant" ? "Assistant" : "User";
    lines.push(`${label}: ${row.content_plaintext ?? row.content}`,);
  }
  if (lines.length === 0) { return 0; }

  const memories = await extractMemories(db, {
    ...opts,
    messageId: rows[rows.length - 1]?.id ?? opts.messageId,
    aiContent: lines.join("\n",),
    userContent: undefined,
  },);
  if (memories.length === 0) { return 0; }
  return storeMemories(db, opts.actorId, opts.chatId, memories, {
    sourceMessageIds: Array.from(rows, (row,) => row.id,),
    sourceChatIds: chain.chatIds ?? opts.sourceChatIds ?? [opts.chatId,],
    extractionKind: opts.extractionKind ?? "burst",
  },);
}
