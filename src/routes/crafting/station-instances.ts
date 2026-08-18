// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Crafting Station Instance Routes
 *
 * CRUD endpoints for placed crafting station instances backed by `StationsService`:
 *   POST   /api/worlds/:worldId/crafting-stations/:stationDefId/instances                             — place
 *   GET    /api/worlds/:worldId/crafting-stations/:stationDefId/instances                             — list
 *   GET    /api/worlds/:worldId/crafting-stations/:stationDefId/instances/:instanceId                 — get
 *   PUT    /api/worlds/:worldId/crafting-stations/:stationDefId/instances/:instanceId                 — update
 *   DELETE /api/worlds/:worldId/crafting-stations/:stationDefId/instances/:instanceId                 — delete
 */
import { Elysia, t, } from "elysia";
import type { Db, } from "../../db";
import { StationsService, } from "../../rpg/crafting";
import { ErrorResponse, Id, } from "../../validation/schemas";
import { badRequestResponse, jsonResponse, notFoundResponse, } from "../http-utils";
import { requireUserId, } from "../http-utils/responses";
import { resolveWorldOwner, } from "./station-defs";

// ── Schemas ────────────────────────────────────────────────

const stationInstanceSchema = t.Object({
  id: Id,
  stationDefId: Id,
  worldId: Id,
  locationId: t.Nullable(t.String(),),
  ownerActorId: t.Nullable(t.String(),),
  currentDurability: t.Number(),
  isActive: t.Boolean(),
  createdAt: t.String(),
  updatedAt: t.String(),
},);

const listInstancesResponse = t.Object({ instances: t.Array(stationInstanceSchema,), },);
const okResponse = t.Object({ ok: t.Boolean(), },);
const createdIdResponse = t.Object({ id: Id, },);

const stationInstanceBody = t.Object({
  locationId: t.Optional(t.String(),),
  ownerActorId: t.Optional(t.String(),),
  currentDurability: t.Number(),
  isActive: t.Optional(t.Boolean(),),
},);

const updateStationInstanceBody = t.Partial(stationInstanceBody,);

// ── Routes ─────────────────────────────────────────────────

/**
 * Mount the crafting station instance routes.
 *
 * Wraps {@link StationsService} with world-owner authorization.
 */
export function craftingStationInstancesRoutes({ database, }: { database: Db }, prefix = "/api",): Elysia {
  const svc = () => new StationsService(database,);
  return new Elysia({ name: "crafting-station-instances", },)
    .post(`${prefix}/worlds/:worldId/crafting-stations/:stationDefId/instances`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await resolveWorldOwner(database, ctx.params.worldId, userId,);
      if (denied) { return denied; }
      const body = ctx.body as Record<string, unknown>;
      const durability = body.currentDurability as number;
      if (!Number.isFinite(durability,) || durability < 0) {
        return badRequestResponse("currentDurability must be a non-negative number",);
      }
      const id = await svc().createInstance({
        stationDefId: ctx.params.stationDefId,
        worldId: ctx.params.worldId,
        locationId: body.locationId as string | undefined,
        ownerActorId: body.ownerActorId as string | undefined,
        currentDurability: durability,
        isActive: body.isActive as boolean | undefined,
      },);
      return jsonResponse({ id, }, 201,);
    }, {
      params: t.Object({ worldId: Id, stationDefId: Id, },),
      body: stationInstanceBody,
      response: {
        201: createdIdResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Place crafting station instance",
        description: "Place a physical station instance in the world.",
        tags: ["Crafting",],
      },
    },)
    .get(`${prefix}/worlds/:worldId/crafting-stations/:stationDefId/instances`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await resolveWorldOwner(database, ctx.params.worldId, userId,);
      if (denied) { return denied; }
      const insts = await svc().listInstances(ctx.params.worldId,);
      return jsonResponse({ instances: insts, },);
    }, {
      params: t.Object({ worldId: Id, stationDefId: Id, },),
      response: { 200: listInstancesResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "List crafting station instances",
        description: "List placed station instances for a world.",
        tags: ["Crafting",],
      },
    },)
    .get(`${prefix}/worlds/:worldId/crafting-stations/:stationDefId/instances/:instanceId`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await resolveWorldOwner(database, ctx.params.worldId, userId,);
      if (denied) { return denied; }
      const inst = await svc().getInstance(ctx.params.instanceId,);
      if (!inst) { return notFoundResponse("Station instance",); }
      return jsonResponse(inst,);
    }, {
      params: t.Object({ worldId: Id, stationDefId: Id, instanceId: Id, },),
      response: { 200: stationInstanceSchema, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Get crafting station instance",
        description: "Get a single placed station instance by ID.",
        tags: ["Crafting",],
      },
    },)
    .put(`${prefix}/worlds/:worldId/crafting-stations/:stationDefId/instances/:instanceId`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await resolveWorldOwner(database, ctx.params.worldId, userId,);
      if (denied) { return denied; }
      const body = ctx.body as Record<string, unknown>;
      const ok = await svc().updateInstance(ctx.params.instanceId, {
        locationId: body.locationId as string | undefined,
        ownerActorId: body.ownerActorId as string | undefined,
        currentDurability: body.currentDurability as number | undefined,
        isActive: body.isActive as boolean | undefined,
      },);
      if (!ok) { return notFoundResponse("Station instance",); }
      return jsonResponse({ ok: true, },);
    }, {
      params: t.Object({ worldId: Id, stationDefId: Id, instanceId: Id, },),
      body: updateStationInstanceBody,
      response: { 200: okResponse, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Update crafting station instance",
        description: "Update a placed station instance.",
        tags: ["Crafting",],
      },
    },)
    .delete(`${prefix}/worlds/:worldId/crafting-stations/:stationDefId/instances/:instanceId`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await resolveWorldOwner(database, ctx.params.worldId, userId,);
      if (denied) { return denied; }
      const ok = await svc().deleteInstance(ctx.params.instanceId,);
      if (!ok) { return notFoundResponse("Station instance",); }
      return jsonResponse({ ok: true, },);
    }, {
      params: t.Object({ worldId: Id, stationDefId: Id, instanceId: Id, },),
      response: { 200: okResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Delete crafting station instance",
        description: "Delete a placed station instance.",
        tags: ["Crafting",],
      },
    },);
}
