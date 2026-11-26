// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared per-message delete authorization. The single DELETE route and the
 * bulk-delete route both go through here, so a batch can never widen access
 * beyond what an individual delete allows.
 */
import type { Kysely, } from "kysely";
import { checkChatAccess, } from "../../chat/service";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";

/** Minimal message shape the delete path needs. */
export interface DeletableMessage {
  id: string;
  chat_id: string;
  actor_id: string;
}

/** Outcome of the shared delete guard. */
export type DeleteAuthorization =
  | { ok: true; message: DeletableMessage }
  | { ok: false; reason: "not_found" | "forbidden" };

/**
 * Resolve one message and apply the single-delete rules: chat access plus
 * author (or chat admin) ownership. Missing/inaccessible rows collapse to
 * `not_found` so the route is not an existence oracle.
 */
export async function authorizeMessageDelete(
  database: Kysely<DB>,
  id: string,
  actorId: string,
  userRole: string | null,
): Promise<DeleteAuthorization> {
  const message = await database
    .selectFrom("messages",)
    .select(["id", "chat_id", "actor_id",],)
    .where("id", "=", id,)
    .executeTakeFirst();

  if (!message) { return { ok: false, reason: "not_found", }; }

  const access = await checkChatAccess(database, message.chat_id, actorId, userRole,);
  if (!access.ok) { return { ok: false, reason: "not_found", }; }

  if (message.actor_id !== actorId && !can(userRole, "admin.chat",)) {
    return { ok: false, reason: "forbidden", };
  }

  return { ok: true, message, };
}
