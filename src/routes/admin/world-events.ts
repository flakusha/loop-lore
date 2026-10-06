// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { discoveryDb, listWorldEvents, } from "../../rpg/world-discovery";
import { ErrorResponse, } from "../../validation/schemas";
import { AdminPaginatedEnvelope, AdminWorldEventRow, } from "../../validation/schemas/responses";
import {
  ErrorCode,
  HttpStatus,
  jsonError,
  jsonResponse,
  parsePagination,
  withPermissionAuth,
} from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/**
 * Read-only view of `world_event_log` — the simulation events the
 * `discovery` dispatch target appends each tick (`location:discovered`,
 * `trade:route`, and whatever later migrations add).
 *
 * Gated on `admin.system` like every other admin list, because the log
 * carries actor ids and world content. There is no write endpoint: the log
 * is appended by the tick and nothing else, so exposing a mutator would be a
 * way to forge simulation history.
 *
 * The query is delegated whole to `listWorldEvents`, which owns the total
 * ORDER BY and the page-size ceiling. This file owns nothing but the auth
 * and the response envelope.
 * @param opts
 * @param prefix
 */
export function worldEventsRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  const { database, } = opts;
  return (
    new Elysia({ name: "admin-world-events", },)
      // ── World event log ─────────────────────────────────────
      .get(
        `${prefix}/admin/world-events`,
        async (ctx: any,) => {
          return withPermissionAuth(ctx, "admin.system", async () => {
            const url = new URL(ctx.request.url,);
            const { page, pageSize, } = parsePagination(url.searchParams,);
            const worldId = url.searchParams.get("world_id",);
            if (!worldId) {
              return jsonError({
                message: "world_id is required",
                status: HttpStatus.BadRequest,
                code: ErrorCode.BadRequest,
              },);
            }

            const result = await listWorldEvents(discoveryDb(database,), {
              worldId,
              eventType: url.searchParams.get("event_type",) ?? undefined,
              page,
              pageSize,
            },);

            return jsonResponse(result,);
          },);
        },
        {
          response: {
            200: AdminPaginatedEnvelope(AdminWorldEventRow,),
            400: ErrorResponse,
            403: ErrorResponse,
          },
        },
      )
  );
}
