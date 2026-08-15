import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";
import { generateInviteCode, } from "./code";
import { toRow, } from "./to-row";
import type { ChatInviteRow, CreateInviteInput, InviteResult, } from "./types";

/**
 * Create a new invite for a chat with a unique code.
 *
 * Retries code generation on the (rare) collision. `expiresAt` and `maxUses`
 * are optional; both being unset yields a code that never expires and has no
 * redemption cap.
 *
 * @throws on unexpected DB failure (caller should let it bubble to error handling)
 */
export async function createInvite(
  database: Kysely<DB>,
  input: CreateInviteInput,
): Promise<InviteResult<ChatInviteRow>> {
  if (input.maxUses !== null && input.maxUses !== undefined && input.maxUses < 1) {
    return { ok: false, error: { code: "bad_request", message: "maxUses must be at least 1", }, };
  }
  if (
    input.expiresAt &&
    input.expiresAt !== null &&
    Number.isNaN(Date.parse(input.expiresAt,),)
  ) {
    return { ok: false, error: { code: "bad_request", message: "Invalid expiresAt", }, };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    const id = uid();
    try {
      await database
        .insertInto("chat_invites",)
        .values({
          id,
          chat_id: input.chatId,
          code,
          created_by: input.createdBy,
          expires_at: input.expiresAt ?? null,
          max_uses: input.maxUses ?? null,
          uses: 0,
          status: "active",
        },)
        .execute();
      const row = await database
        .selectFrom("chat_invites",)
        .selectAll()
        .where("id", "=", id,)
        .executeTakeFirst();
      if (!row) {
        return { ok: false, error: { code: "not_found", message: "Invite not found after insert", }, };
      }
      return { ok: true, value: toRow(row,), };
    } catch (error) {
      // Unique constraint on `code` — retry with a fresh code.
      const msg = error instanceof Error ? error.message : String(error,);
      if (msg.includes("UNIQUE",) || msg.includes("constraint",)) {
        continue;
      }
      throw error;
    }
  }

  return { ok: false, error: { code: "conflict", message: "Failed to generate a unique code", }, };
}
