/**
 * Message read operations: access check, listing, variants.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type {
  ListMessagesParams,
  ServiceError,
} from "./types";

/**
 * Check if a user can access a specific message.
 *
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
    .select("created_by",)
    .where("id", "=", message.chat_id,)
    .executeTakeFirst();

  if (!chat || (chat.created_by !== userId && userRole !== "admin" && userRole !== "solo")) {
    return { code: "not_found", message: "Message not found", };
  }

  return message;
}

/**
 * List messages in a chat with pagination and variant info.
 */
export async function listMessages(
  database: Kysely<DB>,
  params: ListMessagesParams,
): Promise<{ data: Record<string, unknown>[]; total: number }> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

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

  // Compute variant counts/indexes
  const parentIds = [...new Set(messages.map((m,) => m.parent_id).filter(Boolean,),),];
  const variantCounts = new Map<string, number>();
  const variantIndexes = new Map<string, number>();

  if (parentIds.length > 0) {
    const siblings = await database
      .selectFrom("messages",)
      .select(["id", "parent_id", "swipe_index", "created_at",],)
      .where("parent_id", "in", parentIds as string[],)
      .where("chat_id", "=", params.chatId,)
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

  const enriched = messages.map((m,) => ({
    ...m,
    variantIndex: m.parent_id ? (variantIndexes.get(m.id,) ?? 0) : undefined,
    totalVariants: m.parent_id ? (variantCounts.get(m.parent_id,) ?? 1) : undefined,
  }));

  return { data: enriched as unknown as Record<string, unknown>[], total, };
}

/**
 * Get message variants (swipe alternatives).
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
