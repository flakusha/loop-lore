// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import {
  ActorsQuery,
  ErrorResponse,
} from "../../validation/schemas";
import { jsonPaginated, } from "../http-utils";
import type { HandlerOpts, } from "./types";

export function listRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "characters-list", },)
    .get(
      `${prefix}/actors`,
      async (ctx: any,) => {
        const { page, pageSize, type, } = ctx.query;
        const offset = (page - 1) * pageSize;

        let countQuery = database.selectFrom("actors",).select(database.fn.countAll<number>().as("total",),);
        let listQuery = database.selectFrom("actors",).selectAll();

        if (type) {
          countQuery = countQuery.where("actor_type", "=", type,);
          listQuery = listQuery.where("actor_type", "=", type,);
        }

        const userId = ctx.userId as string | null;
        if (userId) {
          countQuery = countQuery.where((eb,) => eb("owner_id", "=", userId,).or("owner_id", "is", null,));
          listQuery = listQuery.where((eb,) => eb("owner_id", "=", userId,).or("owner_id", "is", null,));
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
