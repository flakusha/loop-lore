// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createInviteRow, } from "./create-core";
import { toRow, } from "./to-row";
import type { ChatInviteRow, CreateInviteInput, InviteResult, } from "./types";

/**
 * Create a new invite for a chat with a unique code.
 * @param database
 * @param input
 */
export async function createInvite(
  database: Kysely<DB>,
  input: CreateInviteInput,
): Promise<InviteResult<ChatInviteRow>> {
  const result = await createInviteRow<CreateInviteInput>({
    database,
    table: "chat_invites",
    input,
    resolveScope: (i,) => i.chatId,
  },);
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: toRow(result.value as never,), };
}
