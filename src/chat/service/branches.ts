// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat branching service (FEAT-045).
 * Branching is a metadata layer on top of `messages.parent_id`: a
 * `chat_branches` row points at the fork point (a `messages.id`), and the
 * branch's message chain is the parent_id walk from that message up to
 * the root. `chats.active_branch_id` records the displayed branch.
 */
import { type Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { checkChatAccess, } from "./access";
import { insertForkRow, } from "./branch-fork";
import { setActiveBranchId, walkMessagePath, } from "./branch-helpers";
import type { ServiceError, } from "./types";

/** One branch as returned to the caller. */
export interface ChatBranchRecord {
  id: string;
  chatId: string;
  parentMessageId: string;
  name: string;
  createdAt: string;
  isActive: boolean;
}

/** Parameters for `forkBranch`. */
export interface ForkBranchParams {
  chatId: string;
  messageId: string;
  actorId: string;
  /** Optional user-supplied branch label. Defaults to "Branch N". */
  name?: string;
}

/** Result type for `forkBranch`. */
export type ForkBranchResult =
  | { ok: true; branch: ChatBranchRecord; messagePath: string[] }
  | ServiceError;

/** Parameters for `switchActiveBranch`. */
export interface SwitchActiveBranchParams {
  chatId: string;
  branchId: string;
  actorId: string;
}

/** Result type for `switchActiveBranch`. */
export type SwitchActiveBranchResult =
  | { ok: true; chatId: string; activeBranchId: string }
  | ServiceError;

/** Branch with computed metadata (message count + last activity). */
export interface ChatBranchWithMeta extends ChatBranchRecord {
  messageCount: number;
  lastActivity: string | null;
}

/** Result type for `listBranches`. */
export type ListBranchesResult =
  | { ok: true; branches: ChatBranchWithMeta[] }
  | ServiceError;

// `getMessagesForBranch` / `listBranches` live in branch-helpers.ts (split
// to stay under the file-size gate); re-exported so existing importers of
// `./branches` keep resolving.
export { getMessagesForBranch, listBranches, } from "./branch-helpers";
/**
 * Create a branch rooted at `messageId`. Returns the branch record and
 * the root-to-fork-point message path. Caller must have chat access
 * (owner/participant/admin). The fork point's chat must match.
 * @param {Kysely<DB>} db
 * @param {ForkBranchParams} params
 * @returns {Promise<ForkBranchResult>}
 */
export async function forkBranch(
  db: Kysely<DB>,
  params: ForkBranchParams,
): Promise<ForkBranchResult> {
  const { chatId, messageId, actorId, } = params;

  const access = await checkChatAccess(db, chatId, actorId, null,);
  if (!access.ok) { return access.error; }

  const message = await db
    .selectFrom("messages",)
    .select(["id", "chat_id",],)
    .where("id", "=", messageId,)
    .executeTakeFirst();

  if (!message || message.chat_id !== chatId) {
    return { code: "not_found", message: "Fork point message not found in chat", };
  }

  const branchId = crypto.randomUUID();
  // insertForkRow demotes the previously active row, inserts the new one as
  // active, and syncs chats.active_branch_id atomically. It also resolves
  // name collisions: a taken user-supplied name is refused, and an auto-name
  // retries past labels occupied by a concurrent fork or a deleted-branch gap.
  const inserted = await insertForkRow(db, { chatId, branchId, parentMessageId: messageId, name: params.name, },);
  if ("code" in inserted) { return inserted; }
  const name = inserted.name;

  const path = await walkMessagePath(db, chatId, messageId,);
  return {
    ok: true,
    branch: {
      id: branchId,
      chatId,
      parentMessageId: messageId,
      name,
      createdAt: new Date().toISOString(),
      isActive: true,
    },
    messagePath: path,
  };
}

/**
 * Set `chats.active_branch_id`. Caller must have chat access; branchId
 * must belong to this chat.
 * @param {Kysely<DB>} db
 * @param {SwitchActiveBranchParams} params
 * @returns {Promise<SwitchActiveBranchResult>}
 */
export async function switchActiveBranch(
  db: Kysely<DB>,
  params: SwitchActiveBranchParams,
): Promise<SwitchActiveBranchResult> {
  const { chatId, branchId, actorId, } = params;

  const access = await checkChatAccess(db, chatId, actorId, null,);
  if (!access.ok) { return access.error; }

  const branch = await db
    .selectFrom("chat_branches",)
    .select(["id", "chat_id",],)
    .where("id", "=", branchId,)
    .executeTakeFirst();

  if (!branch || branch.chat_id !== chatId) {
    return { code: "not_found", message: "Branch not found in chat", };
  }

  // Keep per-row flags in lockstep with chats.active_branch_id so the
  // display invariant (exactly one active branch row per chat) holds.
  await db.transaction().execute(async (tx,) => {
    await setActiveBranchId(tx, chatId, branchId,);
    await tx
      .updateTable("chat_branches",)
      .set({ is_active: 0, },)
      .where("chat_id", "=", chatId,)
      .where("is_active", "=", 1,)
      .execute();

    await tx
      .updateTable("chat_branches",)
      .set({ is_active: 1, },)
      .where("id", "=", branchId,)
      .execute();
  },);

  return { ok: true, chatId, activeBranchId: branchId, };
}
