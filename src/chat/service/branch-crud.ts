// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Branch detail / rename / delete service (FEAT-046).
 *
 * Merge lives in `./branch-merge` and pagination in `./branch-list`; row
 * helpers are shared through `./branch-helpers` so each module stays under
 * the file-size gate. `branches.ts` keeps fork / switch / list untouched.
 *
 * A branch row carries only a fork point (`parent_message_id`); the chain is
 * the `messages.parent_id` walk from there to the root.
 */
import { type Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { BranchTxAbort, isActiveBranch, } from "./branch-fork";
import {
  BRANCH_NOT_FOUND,
  loadBranch,
  withBranch,
  withMeta,
} from "./branch-helpers";
import type { ChatBranchWithMeta, } from "./branches";
import { getMessagesForBranch, switchActiveBranch, } from "./branches";
import type { ServiceError, } from "./types";

/** Shared actor-scoped addressing for one branch row. */
interface BranchMutationParams {
  chatId: string;
  branchId: string;
  actorId: string;
}

/** Result type for `getBranch`. */
export type GetBranchResult =
  | { ok: true; branch: ChatBranchWithMeta; messagePath: string[] }
  | ServiceError;

/** Result type for `renameBranch`. */
export type RenameBranchResult = { ok: true; branch: ChatBranchWithMeta } | ServiceError;

/** Result type for `deleteBranch`. */
export type DeleteBranchResult = { ok: true; deletedBranchId: string } | ServiceError;

/**
 * Branch detail: the record plus its full root-to-tip message path.
 * @param db
 * @param params
 * @returns {Promise<GetBranchResult>}
 */
export async function getBranch(
  db: Kysely<DB>,
  params: BranchMutationParams,
): Promise<GetBranchResult> {
  return withBranch(db, params, async (row,): Promise<GetBranchResult> => {
    const { chatId, branchId, actorId, } = params;
    const messagePath = await getMessagesForBranch(db, chatId, branchId, actorId,);
    return { ok: true, branch: await withMeta(db, chatId, row,), messagePath, };
  },);
}

/**
 * Rename a branch and/or make it active. A supplied blank name is rejected
 * rather than silently dropped.
 * @param db
 * @param params
 * @returns {Promise<RenameBranchResult>}
 */
export async function renameBranch(
  db: Kysely<DB>,
  params: BranchMutationParams & { name?: string; activate?: boolean },
): Promise<RenameBranchResult> {
  return withBranch(db, params, async (row,): Promise<RenameBranchResult> => {
    const { chatId, branchId, actorId, } = params;
    const name = params.name?.trim();
    if (params.name !== undefined && !name) {
      return { code: "bad_request", message: "Branch name must not be blank", };
    }

    if (name !== undefined && name !== row.name) {
      try {
        await db.updateTable("chat_branches",).set({ name, },).where("id", "=", branchId,).execute();
      } catch (error) {
        // The `(chat_id, name)` UNIQUE index (migration 032) rejects a label
        // already used in this chat; say so instead of surfacing a driver error.
        if (!(error instanceof Error && error.message.includes("UNIQUE constraint failed",))) { throw error; }
        return { code: "bad_request", message: `A branch named "${name}" already exists in this chat`, };
      }
    }

    if (params.activate === true) {
      const switched = await switchActiveBranch(db, { chatId, branchId, actorId, },);
      if ("code" in switched) { return switched; }
    }

    const fresh = await loadBranch(db, chatId, branchId,);
    if (!fresh) { return BRANCH_NOT_FOUND; }
    return { ok: true, branch: await withMeta(db, chatId, fresh,), };
  },);
}

/**
 * Delete a branch. Refuses while it is the chat's active one — both the
 * `is_active` row flag and `chats.active_branch_id` count, so a desynced pair
 * still blocks rather than orphaning the chat's display pointer.
 * @param db
 * @param params
 * @returns {Promise<DeleteBranchResult>}
 */
export async function deleteBranch(
  db: Kysely<DB>,
  params: BranchMutationParams,
): Promise<DeleteBranchResult> {
  return withBranch(db, params, async (): Promise<DeleteBranchResult> => {
    const { chatId, branchId, } = params;
    try {
      await db.transaction().execute(async (tx,) => {
        // Re-read BOTH active signals through the transaction, immediately
        // before the delete; a concurrent `PATCH /active-branch` between an
        // outer read and this write would otherwise let the displayed branch be
        // deleted. Throwing forces the rollback — returning from inside
        // `execute` commits whatever the callback already wrote.
        if (await isActiveBranch(tx, chatId, branchId,)) {
          throw new BranchTxAbort({
            code: "bad_request",
            message: "Cannot delete the active branch; switch to another branch first",
          },);
        }

        // Zero rows means a concurrent client deleted it first (double-submit,
        // retry after a timeout). Kysely does not raise on an empty match, so
        // the count is the only evidence — without it a retry reports success
        // for a row that was already gone.
        const deleted = await tx.deleteFrom("chat_branches",).where("id", "=", branchId,).executeTakeFirst();
        if (Number(deleted?.numDeletedRows ?? 0,) === 0) {
          throw new BranchTxAbort(BRANCH_NOT_FOUND,);
        }
      },);
    } catch (error) {
      if (error instanceof BranchTxAbort) { return error.error; }
      throw error;
    }

    return { ok: true, deletedBranchId: branchId, };
  },);
}
