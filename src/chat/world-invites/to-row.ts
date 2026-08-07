import type { WorldInviteRow, } from "./types";

export function toRow(row: {
  id: string;
  world_id: string;
  code: string;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  revoked: number;
},): WorldInviteRow {
  return {
    id: row.id,
    worldId: row.world_id,
    code: row.code,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    uses: row.uses,
    revoked: row.revoked === 1,
  };
}
