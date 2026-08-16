// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { toRow, } from "./to-row";
import type { WorldInviteRow, } from "./types";

/** List all invites for a world (including revoked/expired), newest first. */
export async function listWorldInvites(
  database: Kysely<DB>,
  worldId: string,
): Promise<WorldInviteRow[]> {
  const rows = await database
    .selectFrom("world_invites",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .orderBy("created_at", "desc",)
    .execute();
  return Array.from(rows, (row,) => toRow(row,),);
}
