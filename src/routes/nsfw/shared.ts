// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { getLogger, type Logger, } from "../../logger";
import { canAccessNsfw, } from "../../middleware/nsfw-gate/access";
import { checkNsfwWithConsent, } from "../../middleware/nsfw-gate/consent";
import { checkActorOwnership, } from "../actor-auth";
import { forbiddenResponse, jsonError, requireUserId, } from "../http-utils";

/** */
function log(): Logger {
  return getLogger().child({ module: "nsfw-routes", },);
}

export { log, };

/** Minimal Elysia context shape for NSFW route access checks. */
export interface NsfwRouteAccessContext {
  /** Role from the session (admin/solo/users). */
  userRole?: string | null;
  /** i18n translation function, if wired. */
  t?: (key: string, ...args: unknown[]) => string;
}

/** Failure reason for {@link requireNsfwActorAccess} / {@link requireNsfwRouteAccess}. */
export type NsfwRouteAccessFailure =
  | "auth_required"
  | "nsfw_disabled"
  | "age_gate_not_accepted"
  | "underage"
  | "invalid_birth_date"
  | "user_not_found"
  | "consent_required"
  | "consent_revoked"
  | "participant_blocked"
  | "predefined";

/**
 * Normalize a gate reason (which may be a dynamic string such as
 * `underage:17`) into the stable {@link NsfwRouteAccessFailure} union.
 * @param reason
 */
function toNsfwRouteAccessFailure(reason: string | undefined,): NsfwRouteAccessFailure {
  if (!reason) { return "predefined"; }
  if (reason.startsWith("underage:",)) { return "underage"; }
  return reason as NsfwRouteAccessFailure;
}

/**
 * Require the caller to own `targetActor` (or be admin/solo). Returns userId on success, else a Response.
 * @param database
 * @param targetActor
 * @param ctx
 */
export async function requireNsfwActorAccess(
  database: Kysely<DB>,
  targetActor: string,
  ctx: NsfwRouteAccessContext,
): Promise<string | Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  const ok = await checkActorOwnership(database, targetActor, userId, ctx.userRole ?? null,);
  if (!ok) { return forbiddenResponse(); }
  return userId;
}

/**
 * N2 authZ helper — layered on top of ownership:
 * - always authN (`requireUserId`)
 * - always base NSFW access (`canAccessNsfw`: config + age gate + min age)
 * - when `chatId` + `actorId` are supplied: persisted consent per (user, chat)
 *
 * Returns `{ ok: true, userId }` on success, or a `{ ok: false, reason }`
 * failure that the caller converts to a 401/403. Never mutates state on
 * denial — the caller returns the refusal before any roll/mutation.
 * @param database
 * @param config
 * @param userId
 * @param opts
 * @param opts.chatId - chat scope for the persisted consent ledger
 * @param opts.actorId - actor whose content rating gates the consent check
 */
export async function requireNsfwRouteAccess(
  database: Kysely<DB>,
  config: Config,
  userId: string,
  opts: { chatId?: string | null; actorId?: string | null } = {},
): Promise<{ ok: true; userId: string } | { ok: false; reason: NsfwRouteAccessFailure }> {
  const base = await canAccessNsfw(database, config, userId,);
  if (!base.allowed) {
    return { ok: false, reason: toNsfwRouteAccessFailure(base.reason,), };
  }

  // Consent only applies at actor-targeted surfaces where a chat is present.
  if (opts.chatId && opts.actorId) {
    const gate = await checkNsfwWithConsent({
      database,
      config,
      userId,
      chatId: opts.chatId,
      actorId: opts.actorId,
    },);
    if (!gate.allowed) {
      return { ok: false, reason: toNsfwRouteAccessFailure(gate.reason,), };
    }
  }

  return { ok: true, userId, };
}

/**
 * Convert a {@link NsfwRouteAccessFailure} into an HTTP response.
 * @param reason
 */
export function nsfwAccessErrorResponse(reason: NsfwRouteAccessFailure,): Response {
  if (reason === "auth_required") {
    return jsonError("Authentication required", 401,);
  }
  return jsonError(`NSFW access denied: ${reason}`, 403,);
}
