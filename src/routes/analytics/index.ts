// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Conversation analytics route barrel (FEAT-059).
 *
 * Endpoints: per-chat detail, cross-chat overview, per-character comparison.
 * Query bodies live in the sibling modules to keep each file under the size gate.
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { charactersHandler, } from "./characters";
import { chatDetailHandler, } from "./chats";
import { overviewHandler, } from "./overview";
import type { AnalyticsCtx, } from "./types";

interface HandleOpts {
  database: Kysely<DB>;
}

/**
 * @param root0
 * @param root0.database
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, {}, { derive: {}; resolve: {}; schema: {}; standaloneSchema: {}; response: {}; }, { ...; }>}
 */
export function analyticsRoutes({ database, }: HandleOpts, prefix = "/api",): Elysia {
  const hooks = { response: { 200: SuccessResponse, 401: ErrorResponse, }, };

  // `as unknown as AnalyticsCtx` is the sanctioned single boundary cast: the
  // global derive populates `userId`, but a standalone plugin's ctx type does
  // not carry it. See skill://route-ctx-typing.
  return new Elysia({ name: "analytics", },)
    .get(
      `${prefix}/analytics/chats/:chatId`,
      (ctx,) => chatDetailHandler(database, ctx as unknown as AnalyticsCtx,),
      hooks,
    )
    .get(`${prefix}/analytics/overview`, (ctx,) => overviewHandler(database, ctx as unknown as AnalyticsCtx,), hooks,)
    .get(
      `${prefix}/analytics/characters`,
      (ctx,) => charactersHandler(database, ctx as unknown as AnalyticsCtx,),
      hooks,
    );
}
