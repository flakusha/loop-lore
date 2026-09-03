// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createInviteRow, } from "../invites/create-core";
import { toRow, } from "./to-row";
import type { CreateWorldInviteInput, WorldInviteRow, } from "./types";
import type { InviteResult, } from "../invites";

/**
 * Create a new invite for a world with a unique code.
 * @param database
 * @param input
 */
export async function createWorldInvite(
  database: Kysely<DB>,
  input: CreateWorldInviteInput,
): Promise<InviteResult<WorldInviteRow>> {
  const result = await createInviteRow<CreateWorldInviteInput>({
    database,
    table: "world_invites",
    input,
    resolveScope: (i) => i.worldId,
  });
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: toRow(result.value as never) };
}
