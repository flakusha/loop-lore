// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Resource extraction endpoints. Reads and writes the CRAFTING epic's
 * `gathering_node_instances` — there is no second node table.
 *
 *   GET  /api/worlds/:worldId/resources?locationId=
 *   POST /api/worlds/:worldId/resources/extract
 *   POST /api/worlds/:worldId/resources/regenerate
 *
 * `extract` is a PLAYER action, so it needs only world access; `regenerate` is a
 * sweep over every location IN THAT WORLD and belongs to the owner.
 *
 * The caller never sees a seed or a clock: `attemptExtraction` derives both from
 * the node and the request. A re-rolled client is not a replay client, because
 * the node's `remaining_amount` and the recorded `extraction_rolls` row both
 * move whether or not the roll succeeds.
 */
import { Elysia, t, } from "elysia";
import { ErrorResponse, } from "../../validation/schemas";
import {
  attemptExtraction,
  listResources,
  MAX_ABILITY_BONUS,
  regenerateResources,
  ResourceError,
} from "../../worlds/resources";
import { resolvePrimaryActorId, } from "../actor-access";
import { extractAuth, HttpStatus, jsonError, jsonResponse, notFoundResponse, } from "../http-utils";
import { requireWorldAccess, requireWorldOwner, } from "./access";
import type { HandleOpts, } from "./types";

/** One node as the list endpoint reports it. */
const ResourceSummary = t.Object({
  nodeInstanceId: t.String(),
  name: t.String(),
  nodeType: t.String(),
  quality: t.String(),
  extractionDifficulty: t.Integer(),
  /** `null` means the node never depletes. */
  remainingAmount: t.Union([t.Integer(), t.Null(),],),
  state: t.String(),
},);

const ExtractionYield = t.Object({ itemId: t.String(), quantity: t.Integer(), },);

/** A domain rejection mapped to its HTTP status. A failed ROLL is not an
 * error — it is a 200 with `succeeded: false` — so only engine-level refusals
 * land here. */
function resourceErrorResponse(error: ResourceError,): Response {
  const status = error.code === "not-found" || error.code === "cross-world"
    ? HttpStatus.NotFound
    : HttpStatus.BadRequest;

  return jsonError({ message: error.message, status, },);
}

export function resourceRoutes(opts: HandleOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "worlds-resources", },)
    .get(
      `${prefix}/worlds/:worldId/resources`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }

        const list = await listResources(database, ctx.params.worldId, ctx.query.locationId,);
        return jsonResponse({ data: list, },);
      },
      {
        query: t.Object({ locationId: t.Optional(t.String(),), },),
        response: { 200: t.Object({ data: t.Array(ResourceSummary,), },), 404: ErrorResponse, },
        detail: { summary: "List harvestable nodes at a location", tags: ["Worlds",], },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/resources/extract`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }

        const actorId = userId ? await resolvePrimaryActorId(database, userId,) : null;
        if (!actorId) { return notFoundResponse("User actor",); }

        try {
          const result = await attemptExtraction(
            database,
            ctx.params.worldId,
            ctx.body.locationId,
            ctx.body.nodeInstanceId,
            actorId,
            { abilityBonus: ctx.body.abilityBonus, },
          );

          return jsonResponse({ data: result, },);
        } catch (error) {
          if (error instanceof ResourceError) { return resourceErrorResponse(error,); }
          throw error;
        }
      },
      {
        body: t.Object({
          locationId: t.String({ minLength: 1, },),
          nodeInstanceId: t.String({ minLength: 1, },),
          /**
// hint: Logic changed on both sides. Requires understanding intent of each change.
           * Skill/profession bonus applied to the DC before the roll. Bounded to
           * [0, MAX_ABILITY_BONUS]: an unbounded bonus is subtracted from the DC,
           * so `abilityBonus: 1000` would clamp every node to difficulty 1 — a
           * guaranteed success on every roll. The schema is the trust boundary.
           */
          abilityBonus: t.Optional(t.Integer({ minimum: 0, maximum: MAX_ABILITY_BONUS, },),),
        },),
        response: {
          200: t.Object({
            data: t.Object({
              succeeded: t.Boolean(),
              difficulty: t.Integer(),
              yield: t.Array(ExtractionYield,),
              remaining: t.Union([t.Integer(), t.Null(),],),
            },),
          },),
          400: ErrorResponse,
          404: ErrorResponse,
        },
        detail: { summary: "Attempt an extraction against a node instance", tags: ["Worlds",], },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/resources/regenerate`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldOwner(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }

        const result = await regenerateResources(database, { worldId: ctx.params.worldId, },);
        return jsonResponse({ data: result, },);
      },
      {
        response: { 200: t.Object({ data: t.Object({ regenerated: t.Integer(), },), },), 404: ErrorResponse, },
        detail: { summary: "Restore nodes whose respawn window has elapsed", tags: ["Worlds",], },
      },
    );
}
