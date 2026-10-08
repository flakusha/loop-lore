// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Kysely persistence for `branch_merges` / `branch_merge_sources` /
 * result-row inserts (FEA-2026-047). All functions take a `Kysely<DB>`
 * handle so callers can pass either the pool or an open transaction.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { uid, } from "../../../utils";
import { safeJsonStringify, } from "../../../utils/safe-json";
import type { MergeDraftMessage, } from "./merge-criteria";
import type { MergeHunk, } from "./merge-diff";

/** A row from `branch_merges`. */
export interface MergeRecord {
  id: string;
  chat_id: string;
  base_message_id: string;
  mode: string;
  status: string;
  result_message_id: string | null;
  merged_branch_id: string | null;
  created_by: string;
  idempotency_key: string | null;
  metadata: string | null;
  created_at: string;
  confirmed_at: string | null;
}

/** A row from `branch_merge_sources`. */
export interface MergeSourceRow {
  merge_id: string;
  ordinal: number;
  branch_id: string | null;
  tip_message_id: string;
}

/** Preview payload stored in `branch_merges.metadata`. */
export interface MergeMetadata {
  preview?: {
    kind: "llm" | "overlay";
    draft?: MergeDraftMessage[];
    hunks?: MergeHunk[];
    tokenEstimate: { sharedPrefix: number; perSource: number[] };
    truncated: boolean;
    generatedAt: string;
    attempts: number;
  };
  changedRatio?: number;
  guardExceeded?: boolean;
}

/**
 * Load a merge row by id.
 * @param database
 * @param mergeId
 * @returns {Promise<MergeRecord | null>}
 */
export async function loadMerge(
  database: Kysely<DB>,
  mergeId: string,
): Promise<MergeRecord | null> {
  const row = await database
    .selectFrom("branch_merges",)
    .selectAll()
    .where("id", "=", mergeId,)
    .executeTakeFirst();

  return row ?? null;
}

/**
 * Load a merge row by idempotency key (initiate replay).
 * @param database
 * @param params
 * @param params.chatId
 * @param params.idempotencyKey
 * @returns {Promise<MergeRecord | null>}
 */
export async function loadMergeByIdempotencyKey(
  database: Kysely<DB>,
  params: { chatId: string; idempotencyKey: string },
): Promise<MergeRecord | null> {
  const { chatId, idempotencyKey, } = params;
  const row = await database
    .selectFrom("branch_merges",)
    .selectAll()
    .where("chat_id", "=", chatId,)
    .where("idempotency_key", "=", idempotencyKey,)
    .executeTakeFirst();

  return row ?? null;
}

/**
 * Insert a `branch_merges` row (status `draft`).
 * @param database
 * @param params
 * @param params.chatId
 * @param params.baseMessageId
 * @param params.mode
 * @param params.createdBy
 * @param params.idempotencyKey
 * @returns {Promise<string>} the new merge id
 */
export async function insertMergeRow(
  database: Kysely<DB>,
  params: {
    chatId: string;
    baseMessageId: string;
    mode: string;
    createdBy: string;
    idempotencyKey: string | null;
  },
): Promise<string> {
  const { chatId, baseMessageId, mode, createdBy, idempotencyKey, } = params;
  const id = uid();
  await database
    .insertInto("branch_merges",)
    .values({
      id,
      chat_id: chatId,
      base_message_id: baseMessageId,
      mode,
      status: "draft",
      created_by: createdBy,
      idempotency_key: idempotencyKey,
    },)
    .execute();

  return id;
}

/**
 * Insert `branch_merge_sources` rows for a merge.
 * @param database
 * @param params
 * @param params.mergeId
 * @param params.sources
 */
export async function insertSourceRows(
  database: Kysely<DB>,
  params: {
    mergeId: string;
    sources: { ordinal: number; branchId: string | null; tipMessageId: string }[];
  },
): Promise<void> {
  const { mergeId, sources, } = params;
  if (sources.length === 0) { return; }
  await database
    .insertInto("branch_merge_sources",)
    .values(
      sources.map((s,) => ({
        merge_id: mergeId,
        ordinal: s.ordinal,
        branch_id: s.branchId,
        tip_message_id: s.tipMessageId,
      })),
    )
    .execute();
}

/**
 * List source rows for a merge, ordered by ordinal.
 * @param database
 * @param mergeId
 * @returns {Promise<MergeSourceRow[]>}
 */
export async function listSources(
  database: Kysely<DB>,
  mergeId: string,
): Promise<MergeSourceRow[]> {
  return database
    .selectFrom("branch_merge_sources",)
    .selectAll()
    .where("merge_id", "=", mergeId,)
    .orderBy("ordinal", "asc",)
    .execute();
}

/**
 * Update the `metadata` JSON column.
 * @param database
 * @param params
 * @param params.mergeId
 * @param params.metadata
 */
export async function updateMergeMetadata(
  database: Kysely<DB>,
  params: { mergeId: string; metadata: MergeMetadata },
): Promise<void> {
  const { mergeId, metadata, } = params;
  const serialized = safeJsonStringify(metadata,);
  if (!serialized.ok) { return; }
  await database
    .updateTable("branch_merges",)
    .set({ metadata: serialized.value, },)
    .where("id", "=", mergeId,)
    .execute();
}

/**
 * Guarded status transition: `draft` → `confirmed`. Returns the number of
 * rows updated (0 = already confirmed / not found).
 * @param database
 * @param params
 * @param params.mergeId
 * @param params.confirmedAt
 * @returns {Promise<number>}
 */
export async function guardDraftToConfirmed(
  database: Kysely<DB>,
  params: { mergeId: string; confirmedAt: string },
): Promise<number> {
  const { mergeId, confirmedAt, } = params;
  const result = await database
    .updateTable("branch_merges",)
    .set({ status: "confirmed", confirmed_at: confirmedAt, },)
    .where("id", "=", mergeId,)
    .where("status", "=", "draft",)
    .execute();

  return Number(result[0]?.numUpdatedRows ?? 0,);
}

/**
 * Finalise a confirmed merge: set `result_message_id` and `merged_branch_id`.
 * @param database
 * @param params
 * @param params.mergeId
 * @param params.resultMessageId
 * @param params.mergedBranchId
 * @param params.confirmedAt
 */
export async function finalizeMergeRow(
  database: Kysely<DB>,
  params: {
    mergeId: string;
    resultMessageId: string;
    mergedBranchId: string;
    confirmedAt: string;
  },
): Promise<void> {
  const { mergeId, resultMessageId, mergedBranchId, confirmedAt, } = params;
  await database
    .updateTable("branch_merges",)
    .set({
      result_message_id: resultMessageId,
      merged_branch_id: mergedBranchId,
      confirmed_at: confirmedAt,
    },)
    .where("id", "=", mergeId,)
    .execute();
}
