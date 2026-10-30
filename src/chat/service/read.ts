// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Message read operations: access check, listing, variants.
 */
import type { Kysely, } from "kysely";
import { ChatVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";
import { walkMessagePath, } from "./branch-helpers";
import { isChatOwner, } from "./owners-core";
import type {
  ListMessagesParams,
  ServiceError,
} from "./types";

/**
 * Check if a user can access a specific message.
 * @param database
 * @param messageId
 * @param userId
 * @param userRole
 * @returns The message row if access granted, or ServiceError
 */
export async function getMessageWithAccess(
  database: Kysely<DB>,
  messageId: string,
  userId: string | null,
  userRole: string | null,
): Promise<Record<string, unknown> | ServiceError> {
  const message = await database
    .selectFrom("messages",)
    .selectAll()
    .where("id", "=", messageId,)
    .executeTakeFirst();

  if (!message) {
    return { code: "not_found", message: "Message not found", };
  }

  const chat = await database
    .selectFrom("chats",)
    .select(["created_by", "visibility",],)
    .where("id", "=", message.chat_id,)
    .executeTakeFirst();

  if (!chat) {
    return { code: "not_found", message: "Message not found", };
  }

  if (can(userRole, "admin.chat",) || (userId !== null && await isChatOwner(database, message.chat_id, userId,))) {
    return message;
  }

  // Public-chat branch mirrors checkChatAccess: guests (null userId, guest
  // role via `chat.join`) and authed strangers may read single messages.
  if (
    chat.visibility === ChatVisibility.Public &&
    (userId !== null || can(userRole, "chat.join",))
  ) {
    return message;
  }

  return { code: "not_found", message: "Message not found", };
}

/**
 * List messages in a chat with pagination and variant info.
 * @param database
 * @param params
 * @returns void
 */
export async function listMessages(
  database: Kysely<DB>,
  params: ListMessagesParams,
): Promise<{ data: Record<string, unknown>[]; total: number }> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  // BUG-324a2c9: with a conversation branch active (and no pinned parentId),
  // the default list is the ACTIVE BRANCH's root-to-tip path — not every row
  // in the chat — so switching branches actually swaps the displayed chain.
  if (params.parentId === undefined) {
    const branchList = await listActiveBranchPage(database, params.chatId, page, pageSize,);
    if (branchList) { return branchList; }
  }

  let countQuery = database
    .selectFrom("messages",)
    .select(database.fn.countAll<number>().as("total",),)
    .where("chat_id", "=", params.chatId,)
    .where("visibility", "=", "visible",);

  if (params.parentId !== undefined) {
    countQuery = countQuery.where("parent_id", "=", params.parentId,);
  }

  const countResult = await countQuery.executeTakeFirst();
  const total = countResult?.total ?? 0;

  let listQuery = database
    .selectFrom("messages",)
    .selectAll()
    .where("chat_id", "=", params.chatId,)
    .where("visibility", "=", "visible",);

  if (params.parentId !== undefined) {
    listQuery = listQuery.where("parent_id", "=", params.parentId,);
  }

  const messages = await listQuery
    .orderBy("created_at", "asc",)
    .limit(pageSize,)
    .offset(offset,)
    .execute();

  const enriched = await withVariantInfo(database, params.chatId, messages,);

  return { data: enriched as unknown as Record<string, unknown>[], total, };
}

/**
 * Bug 324a2c9: page the ACTIVE branch's root-to-tip message path instead of
 * every row in the chat. Returns null when the chat has no resolvable active
 * branch, so unbranched chats keep the flat created_at listing.
 * @param database
 * @param chatId
 * @param page
 * @param pageSize
 */
async function listActiveBranchPage(
  database: Kysely<DB>,
  chatId: string,
  page: number,
  pageSize: number,
): Promise<{ data: Record<string, unknown>[]; total: number } | null> {
  const chat = await database
    .selectFrom("chats",)
    .select(["active_branch_id",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat?.active_branch_id) { return null; }

  const branch = await database
    .selectFrom("chat_branches",)
    .select(["parent_message_id",],)
    .where("id", "=", chat.active_branch_id,)
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();

  if (!branch) { return null; }

  const pathIds = await walkMessagePath(database, chatId, branch.parent_message_id,);
  if (pathIds.length === 0) { return { data: [], total: 0, }; }

  // Visibility filter keeps the count contract (invisible rows are hidden).
  const visible = await database
    .selectFrom("messages",)
    .selectAll()
    .where("id", "in", pathIds,)
    .where("chat_id", "=", chatId,)
    .where("visibility", "=", "visible",)
    .execute();

  const byId = new Map(visible.map((row,) => [row.id, row,]),);
  const ordered = pathIds
    .map((id,) => byId.get(id,))
    .filter((row,): row is (typeof visible)[number] => row !== undefined);

  const offset = (page - 1) * pageSize;
  const messages = ordered.slice(offset, offset + pageSize,);
  const enriched = await withVariantInfo(database, chatId, messages,);
  return { data: enriched as unknown as Record<string, unknown>[], total: ordered.length, };
}

/**
 * Attach swipe variant counts/indexes to the page rows.
 * @param database
 * @param chatId
 * @param messages
 */
async function withVariantInfo(
  database: Kysely<DB>,
  chatId: string,
  messages: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  // Compute variant counts/indexes
  const parentIdSet = new Set<string>();
  for (const m of messages) { if (m.parent_id) { parentIdSet.add(m.parent_id as string,); } }
  const parentIds = [...parentIdSet,];
  const variantCounts = new Map<string, number>();
  const variantIndexes = new Map<string, number>();

  if (parentIds.length > 0) {
    const siblings = await database
      .selectFrom("messages",)
      .select(["id", "parent_id", "swipe_index", "created_at",],)
      .where("parent_id", "in", parentIds,)
      .where("chat_id", "=", chatId,)
      .where("visibility", "=", "visible",)
      .orderBy("swipe_index", "asc",)
      .orderBy("created_at", "asc",)
      .execute();

    const groups = new Map<string, { id: string; swipeIndex: number | null; createdAt: string }[]>();
    for (const s of siblings) {
      const pid = s.parent_id!;
      if (!groups.has(pid,)) { groups.set(pid, [],); }
      groups.get(pid,)!.push({ id: s.id, swipeIndex: s.swipe_index, createdAt: s.created_at, },);
    }

    for (const [pid, items,] of groups) {
      variantCounts.set(pid, items.length,);
      for (const [idx, item,] of items.entries()) { variantIndexes.set(item.id, idx,); }
    }
  }

  return Array.from(messages, (m,) => ({
    ...m,
    variantIndex: m.parent_id ? (variantIndexes.get(m.id as string,) ?? 0) : undefined,
    totalVariants: m.parent_id ? (variantCounts.get(m.parent_id as string,) ?? 1) : undefined,
  }),);
}

/**
 * Get message variants (swipe alternatives).
 * @param database
 * @param parentId
 * @param chatId
 * @returns void
 */
export async function getMessageVariants(
  database: Kysely<DB>,
  parentId: string,
  chatId: string,
): Promise<Record<string, unknown>[]> {
  return database
    .selectFrom("messages",)
    .selectAll()
    .where("parent_id", "=", parentId,)
    .where("chat_id", "=", chatId,)
    .orderBy("swipe_index", "asc",)
    .orderBy("created_at", "asc",)
    .execute();
}
