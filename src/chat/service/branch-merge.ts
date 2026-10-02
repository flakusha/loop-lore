// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Branch merge service (FEAT-046).
 *
 * `messages` has no per-message branch column — a branch is a `parent_id`
 * fork point — so merge is re-parenting rather than a tree merge: the
// hint: Logic and cosmetic changes overlap. Resolve logic first, then reformat.
 * ROOT of the source branch's exclusive subtree hangs off the target's
 * tip, and every other node keeps the parent it already had. Sibling
 * branches under the fork point therefore stay siblings instead of being
 * flattened into one line. The target's tip then advances to the deepest
 * node of the merged line.
 *
 * **A merge consumes the source branch.** The `parent_id` rewrite is
 * permanent, so the pre-merge path is unrecoverable; keeping the source row
 * would leave a branch whose walk resolves to the target's line. The source
 * row is therefore DELETED in the same transaction, matching the standard
 * "merge deletes the merged branch" model. Merging the chat's active branch
 * is refused so the display pointer is never left on a deleted row.
 */
import { type Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { BranchTxAbort, isActiveBranch, } from "./branch-fork";
import {
  activeBranchId,
  BRANCH_NOT_FOUND,
  loadBranch,
  walkMessagePath,
  withBranch,
} from "./branch-helpers";
import type { ServiceError, } from "./types";

/** Result type for `mergeBranch`. */
export type MergeBranchResult =
  | {
    ok: true;
    sourceBranchId: string;
    targetBranchId: string;
    movedMessageIds: string[];
    /** Echoed: the source row was consumed and no longer exists. */
    deletedSourceBranchId: string;
  }
  | ServiceError;

// ponytail: 2000-node ceiling bounds the subtree BFS; a chat deeper than
// this is not a real chat. Exhaustion REJECTS the merge (see
// `exclusiveSubtree`) instead of truncating — raise deliberately.
const MAX_MERGE_NODES = 2000;

/** A subtree walk plus whether the node cap cut it short. */
interface ExclusiveSubtree {
  ids: string[];
  /** true when the frontier was still non-empty at `MAX_MERGE_NODES`. */
  exhausted: boolean;
}

/**
 * Descendants of `forkPointId` that are NOT on the target's path, in walk
 * order. Target-path nodes are never expanded, so shared history (and its
 * subtree) is excluded transitively. The fork point itself is included only
 * when the target never contained it, keeping the re-parented chain
 * contiguous with the target tip.
 * @param db
 * @param chatId
 * @param forkPointId
 * @param exclude
 * @returns {Promise<ExclusiveSubtree>}
 */
async function exclusiveSubtree(
  db: Kysely<DB>,
  chatId: string,
  forkPointId: string,
  exclude: Set<string>,
): Promise<ExclusiveSubtree> {
  const out: string[] = exclude.has(forkPointId,) ? [] : [forkPointId,];
  const seen = new Set<string>([...exclude, forkPointId,],);
  let frontier: string[] = [forkPointId,];
  while (frontier.length > 0) {
    if (out.length >= MAX_MERGE_NODES) { return { ids: out, exhausted: true, }; }
    const rows = await db
      .selectFrom("messages",)
      .select(["id",],)
      .where("chat_id", "=", chatId,)
      .where("parent_id", "in", frontier,)
      .orderBy("id",)
      .execute();

    frontier = [];
    for (const row of rows) {
      if (seen.has(row.id,)) { continue; }
      seen.add(row.id,);
      out.push(row.id,);
      frontier.push(row.id,);
    }
  }

  return { ids: out, exhausted: false, };
}

/**
 * The branch a merge should land in: the explicit request, else the chat's
 * `active_branch_id`, else the `is_active = 1` row. The last fallback keeps
 * chats that forked before the pointer column was populated working.
 * @param db
 * @param chatId
 * @param requested
 * @returns {Promise<string | null>}
 */
async function resolveTarget(
  db: Kysely<DB>,
  chatId: string,
  requested: string | undefined,
): Promise<string | null> {
  if (requested !== undefined) { return requested; }
  const displayed = await activeBranchId(db, chatId,);
  if (displayed) { return displayed; }
  const active = await db
    .selectFrom("chat_branches",)
    .select(["id",],)
    .where("chat_id", "=", chatId,)
    .where("is_active", "=", 1,)
    .executeTakeFirst();

  return active?.id ?? null;
}

/** Parameters for `mergeBranch`. */
export interface MergeBranchParams {
  chatId: string;
  /** The branch being consumed. */
  branchId: string;
  actorId: string;
  /** Destination; defaults to the chat's displayed branch. */
  intoBranchId?: string;
}

/**
 * Merge the source branch into the target (default: the chat's active
 * branch) and DELETE the source row — a merge consumes the branch it merges.
 * No conflict resolution. The chat's active branch is refused, and a source
 * subtree over `MAX_MERGE_NODES` is rejected before anything is re-parented.
 * @param db
// hint: Logic and cosmetic changes overlap. Resolve logic first, then reformat.
 * @param params
 * @returns {Promise<MergeBranchResult>}
 */
export async function mergeBranch(
  db: Kysely<DB>,
  params: MergeBranchParams,
): Promise<MergeBranchResult> {
  return withBranch(db, params, async (source,): Promise<MergeBranchResult> => {
    const { chatId, branchId, } = params;
    const targetId = await resolveTarget(db, chatId, params.intoBranchId,);
    if (!targetId) { return { code: "bad_request", message: "Chat has no active branch", }; }
    if (targetId === branchId) {
      return { code: "bad_request", message: "Cannot merge a branch into itself", };
    }
    const target = await loadBranch(db, chatId, targetId,);
    if (!target) { return { code: "not_found", message: "Target branch not found in chat", }; }
    // The source row is deleted below; consuming the displayed branch would
    // leave the chat pointing at a missing row. This outer check is only a fast
    // fail — the AUTHORITATIVE guard re-runs inside the transaction, immediately
    // before the delete (a concurrent `PATCH /active-branch` between the two
    // would otherwise slip in and orphan the display).
    if (await isActiveBranch(db, chatId, branchId,)) {
      return {
        code: "bad_request",
        message: "Cannot merge the active branch; switch to another branch first",
      };
    }

    const targetPath = new Set(await walkMessagePath(db, chatId, target.parent_message_id,),);
    const subtree = await exclusiveSubtree(db, chatId, source.parent_message_id, targetPath,);
    // Budget check BEFORE the transaction: a truncated move would rewrite the
    // source's path while silently dropping the tail.
    if (subtree.exhausted) {
      return {
        code: "bad_request",
        message: `Subtree exceeds merge ceiling of ${MAX_MERGE_NODES} nodes`,
      };
    }
    const moved = subtree.ids;
    // An empty subtree means the source forked off a node the target already
    // contains: there is nothing to move, so consuming the row would delete a
    // user-visible branch for zero effect. Refuse explicitly instead.
    if (moved.length === 0) {
      return { code: "bad_request", message: "Source branch has no messages to merge", };
    }

    try {
      await db.transaction().execute(async (tx,) => {
        // Re-read BOTH active signals through the transaction, immediately
        // before the delete. Throwing (rather than returning) is what forces
        // the rollback — a `return` inside `execute` COMMITS the re-parenting.
        if (await isActiveBranch(tx, chatId, branchId,)) {
          throw new BranchTxAbort({
            code: "bad_request",
            message: "Cannot merge the active branch; switch to another branch first",
          },);
        }
        // ONLY the subtree root moves. `exclusiveSubtree` discovered every
        // other node FROM the parent it still has, so their `parent_id` is
        // already correct — rewriting them would chain the BFS walk order
        // into a single line and flatten sibling branches onto each other.
        await tx
          .updateTable("messages",)
          .set({ parent_id: target.parent_message_id, },)
          .where("id", "=", moved[0]!,)
          .execute();
        // `exclusiveSubtree` is a BFS, so `moved` is non-decreasing in depth
        // and its last id is a deepest leaf of the moved subtree — the new tip
        // of the target's line. Non-empty by the guard above, so it exists.
        const tip = moved[moved.length - 1]!;
        await tx
          .updateTable("chat_branches",)
          .set({ parent_message_id: tip, },)
          .where("id", "=", targetId,)
          .execute();
        // Consume the source: the re-parenting above is permanent, so a
        // surviving row would resolve to the target's line, not its own. Zero
        // rows means a concurrent client consumed it first; aborting rolls the
        // re-parenting back rather than reporting a merge that half happened.
        const deleted = await tx
          .deleteFrom("chat_branches",)
          .where("id", "=", branchId,)
          .executeTakeFirst();
        if (Number(deleted?.numDeletedRows ?? 0,) === 0) {
          throw new BranchTxAbort(BRANCH_NOT_FOUND,);
        }
      },);
    } catch (error) {
      if (error instanceof BranchTxAbort) { return error.error; }
      throw error;
    }

    return {
      ok: true,
      sourceBranchId: branchId,
      targetBranchId: targetId,
      movedMessageIds: moved,
      deletedSourceBranchId: branchId,
    };
  },);
}
