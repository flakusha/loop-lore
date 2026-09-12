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
 * Body: { newOwnerId: string, confirm: true, reason?: string }
 *
 * Authority: admin OR the current owner (`transferOwnership` re-checks).
 *
 * Errors:
 *   400 — self-transfer / new owner already current owner / chat has no owner
 *   403 — requester is neither admin nor the current owner
 *   404 — chat not found / new-owner actor not found
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
      const body = ctx.body as { newOwnerId?: string; confirm?: boolean; reason?: string };

      // Belt-and-braces: the `t.Object` schema below rejects missing/invalid
      // `newOwnerId` with 422 before this handler runs (pinned by the 422 route
      // test). The runtime check covers malformed bodies (no content-type, etc.).
      if (!body?.newOwnerId || typeof body.newOwnerId !== "string") {
        return badRequestResponse("newOwnerId required",);
      }

      // Explicit confirmation gate (ticket AC): the transfer only proceeds
      // on `confirm: true`. Missing `confirm` is rejected by the schema
      // below with 422; an explicit false lands here with 400.
      if (body.confirm !== true) {
        return badRequestResponse("Transfer requires explicit confirmation (confirm: true)",);
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
            return notFoundResponse(outcome.error.message,);
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
        confirm: t.Boolean(),
        reason: t.Optional(t.String({ maxLength: 500, },),),
      },),
    },
  );
}
