import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { ErrorResponse, Id, LocationStateBody, SuccessResponse, } from "../../validation/schemas";
import { handleLocationState, } from "./handlers";

const locationStateResponse = t.Object({
  id: t.String(),
  locationId: t.String(),
  state: t.Record(t.String(), t.Any(),),
},);

export function storyLocationStateRoutes({ database, }: { database: Kysely<DB> }, prefix = "/api",) {
  return new Elysia({ name: "story-states-location", },)
    .get(`${prefix}/locations/:id/state`, async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleLocationState(database, "GET", ctx.params.id, userId, userRole,);
    }, {
      params: t.Object({ id: Id, },),
      response: {
        200: locationStateResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get location state",
        description: "Get the current state of a location.",
        tags: ["Story States",],
      },
    },)
    .put(`${prefix}/locations/:id/state`, async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleLocationState(
        database,
        "PUT",
        ctx.params.id,
        userId,
        userRole,
        ctx.body as Record<string, unknown>,
      );
    }, {
      params: t.Object({ id: Id, },),
      body: LocationStateBody,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Update location state",
        description: "Update the state of a location (weather, time of day, events, etc).",
        tags: ["Story States",],
      },
    },);
}
