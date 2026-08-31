// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { InviteStatus, } from "../../db/enums";
import type { ChatInviteRow, } from "./types";

/**
 * @param row
 * @param row.id
 * @param row.chat_id
 * @param row.code
 * @param row.created_by
 * @param row.created_at
 * @param row.expires_at
 * @param row.max_uses
 * @param row.uses
 * @param row.status
 */
export function toRow(row: {
  id: string;
  chat_id: string;
  code: string;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  status: InviteStatus;
},): ChatInviteRow {
  return {
    id: row.id,
    chatId: row.chat_id,
    code: row.code,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    uses: row.uses,
    status: row.status,
  };
}
