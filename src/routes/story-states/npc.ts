import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { ErrorResponse, Id, NpcStateBody, SuccessResponse, } from "../../validation/schemas";
import { handleNpcsAtLocation, handleNpcState, } from "./handlers";

const npcStateResponse = t.Object({
  id: t.String(),
  actorId: t.String(),
  worldId: t.Optional(t.String(),),
  status: t.Optional(t.String(),),
},);

const npcsAtLocationResponse = t.Array(t.Object({
  actorId: t.String(),
  displayName: t.String(),
},),);

export function storyNpcStateRoutes({ database, }: { database: Kysely<DB> },) {
  return new Elysia({ name: "story-states-npc", },)
    .get("/api/worlds/:worldId/npc-states/:actorId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const { worldId, actorId, } = ctx.params;
      return handleNpcState(database, "GET", worldId, actorId, userId, userRole,);
    }, {
      params: t.Object({ worldId: Id, actorId: Id, },),
      response: {
        200: npcStateResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get NPC state",
        description: "Get the current state of an NPC in a world.",
        tags: ["Story States",],
      },
    },)
    .put("/api/worlds/:worldId/npc-states/:actorId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const { worldId, actorId, } = ctx.params;
      return handleNpcState(database, "PUT", worldId, actorId, userId, userRole, ctx.body as Record<string, unknown>,);
    }, {
      params: t.Object({ worldId: Id, actorId: Id, },),
      body: NpcStateBody,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Update NPC state",
        description: "Update the state of an NPC in a world (location, status, mood, etc).",
        tags: ["Story States",],
      },
    },)
    .get("/api/worlds/:worldId/npcs-at/:locationId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      const { worldId, locationId, } = ctx.params;
      return handleNpcsAtLocation(database, worldId, locationId, userId, userRole,);
    }, {
      params: t.Object({ worldId: Id, locationId: Id, },),
      response: {
        200: npcsAtLocationResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "List NPCs at location",
        description: "List all NPCs currently at a specific location in a world.",
        tags: ["Story States",],
      },
    },);
}
