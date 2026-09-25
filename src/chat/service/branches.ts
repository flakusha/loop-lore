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

/**
 * Walk `messages.parent_id` from `tipId` up to the root, returning
 * root-to-tip message ids. Bounded by `maxDepth` to defend against
 * pathological/cyclic trees.
 */
async function walkMessagePath(
  db: Kysely<DB>,
  chatId: string,
  tipId: string,
  maxDepth = 1000,
): Promise<string[]> {
  const path: string[] = [];
  let current: string | null = tipId;
  let depth = 0;
  while (current !== null && depth < maxDepth) {
    const row = await db
      .selectFrom("messages",)
      .select(["id", "parent_id", "chat_id",],)
      .where("id", "=", current,)
      .executeTakeFirst();
    if (!row || row.chat_id !== chatId) { break; }
    path.push(row.id,);
    current = row.parent_id;
    depth += 1;
  }
  return path.reverse();
}

/** Next auto-name: "Branch N" where N is the existing count + 1. */
async function nextAutoName(db: Kysely<DB>, chatId: string,): Promise<string> {
  const row = await db
    .selectFrom("chat_branches",)
    .select((eb,) => eb.fn.count<number>("id",).as("n",))
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();
  return `Branch ${Number(row?.n ?? 0,) + 1}`;
}

/**
 * Create a branch rooted at `messageId`. Returns the branch record and
 * the root-to-fork-point message path. Caller must have chat access
 * (owner/participant/admin). The fork point's chat must match.
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

  const name = params.name?.trim() || (await nextAutoName(db, chatId,));
  const branchId = crypto.randomUUID();
  await db
    .insertInto("chat_branches",)
    .values({
      id: branchId,
      chat_id: chatId,
      parent_message_id: messageId,
      name,
      is_active: 1,
    },)
    .execute();

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

  await db
    .updateTable("chats",)
    .set({ active_branch_id: branchId, },)
    .where("id", "=", chatId,)
    .execute();

  return { ok: true, chatId, activeBranchId: branchId, };
}

/**
 * Resolve the message chain for a branch: walk from the branch tip
 * (parent_message_id) to the root. Returns root-to-tip message ids.
 */
export async function getMessagesForBranch(
  db: Kysely<DB>,
  chatId: string,
  branchId: string,
): Promise<string[]> {
  const branch = await db
    .selectFrom("chat_branches",)
    .select(["chat_id", "parent_message_id",],)
    .where("id", "=", branchId,)
    .executeTakeFirst();
  if (!branch || branch.chat_id !== chatId) { return []; }
  return walkMessagePath(db, chatId, branch.parent_message_id,);
}

/**
 * List all branches in a chat with computed metadata. Caller must have
 * chat access (owner/participant/admin). `isActive` mirrors the per-row
 * `is_active` flag; the displayed branch equals `chats.active_branch_id`.
 */
export async function listBranches(
  db: Kysely<DB>,
  chatId: string,
  actorId: string,
): Promise<ListBranchesResult> {
  const access = await checkChatAccess(db, chatId, actorId, null,);
  if (!access.ok) { return access.error; }

  const rows = await db
    .selectFrom("chat_branches",)
    .selectAll()
    .where("chat_id", "=", chatId,)
    .orderBy("created_at", "asc",)
    .execute();

  const out: ChatBranchWithMeta[] = [];
  for (const row of rows) {
    const tip = row.parent_message_id;
    const tipRow = await db
      .selectFrom("messages",)
      .select(["created_at",],)
      .where("id", "=", tip,)
      .executeTakeFirst();
    const path = await walkMessagePath(db, chatId, tip,);
    out.push({
      id: row.id,
      chatId: row.chat_id,
      parentMessageId: tip,
      name: row.name,
      createdAt: row.created_at,
      isActive: Number(row.is_active,) === 1,
      messageCount: path.length,
      lastActivity: tipRow?.created_at ?? null,
    },);
  }
  return { ok: true, branches: out, };
}
