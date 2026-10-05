// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin carriage route — the only read path for the carriage channel.
 *
 * Carriage records (cross-context state carried between sections, parties,
 * and sessions) are visible to admins and developers only; no
 * chat-scoped/participant-facing route selects from `carriage_records`
 * (TASK-chat-feature-notes-shadow-carriage AC3).
 */
import { Elysia, t, } from "elysia";
import { listCarriage, } from "../../chat/service/carriage";
import { can, } from "../../users/permissions";
import { ChatIdParams, ErrorResponse, } from "../../validation/schemas";
import { forbiddenResponse, jsonResponse, notFoundResponse, requireUserId, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/**
 * Admin-only carriage read path — the sole route that selects from
 * `carriage_records` (carriage AC3). Unknown chats 404.
 * @param opts
 * @param prefix
 */
export function carriageRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  const app = new Elysia({ name: "admin-carriage", },);
  return app.get(
    `${prefix}/admin/chats/:id/carriage`,
    async (ctx: any,) => {
      const callerId = requireUserId(ctx,);
      if (typeof callerId !== "string") { return callerId; }
      if (!can(ctx.userRole, "admin.system",)) { return forbiddenResponse(); }
      const { id, } = ctx.params as { id: string };
      const chat = await opts.database.selectFrom("chats",).select("id",).where("id", "=", id,).executeTakeFirst();
      if (!chat) { return notFoundResponse(); }
      const records = await listCarriage(opts.database, id,);
      return jsonResponse({ data: records, },);
    },
    {
      params: ChatIdParams,
      response: { 200: t.Any(), 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
    },
  );
}
