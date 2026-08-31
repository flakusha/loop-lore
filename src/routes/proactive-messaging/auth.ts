// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Authorization helpers for proactive messaging routes.
 *
 * Every endpoint validates two things before touching the service layer:
 *   1. The authenticated user owns the `actorId` (or has `admin.character`).
 *   2. The authenticated user has access to `chatId` (creator, participant,
 *      or `admin.chat`). Both gates use the existing helpers
 *      `checkActorOwnership` / `checkChatAccess`; `actorId` is therefore
 *      scoped to the requester — a participant cannot target another
 *      user's actor via query manipulation.
 *
 * Split rationale: keeps the route file focused on Elysia wiring; the
 * auth shape + 401/404 logic lives here so the route handler bodies stay
 * focused on the service call.
 */
import type { Context, } from "elysia";
import type { Kysely, } from "kysely";
import { checkChatAccess, } from "../../chat/service";
import type { DB, } from "../../db/schema";
import { checkActorOwnership, } from "../actor-auth";
import { HttpStatus, jsonError, requireUserId, } from "../http-utils";

/**
 * Shape of the auth-guard context that the global elysia-app derive populates
 * (`userId`, `userRole`). Tests inject the same shape via `.derive(...)`.
 * Defined as a named interface so route handlers stay narrowly typed without
 * the `any` banned-pattern.
 */
export interface AuthContext {
  userId: string | null;
  userRole: string | null;
}

/** Route handler context — augments Elysia's auto context with auth fields. */
export type Ctx = Context & AuthContext;

/**
 * Verify the authenticated user owns `actorId` AND has access to `chatId`.
 * Returns the userId on success; on failure returns a Response that the
 * caller should return as-is (401 / 404).
 *
 * Both checks fail-closed with `notFound` (404) to avoid leaking which
 * dimension of the authorization failed.
 * @param database
 * @param ctx
 * @param chatId
 * @param actorId
 */
export async function authorizeProactiveTarget(
  database: Kysely<DB>,
  ctx: Ctx,
  chatId: string,
  actorId: string,
): Promise<string | Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  const userRole = ctx.userRole;

  if (!(await checkActorOwnership(database, actorId, userId, userRole,))) {
    return jsonError({
      message: "Actor not found",
      status: HttpStatus.NotFound,
    },);
  }

  const access = await checkChatAccess(database, chatId, userId, userRole,);
  if (!access.ok) {
    return jsonError({
      message: "Chat not found",
      status: HttpStatus.NotFound,
    },);
  }

  return userId;
}
