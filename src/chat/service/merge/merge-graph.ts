// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Merge graph resolution (FEA-2026-047).
 *
 * Pure reads over `messages.parent_id`: load each source tip, walk to the
 * root, compute the lowest common ancestor (the merge base) and each
 * source's divergent tail. The node ceiling mirrors `MAX_MERGE_NODES` in
 * `src/chat/service/branch-merge.ts` — an over-budget walk is REJECTED, not
 * truncated.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { walkMessagePath, } from "../branch-helpers";
import type { MergeError, } from "./merge-criteria";

/**
 * Walk ceiling for one merge: the summed length of every source path. A chat
 * deeper than this is not a real chat; exhaustion rejects the merge.
 */
export const MAX_MERGE_NODES = 2000;

/** One resolved merge source. */
export interface MergeSource {
  ordinal: number;
  tipMessageId: string;
  branchId: string | null;
  /** Divergence-to-tip message ids in root-to-tip order; never empty. */
  tail: string[];
}

/** Graph resolution outcome. */
export interface MergeGraph {
  baseMessageId: string;
  sources: MergeSource[];
  /** Total nodes walked across every source path (ceiling accounting). */
  nodeCount: number;
}

/** One requested source tip, in picker order. */
export interface MergeSourceTip {
  tipMessageId: string;
  branchId?: string;
}

/** Result of {@link resolveMergeGraph}. */
export type ResolveMergeGraphResult = { ok: true; graph: MergeGraph } | MergeError;

/**
 * Lowest common ancestor of two root-to-tip paths (both start at the root).
 * Returns null when they share no node — distinct chats/trees.
 * @param a
 * @param b
 * @returns {string | null}
 */
export function lowestCommonAncestor(a: string[], b: string[],): string | null {
  const limit = Math.min(a.length, b.length,);
  let lca: string | null = null;
  for (let i = 0; i < limit; i++) {
    if (a[i] !== b[i]) { break; }
    lca = a[i]!;
  }

  return lca;
}

/**
 * Fold the LCA over every source path by shrinking the common prefix.
 * Null when the paths diverge at the root (no shared ancestor).
 * @param paths
 * @returns {string | null}
 */
function commonAncestorOfAll(paths: string[][],): string | null {
  const first = paths[0];
  if (!first || first.length === 0) { return null; }

  let depth = first.length;
  for (const path of paths.slice(1,)) {
    const limit = Math.min(depth, path.length,);
    let shared = 0;
    while (shared < limit && first[shared] === path[shared]) { shared++; }
    depth = shared;
    if (depth === 0) { return null; }
  }

  return first[depth - 1]!;
}

/**
 * Resolve the merge base and per-source tails.
 *
 * Every tip is walked with `walkMessagePath` (which itself enforces a chat
 * match), so a tip from another chat resolves to a shorter/absent path and
 * is rejected as `not_found`. A source whose tip IS the base has no
 * divergent messages and is rejected (`bad_request`), mirroring
 * `mergeBranch`'s empty-subtree refusal.
 * @param database
 * @param params
 * @param params.chatId
 * @param params.tips
 * @throws {Error} when a source tip row cannot be read (DB driver failure)
 * @returns {Promise<ResolveMergeGraphResult>}
 */
export async function resolveMergeGraph(
  database: Kysely<DB>,
  params: { chatId: string; tips: MergeSourceTip[] },
): Promise<ResolveMergeGraphResult> {
  const { chatId, tips, } = params;

  const paths: string[][] = [];
  let nodeCount = 0;
  for (const tip of tips) {
    const exists = await database
      .selectFrom("messages",)
      .select(["id", "chat_id",],)
      .where("id", "=", tip.tipMessageId,)
      .executeTakeFirst();

    if (!exists || exists.chat_id !== chatId) {
      return { code: "not_found", message: "Source tip not found in chat", };
    }

    // Walk with the ceiling as maxDepth so a path deeper than the budget
    // returns a full-length (capped) array instead of silently truncating
    // at walkMessagePath's own default, which would hide the overrun.
    const path = await walkMessagePath(database, chatId, tip.tipMessageId, MAX_MERGE_NODES + 1,);
    nodeCount += path.length;
    if (nodeCount > MAX_MERGE_NODES) {
      return {
        code: "bad_request",
        message: `Merge exceeds the ceiling of ${MAX_MERGE_NODES} walked nodes`,
      };
    }

    paths.push(path,);
  }

  const baseMessageId = commonAncestorOfAll(paths,);
  if (baseMessageId === null) {
    return { code: "bad_request", message: "Merge sources share no common ancestor", };
  }

  const sources: MergeSource[] = [];
  for (const [ordinal, path,] of paths.entries()) {
    const divergence = path.indexOf(baseMessageId,);
    const tail = path.slice(divergence + 1,);
    if (tail.length === 0) {
      return { code: "bad_request", message: "Source has no divergent messages", };
    }

    sources.push({
      ordinal,
      tipMessageId: tips[ordinal]!.tipMessageId,
      branchId: tips[ordinal]!.branchId ?? null,
      tail,
    },);
  }

  return { ok: true, graph: { baseMessageId, sources, nodeCount, }, };
}
