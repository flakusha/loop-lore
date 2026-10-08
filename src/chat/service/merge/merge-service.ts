// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Content-merge orchestration (FEA-2026-047): initiate.
 * Preview lives in `merge-preview.ts`; confirm + continue in
 * `merge-confirm.ts`; render helpers in `merge-render.ts`.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../../config/schema";
import type { DB, } from "../../../db/schema";
import { checkChatAccess, } from "../access";
import {
  baseOrdinal,
  type MergeError,
  MergeMode,
  overlayOrdinal,
} from "./merge-criteria";
import { type MergeSourceTip, resolveMergeGraph, } from "./merge-graph";
import {
  computeOverlayHunks,
  loadMergeSources,
} from "./merge-render";
import {
  insertMergeRow,
  insertSourceRows,
  loadMergeByIdempotencyKey,
  type MergeMetadata,
  updateMergeMetadata,
} from "./merge-store";

/** Options for {@link initiateMerge}. */
export interface InitiateMergeOptions {
  database: Kysely<DB>;
  config: Config;
  params: {
    chatId: string;
    actorId: string;
    userRole: string | null;
    mode: MergeMode;
    sourceTips: MergeSourceTip[];
    idempotencyKey?: string;
  };
}

/** Result of {@link initiateMerge}. */
export type InitiateMergeResult =
  | {
    ok: true;
    mergeId: string;
    replayed: boolean;
    baseMessageId: string;
    sources: { ordinal: number; tipMessageId: string; tailLength: number }[];
  }
  | MergeError;

/**
 * Initiate a content merge: access-check, resolve the graph, persist the
 * draft merge + sources, and compute the initial overlay preview for
 * deterministic modes.
 *
 * Idempotent via `uq_branch_merges_idem`: a repeated idempotency key
 * returns the existing draft with `replayed: true`.
 * @param options
 * @throws {Error} when the DB driver fails
 * @returns {Promise<InitiateMergeResult>}
 */
export async function initiateMerge(options: InitiateMergeOptions,): Promise<InitiateMergeResult> {
  const { database, params, } = options;
  const { chatId, actorId, userRole, mode, sourceTips, idempotencyKey, } = params;

  const access = await checkChatAccess(database, chatId, actorId, userRole,);
  if (!access.ok) { return access.error; }

  if (sourceTips.length < 2) {
    return { code: "bad_request", message: "At least two source tips are required", };
  }

  if (idempotencyKey) {
    const existing = await loadMergeByIdempotencyKey(database, { chatId, idempotencyKey, },);
    if (existing) {
      const sources = await loadMergeSources(database, existing.id,);
      return {
        ok: true,
        mergeId: existing.id,
        replayed: true,
        baseMessageId: existing.base_message_id,
        sources,
      };
    }
  }

  const graphResult = await resolveMergeGraph(database, { chatId, tips: sourceTips, },);
  if (!("ok" in graphResult)) { return graphResult; }
  const { graph, } = graphResult;

  const mergeId = await insertMergeRow(database, {
    chatId,
    baseMessageId: graph.baseMessageId,
    mode,
    createdBy: actorId,
    idempotencyKey: idempotencyKey ?? null,
  },);

  await insertSourceRows(database, {
    mergeId,
    sources: graph.sources.map((s: { ordinal: number; branchId: string | null; tipMessageId: string },) => ({
      ordinal: s.ordinal,
      branchId: s.branchId,
      tipMessageId: s.tipMessageId,
    })),
  },);

  const metadata: MergeMetadata = {};
  const base = baseOrdinal(mode,);
  const overlay = overlayOrdinal(mode,);
  if (base !== null && overlay !== null) {
    const hunks = await computeOverlayHunks(database, chatId, graph, base, overlay,);
    if (hunks) {
      metadata.preview = {
        kind: "overlay",
        hunks,
        tokenEstimate: { sharedPrefix: 0, perSource: [], },
        truncated: false,
        generatedAt: new Date().toISOString(),
        attempts: 0,
      };

      await updateMergeMetadata(database, { mergeId, metadata, },);
    }
  }

  return {
    ok: true,
    mergeId,
    replayed: false,
    baseMessageId: graph.baseMessageId,
    sources: graph.sources.map((s: { ordinal: number; tipMessageId: string; tail: string[] },) => ({
      ordinal: s.ordinal,
      tipMessageId: s.tipMessageId,
      tailLength: s.tail.length,
    })),
  };
}
