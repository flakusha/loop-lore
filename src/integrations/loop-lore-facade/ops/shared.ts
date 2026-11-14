// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/ops/shared.ts — the building blocks the
// per-domain facade ops share: the calling principal's identity, the
// per-actor ownership guard, and the two typed rejections.
//
// ONE ownership rule, shared by every domain that reads a CHARACTER's data:
// an actor belongs to the calling user when `actors.owner_id` or
// `actors.user_id` names that user — the same two links the repo's own
// ownership guard reads (src/routes/entity-routes/context.ts). A character
// owned by somebody else is unreachable: the op answers 404, never its data.
// The facade grants NO blanket admin actor access — an admin's token reads
// only what that admin owns.

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import type { FacadeContext, FacadeResult, FacadeToolAnnotations, } from "../types";

/**
 * The calling principal's identity. The facade authz already refused a
 * principal without a user id, so the id is present here.
 * @param ctx - the facade context (server-resolved principal inside)
 * @returns the non-null user id + role
 * @throws {TypeError} when the context lost its user principal
 */
export function callerIdentity(ctx: FacadeContext,): { userId: string; userRole: string | null } {
  if (ctx.principal.userId === null) {
    throw new TypeError("facade op reached handler without a user principal",);
  }

  return { userId: ctx.principal.userId, userRole: ctx.principal.userRole, };
}

/**
 * Whether the CALLING user owns the actor.
 * @param opts - the database handle, the actor id and the calling user id
 * @returns true when the caller owns the actor
 */
export async function callerOwnsActor(opts: {
  database: Kysely<DB>;
  actorId: string;
  userId: string;
},): Promise<boolean> {
  const actor = await opts.database
    .selectFrom("actors",)
    .select(["owner_id", "user_id",],)
    .where("id", "=", opts.actorId,)
    .executeTakeFirst();

  if (!actor) { return false; }

  return actor.owner_id === opts.userId || actor.user_id === opts.userId;
}

/**
 * The behaviour hints every domain-read facade op carries.
 *
 * THE RULE every facade op follows:
 *  - `readOnlyHint` means the op does not change the caller's DOMAIN state.
 *    The audit `log_entries` row the registry writes for every call is
 *    bookkeeping, NOT a domain side effect - it does not flip the hint. An op
 *    that creates or updates domain state declares readOnlyHint: false.
 *  - `idempotentHint` stays UNSET wherever a repeat is not effect-free (the
 *    MCP default is false, so silence is the honest answer). Every op appends
 *    an audit row, so NO op in this facade may claim idempotentHint: true.
 *  - `openWorldHint` stays at the default unless the op touches the open
 *    internet.
 */
export const READ_ONLY_ANNOTATIONS: FacadeToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};

/**
 * The shared 400 rejection for a body that fails the op's schema.
 * @param opName - the op whose schema rejected the body
 * @returns the rejection result
 */
export function badBodyResult(opName: string,): FacadeResult {
  return {
    ok: false,
    status: 400,
    json: { error: "bad_request", message: `body does not match the ${opName} schema`, },
  };
}

/**
 * The shared 404 rejection — a resource the caller may not see does not
 * exist for them (never a 403, which would leak its existence).
 * @param message - what the caller is told
 * @returns the rejection result
 */
export function notFoundResult(message: string,): FacadeResult {
  return { ok: false, status: 404, json: { error: "not_found", message, }, };
}
