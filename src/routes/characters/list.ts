// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { ActorVisibility, } from "../../db/enums";
import { can, } from "../../users/permissions";
import {
  ActorsQuery,
  ErrorResponse,
} from "../../validation/schemas";
import { jsonPaginated, parsePagination, } from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { actors: { get: { body: unknown; params: {}; query: { ...; }; headers: unknown; response: { ...; }; }; }; }; }, { .....}
 */
export function listRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "characters-list", },)
    .get(
      `${prefix}/actors`,
      async (ctx: any,) => {
        const type = ctx.query.type;
        const { page, pageSize, } = parsePagination(new URL(ctx.request.url,).searchParams,);
        const offset = (page - 1) * pageSize;

        let countQuery = database.selectFrom("actors",).select(database.fn.countAll<number>().as("total",),);
        let listQuery = database.selectFrom("actors",).selectAll();

        if (type) {
          countQuery = countQuery.where("actor_type", "=", type,);
          listQuery = listQuery.where("actor_type", "=", type,);
        }

        const userId = ctx.userId as string | null;
        const userRole = ctx.userRole as string | null;
        if (userId) {
          countQuery = countQuery.where((eb,) => eb("owner_id", "=", userId,).or("owner_id", "is", null,));
          listQuery = listQuery.where((eb,) => eb("owner_id", "=", userId,).or("owner_id", "is", null,));
        } else if (can(userRole, "character.view",)) {
          // Guest tier: an account-less visitor sees exactly the set the
          // single-actor read admits (GET /api/actors/:actorId) — PUBLIC
          // actors only. Gated on the role so a null id WITHOUT the tier
          // (derive denied the request, bare test double) matches nothing —
          // no account-less enumeration of every user's private cast.
          countQuery = countQuery.where("visibility", "=", ActorVisibility.Public,);
          listQuery = listQuery.where("visibility", "=", ActorVisibility.Public,);
        } else {
          // No identity and no guest tier: the derive denied this request —
          // ids are non-null PKs, so this matches nothing.
          countQuery = countQuery.where("id", "is", null,);
          listQuery = listQuery.where("id", "is", null,);
        }

        const countResult = await countQuery.executeTakeFirst();
        const total = countResult?.total ?? 0;
        const actors = await listQuery.orderBy("display_name", "asc",).limit(pageSize,).offset(offset,).execute();

        return jsonPaginated({ data: actors, total, page, pageSize, },);
      },
      {
        query: ActorsQuery,
        response: {
          200: t.Object({ data: t.Array(t.Any(),), total: t.Number(), page: t.Number(), pageSize: t.Number(), },),
          401: ErrorResponse,
        },
        detail: {
          summary: "List actors",
          description: "List characters and other actors. Supports pagination and type filtering.",
          tags: ["Characters",],
        },
      },
    );
}
