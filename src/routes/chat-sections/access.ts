import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

/** Chat ownership or admin check; returns true when allowed. */
export async function chatAccess(
  database: Kysely<DB>,
  chatId: string,
  userId: string,
  userRole: string | null,
): Promise<boolean> {
  const chat = await database
    .selectFrom("chats",)
    .select("created_by",)
    .where("id", "=", chatId,)
    .executeTakeFirst();
  return !!chat && (chat.created_by === userId || userRole === "admin");
}
