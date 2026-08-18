// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Crafting Station Instance Routes.
 *
 * Placed station instances (`/api/rpg/crafting/station-instances`) for the
 * `crafting-stations` plugin, extracted from `crafting-stations.ts` to keep
 * that module under the 250L ceiling. Mounted via `craftingStationRoutes()`
 * `.use(...)`. Also hosts the shared `assertWorldOwner` world-ownership check
 * used by both the definition and instance route groups.
 */
import { Elysia, t, } from "elysia";
import type { StationsService, } from "../../rpg/crafting";
import { ErrorResponse, Id, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { HttpStatus, } from "../http-utils/status";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

const NullableId = t.Union([Id, t.Null(),],);
const OptionalNullableId = t.Optional(NullableId,);

const CreateStationInstanceBody = t.Object({
  stationDefId: Id,
  worldId: Id,
  locationId: OptionalNullableId,
  ownerActorId: OptionalNullableId,
},);
const UpdateStationInstanceBody = t.Object({
  locationId: OptionalNullableId,
  ownerActorId: OptionalNullableId,
  currentDurability: t.Optional(t.Number({ minimum: 0, },),),
  isActive: t.Optional(t.Boolean(),),
},);

// ── World ownership check ────────────────────────────────
export async function assertWorldOwner(
  db: HandlerOpts["database"],
  userId: string,
  worldId: string,
): Promise<Response | null> {
  const world = await db.selectFrom("worlds",)
    .select("owner_id",).where("id", "=", worldId,).executeTakeFirst();
  if (!world) { return jsonError("World not found", HttpStatus.NotFound,); }
  if (world.owner_id !== userId) { return jsonError("Forbidden", HttpStatus.Forbidden,); }
  return null;
}

export function stationInstanceRoutes(opts: HandlerOpts, svc: StationsService, R: string,): Elysia {
  return (
    new Elysia({ name: "rpg-crafting-station-instances", },)
      // ── List station instances ──────────────────────────
      .get(`${R}/station-instances`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const worldId = ctx.query.worldId as string | undefined;
        if (!worldId) { return jsonError("worldId required", HttpStatus.BadRequest,); }
        const locationId = ctx.query.locationId as string | undefined;
        const instances = await svc.listInstances(worldId, locationId,);
        return jsonResponse({ data: instances, },);
      }, {
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: { summary: "List station instances", tags: ["RPG", "Crafting",], },
      },)
      // ── Create station instance ─────────────────────────
      .post(`${R}/station-instances`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const body = ctx.body as {
          stationDefId: string;
          worldId: string;
          locationId?: string | null;
          ownerActorId?: string | null;
        };
        const deny = await assertWorldOwner(opts.database, userId, body.worldId,);
        if (deny) { return deny; }
        // Verify station def exists
        const def = await svc.getStationDef(body.stationDefId,);
        if (!def) { return jsonError("Station definition not found", HttpStatus.NotFound,); }
        try {
          const id = await svc.createInstance({
            stationDefId: body.stationDefId,
            worldId: body.worldId,
            locationId: body.locationId,
            ownerActorId: body.ownerActorId,
            currentDurability: def.maxDurability,
          },);
          return jsonResponse({ id, }, HttpStatus.Created,);
        } catch (error) {
          log().error("Failed to create station instance", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", HttpStatus.InternalServerError,);
        }
      }, {
        body: CreateStationInstanceBody,
        response: { 201: SuccessResponse, 401: ErrorResponse, },
        detail: { summary: "Create station instance", tags: ["RPG", "Crafting",], },
      },)
      // ── Update station instance ─────────────────────────
      .patch(`${R}/station-instances/:id`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const id = (ctx.params as { id: string }).id;
        const existing = await svc.getInstance(id,);
        if (!existing) { return jsonError("Instance not found", HttpStatus.NotFound,); }
        const deny = await assertWorldOwner(opts.database, userId, existing.worldId,);
        if (deny) { return deny; }
        const body = ctx.body as Record<string, unknown>;
        const ok = await svc.updateInstance(id, body,);
        if (!ok) { return jsonError("Update failed", HttpStatus.InternalServerError,); }
        const updated = await svc.getInstance(id,);
        return jsonResponse(updated,);
      }, {
        body: UpdateStationInstanceBody,
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: { summary: "Update station instance", tags: ["RPG", "Crafting",], },
      },)
      // ── Delete station instance ─────────────────────────
      .delete(`${R}/station-instances/:id`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const id = (ctx.params as { id: string }).id;
        const existing = await svc.getInstance(id,);
        if (!existing) { return jsonError("Instance not found", HttpStatus.NotFound,); }
        const deny = await assertWorldOwner(opts.database, userId, existing.worldId,);
        if (deny) { return deny; }
        await svc.deleteInstance(id,);
        return jsonResponse({ deleted: true, },);
      }, {
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: { summary: "Delete station instance", tags: ["RPG", "Crafting",], },
      },)
  );
}
