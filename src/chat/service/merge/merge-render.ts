// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared render helpers for content merges (FEA-2026-047): message-line
 * rendering, source-tip loading, metadata parsing. Extracted from
 * `merge-service.ts` to stay under the 250-line budget.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { safeJsonParse, } from "../../../utils/safe-json";
import { walkMessagePath, } from "../branch-helpers";
import type { MergeHunk, } from "./merge-diff";
import type { MergeSourceTip, } from "./merge-graph";
import { threeWayOverlay, } from "./merge-overlay";
import type { MergeMetadata, } from "./merge-store";

/**
 * Render a single message's content as a line array.
 * @param database
 * @param chatId
 * @param messageId
 */
export async function renderMessageLines(
  database: Kysely<DB>,
  chatId: string,
  messageId: string,
): Promise<string[] | null> {
  const row = await database
    .selectFrom("messages",)
    .select(["role", "content", "content_plaintext",],)
    .where("id", "=", messageId,)
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();

  if (!row) { return null; }
  const content = row.content_plaintext ?? row.content;
  return [`${row.role}: ${content}`,];
}

/**
 * Render a tail's messages as a line array.
 * @param database
 * @param chatId
 * @param tail
 */
export async function renderTailLines(
  database: Kysely<DB>,
  chatId: string,
  tail: string[],
): Promise<string[] | null> {
  const lines: string[] = [];
  for (const id of tail) {
    const rendered = await renderMessageLines(database, chatId, id,);
    if (!rendered) { return null; }
    lines.push(...rendered,);
  }

  return lines;
}

/**
 * Load source tips for a merge (preview re-walk).
 * @param database
 * @param mergeId
 */
export async function loadSourceTips(
  database: Kysely<DB>,
  mergeId: string,
): Promise<MergeSourceTip[]> {
  const rows = await database
    .selectFrom("branch_merge_sources",)
    .select(["ordinal", "branch_id", "tip_message_id",],)
    .where("merge_id", "=", mergeId,)
    .orderBy("ordinal", "asc",)
    .execute();

  return rows.map((row,) => ({
    tipMessageId: row.tip_message_id,
    branchId: row.branch_id ?? undefined,
  }));
}

/**
 * Load the ancestor path (root to LCA, exclusive) for shared context.
 * @param database
 * @param chatId
 * @param baseMessageId
 */
export async function loadAncestorPath(
  database: Kysely<DB>,
  chatId: string,
  baseMessageId: string,
): Promise<string[]> {
  const path = await walkMessagePath(database, chatId, baseMessageId,);
  return path.slice(0, -1,);
}

/**
 * Parse metadata JSON, returning an empty object on failure.
 * @param raw
 */
export function parseMetadata(raw: string | null,): MergeMetadata {
  if (!raw) { return {}; }
  const parsed = safeJsonParse<MergeMetadata>(raw,);
  return parsed.ok ? parsed.value : {};
}

/**
 * Load source rows for a merge (initiate replay path).
 * @param database
 * @param mergeId
 */
export async function loadMergeSources(
  database: Kysely<DB>,
  mergeId: string,
): Promise<{ ordinal: number; tipMessageId: string; tailLength: number }[]> {
  const rows = await database
    .selectFrom("branch_merge_sources",)
    .select(["ordinal", "tip_message_id",],)
    .where("merge_id", "=", mergeId,)
    .orderBy("ordinal", "asc",)
    .execute();

  const tails = await Promise.allSettled(
    rows.map(async (row,) => {
      const path = await walkMessagePath(database, "", row.tip_message_id,);
      return path.length;
    },),
  );

  return rows.map((row, i,) => ({
    ordinal: row.ordinal,
    tipMessageId: row.tip_message_id,
    tailLength: tails[i]!.status === "fulfilled" ? tails[i]!.value : 0,
  }));
}

/**
 * Compute overlay hunks for modes 2/3.
 * @param database
 * @param chatId
 * @param graph
 * @param graph.baseMessageId
 * @param graph.sources
 * @param base
 * @param overlay
 */
export async function computeOverlayHunks(
  database: Kysely<DB>,
  chatId: string,
  graph: { baseMessageId: string; sources: { ordinal: number; tail: string[] }[] },
  base: number,
  overlay: number,
): Promise<MergeHunk[] | null> {
  const ancestorLines = await renderTailLines(
    database,
    chatId,
    await loadAncestorPath(database, chatId, graph.baseMessageId,),
  );

  const baseLines = await renderTailLines(database, chatId, graph.sources[base]!.tail,);
  const overlayLines = await renderTailLines(database, chatId, graph.sources[overlay]!.tail,);
  if (!ancestorLines || !baseLines || !overlayLines) { return null; }
  return threeWayOverlay(ancestorLines, baseLines, overlayLines,);
}
