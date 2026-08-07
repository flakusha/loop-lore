import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { toRow, } from "./to-row";
import type { ChatInviteRow, } from "./types";

/** List all invites for a chat (including revoked/expired), newest first. */
export async function listInvites(
  database: Kysely<DB>,
  chatId: string,
): Promise<ChatInviteRow[]> {
  const rows = await database
    .selectFrom("chat_invites",)
    .selectAll()
    .where("chat_id", "=", chatId,)
    .orderBy("created_at", "desc",)
    .execute();
  return Array.from(rows, (row,) => toRow(row,),);
}
