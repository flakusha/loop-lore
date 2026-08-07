import type { ChatInviteRow, } from "./types";

export function toRow(row: {
  id: string;
  chat_id: string;
  code: string;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  revoked: number;
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
    revoked: row.revoked === 1,
  };
}
