// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Ownership scoping for the `/dynamic/*` view fragments.
 *
 * Every loader under `routes/views/` takes a `ViewsViewer` so an unscoped read
 * cannot be written by accident: the auth derive leaves `ctx.userId` null for
 * anonymous callers rather than 401ing (`src/elysia-app.ts`), so each route
 * must narrow it itself before loading.
 */
import { type Expression, type ExpressionBuilder, type SqlBool, } from "kysely";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";

/** Who is asking for a view fragment, resolved from the auth derive. */
export interface ViewsViewer {
  userId: string;
  userRole: string | null;
}

/**
 * Chats a viewer may see: the ones they created or participate in.
 *
 * Mirrors `checkChatAccess` (`src/chat/service/access.ts`). Chat creation
 * stores the creator's *user* id as the `owner` participant's `actor_id`
 * (`src/chat/service/crud/create.ts`), so `created_by` and the participant
 * `actor_id` share one id domain and both compare directly against `userId`.
 * @param viewer - who is asking
 * @returns a `where()` callback for a `chats` query
 */
export function visibleChatsTo(
  { userId, userRole, }: ViewsViewer,
): (eb: ExpressionBuilder<DB, "chats">,) => Expression<SqlBool> {
  if (can(userRole, "admin.chat",)) { return (eb,) => eb.val(true,); }

  return (eb,) =>
    eb.or([
      eb("chats.created_by", "=", userId,),
      eb.exists(
        eb.selectFrom("chat_participants",)
          .select("chat_participants.chat_id",)
          .whereRef("chat_participants.chat_id", "=", "chats.id",)
          .where("chat_participants.actor_id", "=", userId,),
      ),
    ],);
}

/**
 * Characters a viewer may see: the `actors` rows they own.
 *
 * `admin.character` holders see every character — the same rule
 * `checkActorOwnership` (`src/routes/actor-auth.ts`) applies to the per-
 * character edit form, so the grid and the form cannot drift apart.
 * @param viewer - who is asking
 * @returns a `where()` callback for an `actors` query
 */
export function visibleCharactersTo(
  { userId, userRole, }: ViewsViewer,
): (eb: ExpressionBuilder<DB, "actors">,) => Expression<SqlBool> {
  if (can(userRole, "admin.character",)) { return (eb,) => eb.val(true,); }
  return (eb,) => eb("actors.owner_id", "=", userId,);
}
