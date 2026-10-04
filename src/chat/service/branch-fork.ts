// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Branch fork helpers (FEAT-045/046).
 *
 * `BranchTxAbort`, `isActiveBranch`, and `insertForkRow` — the fork-specific
 * helpers that need transaction-aware active-branch checks.
 */
import { type Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { nextAutoName, } from "./branch-helpers";
import type { ServiceError, } from "./types";

/**
 * Aborts a branch transaction. Throwing (rather than returning) is what forces
 * the rollback — a `return` inside `execute` COMMITS the re-parenting.
 */
export class BranchTxAbort extends Error {
  constructor(readonly error: ServiceError,) {
    super(error.message,);
    this.name = "BranchTxAbort";
  }
}

/**
 * Both active signals for `branchId`, read through the caller's executor.
 * @param db
 * @param chatId
 * @param branchId
 * @returns {Promise<boolean>}
 */
export async function isActiveBranch(
  db: Kysely<DB>,
  chatId: string,
  branchId: string,
): Promise<boolean> {
  const activeId = await db
    .selectFrom("chats",)
    .select(["active_branch_id",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (activeId?.active_branch_id === branchId) { return true; }
  const row = await db
    .selectFrom("chat_branches",)
    .select(["is_active",],)
    .where("id", "=", branchId,)
    .executeTakeFirst();

  return Number(row?.is_active ?? 0,) === 1;
}

/**
 * Insert attempts before an auto-named fork gives up. Only a CONCURRENT fork
 * can trigger a retry; a deterministic failure (bad name, no chat) returns
 * immediately.
 */
const AUTO_NAME_ATTEMPTS = 5;

/**
 * Lowest `Branch N` above the chat's current count that is NOT already taken.
 *
 * The count alone cannot pick the name: deleting a branch leaves a gap, so
 * `count + 1` may itself be taken and `count + 1 + attempt` only walks one
 * further label per failed insert — a five-wide gap exhausts any small bound
 * and refuses an ordinary fork. One read of the taken set closes that in a
 * single step, and the UNIQUE index still arbitrates the genuine race between
 * two forks that read the same set.
 * @param db
 * @param chatId
 * @returns {Promise<string>}
 */
async function nextFreeAutoName(db: Kysely<DB>, chatId: string,): Promise<string> {
  const rows = await db
    .selectFrom("chat_branches",)
    .select(["name",],)
    .where("chat_id", "=", chatId,)
    .execute();

  const used = new Set(rows.map((row,) => row.name),);
  let n = rows.length + 1;
  while (used.has(`Branch ${n}`,)) { n += 1; }
  return `Branch ${n}`;
}

/**
 * Create a fork's branch row: demote the chat's previously active row and
 * insert the new one as active. Caller must have chat access.
 * @param db
 * @param params
 * @param params.chatId
 * @param params.branchId
 * @param params.parentMessageId
 * @param params.name
 * @returns {Promise<{ name: string } | ServiceError>}
 */
export async function insertForkRow(
  db: Kysely<DB>,
  params: { chatId: string; branchId: string; parentMessageId: string; name?: string },
): Promise<{ name: string } | ServiceError> {
  const { chatId, branchId, parentMessageId, } = params;
  const supplied = params.name?.trim();
  for (let attempt = 0; attempt < AUTO_NAME_ATTEMPTS; attempt++) {
    // The count is only a hint — resolve against the taken set so a gap left by
    // a deleted branch cannot walk the candidate into an occupied label.
    const name = supplied || (attempt === 0 ? await nextAutoName(db, chatId,) : await nextFreeAutoName(db, chatId,));
    try {
      await db.transaction().execute(async (tx,) => {
        await tx
          .updateTable("chat_branches",)
          .set({ is_active: 0, },)
          .where("chat_id", "=", chatId,)
          .where("is_active", "=", 1,)
          .execute();

        await tx
          .insertInto("chat_branches",)
          .values({
            id: branchId,
            chat_id: chatId,
            parent_message_id: parentMessageId,
            name,
            is_active: 1,
          },)
          .execute();

        // FK to chat_branches.id — runs after the insert above. Keeps
        // `chats.active_branch_id` in lockstep with the per-row `is_active`
        // flag, the same invariant `switchActiveBranch` maintains.
        await tx
          .updateTable("chats",)
          .set({ active_branch_id: branchId, },)
          .where("id", "=", chatId,)
          .execute();
      },);

      return { name, };
    } catch (error) {
      // Only a name conflict is retryable; any other driver error is real.
      const conflict = error instanceof Error && error.message.includes("UNIQUE constraint failed",);
      if (!conflict) { throw error; }
      if (supplied) {
        return { code: "bad_request", message: 'A branch named "' + supplied + '" already exists in this chat', };
      }
    }
  }

  return { code: "bad_request", message: "Could not allocate a unique branch name; retry", };
}
