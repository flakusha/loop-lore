// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { InviteStatus, } from "../../db/enums";
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
  status: InviteStatus;
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
    status: row.status,
  };
}
