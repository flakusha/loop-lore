// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/chat/invites/create-core.ts
//
// Shared invite-create flow used by both `chat_invites` and `world_invites`.
// The two tables share shape: id, code, created_by, expires_at, max_uses,
// uses, status. They differ only in the scope column (chat_id vs world_id).

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";
import { parseExpiryMs, } from "../../utils/date";
import { generateInviteCode, } from "./code";
import type { InviteError, } from "./types";

export type InviteTableName = "chat_invites" | "world_invites";
export type InviteScopeId = string;
export type ResolveScope<Input,> = (input: Input,) => InviteScopeId;

export interface InviteCreateCommon {
  createdBy: string;
  expiresAt?: string | null;
  maxUses?: number | null;
}

export interface CreateInviteParams<Input extends InviteCreateCommon,> {
  database: Kysely<DB>;
  table: InviteTableName;
  input: Input;
  resolveScope: ResolveScope<Input>;
}

export type InviteResult<T,> =
  | { ok: true; value: T }
  | { ok: false; error: InviteError };

export async function createInviteRow<Input extends InviteCreateCommon,>(
  params: CreateInviteParams<Input>,
): Promise<InviteResult<Record<string, unknown>>> {
  const { database, table, input, resolveScope, } = params;
  const scopeId = resolveScope(input,);

  if (input.maxUses !== null && input.maxUses !== undefined && input.maxUses < 1) {
    return { ok: false, error: { code: "bad_request", message: "maxUses must be at least 1", }, };
  }
  if (input.expiresAt != null && parseExpiryMs(input.expiresAt,) === null) {
    return { ok: false, error: { code: "bad_request", message: "Invalid expiresAt", }, };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    const id = uid();
    try {
      if (table === "chat_invites") {
        await database
          .insertInto("chat_invites",)
          .values({
            id,
            chat_id: scopeId,
            code,
            created_by: input.createdBy,
            expires_at: input.expiresAt ?? null,
            max_uses: input.maxUses ?? null,
            uses: 0,
            status: "active",
          },)
          .execute();
      } else {
        await database
          .insertInto("world_invites",)
          .values({
            id,
            world_id: scopeId,
            code,
            created_by: input.createdBy,
            expires_at: input.expiresAt ?? null,
            max_uses: input.maxUses ?? null,
            uses: 0,
            status: "active",
          },)
          .execute();
      }
      const row = await database
        .selectFrom(table,)
        .selectAll()
        .where("id", "=", id,)
        .executeTakeFirst();
      if (!row) {
        return { ok: false, error: { code: "not_found", message: "Invite not found after insert", }, };
      }
      return { ok: true, value: row, };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error,);
      if (msg.includes("UNIQUE",) || msg.includes("constraint",)) {
        continue;
      }
      throw error;
    }
  }

  return { ok: false, error: { code: "conflict", message: "Failed to generate a unique code", }, };
}
