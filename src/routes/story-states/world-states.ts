import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import {
  ErrorResponse,
  Id,
  PaginationQuery,
  WorldStateCreateBody,
} from "../../validation/schemas";
import { handleWorldStates, } from "./handlers";

const worldStateListItem = t.Object({ id: t.String(), },);

const worldStatesListResponse = t.Object({
  data: t.Array(worldStateListItem,),
  total: t.Number(),
  page: t.Number(),
  pageSize: t.Number(),
  totalPages: t.Number(),
},);

export function storyWorldStateRoutes({ database, }: { database: Kysely<DB> }, prefix = "/api",) {
  return new Elysia({ name: "story-states-world", },)
    .get(`${prefix}/worlds/:worldId/states`, async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const { worldId, } = ctx.params;
      return handleWorldStates(
        database,
        "GET",
        worldId,
        userId,
        userRole,
        Number(ctx.query?.page,) || 1,
        Number(ctx.query?.pageSize,) || 20,
      );
    }, {
      params: t.Object({ worldId: Id, },),
      query: PaginationQuery,
      response: {
        200: worldStatesListResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "List world states",
        description: "List all world states for a world. Paginated.",
        tags: ["Story States",],
      },
    },)
    .post(`${prefix}/worlds/:worldId/states`, async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const { worldId, } = ctx.params;
      return handleWorldStates(
        database,
        "POST",
        worldId,
        userId,
        userRole,
        1,
        20,
        ctx.body as Record<string, unknown>,
      );
    }, {
      params: t.Object({ worldId: Id, },),
      body: WorldStateCreateBody,
      response: {
        200: t.Object({ id: t.String(), },),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Create world state",
        description: "Create a new world state snapshot for a world.",
        tags: ["Story States",],
      },
    },);
}
