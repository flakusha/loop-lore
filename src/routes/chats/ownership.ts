// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { transferOwnership, } from "../../chat/service";
import {
  badRequestResponse,
  forbiddenResponse,
  jsonError,
  jsonResponse,
  notFoundResponse,
  requireUserId,
} from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * POST /api/chats/:id/transfer-ownership
 *
 * Body: { newOwnerId: string, reason?: string }
 *
 * Authority: admin OR the current owner (`transferOwnership` re-checks).
 *
 * Errors:
 *   400 — self-transfer / new owner already current owner / chat has no owner
 *   403 — requester is neither admin nor the current owner
 *   404 — chat not found
 * @param opts
 * @param prefix
 */
export function ownershipRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config: _config, } = opts;

  return new Elysia({ name: "chats-ownership", },).post(
    `${prefix}/chats/:id/transfer-ownership`,
    async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const userRole = (ctx.userRole as string | null) ?? null;

      const chatId = (ctx.params as { id: string }).id;
      const body = ctx.body as { newOwnerId?: string; reason?: string };

      // Belt-and-braces: the `t.Object` schema below rejects missing/invalid
      // `newOwnerId` with 422 before this handler runs (pinned by the 422 route
      // test). The runtime check covers malformed bodies (no content-type, etc.).
      if (!body?.newOwnerId || typeof body.newOwnerId !== "string") {
        return badRequestResponse("newOwnerId required",);
      }

      const outcome = await transferOwnership(database, {
        chatId,
        requesterId: userId,
        requesterRole: userRole,
        newOwnerId: body.newOwnerId,
        reason: body.reason,
      },);

      if (!outcome.ok) {
        switch (outcome.error.code) {
          case "not_found":
            return notFoundResponse("Chat not found",);
          case "forbidden":
            return forbiddenResponse(outcome.error.message,);
          case "bad_request":
            return badRequestResponse(outcome.error.message,);
          default:
            return jsonError({ message: "Unknown error", status: 500, },);
        }
      }

      return jsonResponse({
        ok: true,
        chatId,
        previousOwnerId: outcome.result.previousOwnerId,
        newOwnerId: outcome.result.newOwnerId,
        autoInvited: outcome.result.autoInvited,
      },);
    },
    {
      params: t.Object({ id: t.String(), },),
      body: t.Object({
        newOwnerId: t.String(),
        reason: t.Optional(t.String({ maxLength: 500, },),),
      },),
    },
  );
}
