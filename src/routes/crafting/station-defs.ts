// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/* eslint-disable unicorn/max-nested-calls -- Kysely query chains and Elysia TypeBox schema nesting are inherent to the route layer */

/**
 * Crafting Station Definition Routes
 *
 * CRUD endpoints for crafting station definitions backed by `StationsService`:
 *   POST   /api/worlds/:worldId/crafting-stations               — create
 *   GET    /api/worlds/:worldId/crafting-stations               — list
 *   GET    /api/worlds/:worldId/crafting-stations/:stationDefId — get
 *   PUT    /api/worlds/:worldId/crafting-stations/:stationDefId — update
 *   DELETE /api/worlds/:worldId/crafting-stations/:stationDefId — delete
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { Db, } from "../../db";
import type { CraftingStationType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { StationsService, } from "../../rpg/crafting";
import { ErrorResponse, Id, } from "../../validation/schemas";
import { badRequestResponse, jsonError, jsonResponse, notFoundResponse, } from "../http-utils";
import { requireUserId, } from "../http-utils/responses";

// ── Schemas ────────────────────────────────────────────────

const stationDefSchema = t.Object({
  id: Id,
  worldId: Id,
  name: t.String(),
  description: t.Nullable(t.String(),),
  stationType: t.String(),
  tier: t.Number(),
  speedBonus: t.Number(),
  qualityBonus: t.Number(),
  successBonus: t.Number(),
  materialSavingChance: t.Number(),
  maxDurability: t.Number(),
  createdAt: t.String(),
  updatedAt: t.String(),
},);

const listDefsResponse = t.Object({ stationDefs: t.Array(stationDefSchema,), },);
const okResponse = t.Object({ ok: t.Boolean(), },);
const createdIdResponse = t.Object({ id: Id, },);

const stationDefBody = t.Object({
  name: t.String(),
  description: t.Optional(t.String(),),
  stationType: t.String(),
  tier: t.Optional(t.Number(),),
  speedBonus: t.Optional(t.Number(),),
  qualityBonus: t.Optional(t.Number(),),
  successBonus: t.Optional(t.Number(),),
  materialSavingChance: t.Optional(t.Number(),),
  maxDurability: t.Optional(t.Number(),),
},);

const updateStationDefBody = t.Partial(stationDefBody,);

// ── Shared auth helper (exported for station-instances) ─────

/** Resolve the world's owner; returns a denial Response or null when allowed. */
export async function resolveWorldOwner(
  db: Kysely<DB>,
  worldId: string,
  userId: string,
): Promise<Response | null> {
  const world = await db
    .selectFrom("worlds",)
    .select("owner_id",)
    .where("id", "=", worldId,)
    .executeTakeFirst();
  if (!world) { return notFoundResponse("World",); }
  if (world.owner_id !== userId) { return jsonError("Not allowed", 403,); }
  return null;
}

// ── Routes ─────────────────────────────────────────────────

/**
 * Mount the crafting station definition routes.
 *
 * Wraps {@link StationsService} with world-owner authorization.
 */
export function craftingStationDefsRoutes({ database, }: { database: Db }, prefix = "/api",): Elysia {
  const svc = () => new StationsService(database,);
  return new Elysia({ name: "crafting-station-defs", },)
    .post(`${prefix}/worlds/:worldId/crafting-stations`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await resolveWorldOwner(database, ctx.params.worldId, userId,);
      if (denied) { return denied; }
      const body = ctx.body as Record<string, unknown>;
      if (typeof body.name !== "string" || body.name.length === 0) {
        return badRequestResponse("name is required",);
      }
      if (typeof body.stationType !== "string" || body.stationType.length === 0) {
        return badRequestResponse("stationType is required",);
      }
      const id = await svc().createStationDef({
        worldId: ctx.params.worldId,
        name: body.name,
        description: body.description as string | undefined,
        stationType: body.stationType as CraftingStationType,
        tier: body.tier as number | undefined,
        speedBonus: body.speedBonus as number | undefined,
        qualityBonus: body.qualityBonus as number | undefined,
        successBonus: body.successBonus as number | undefined,
        materialSavingChance: body.materialSavingChance as number | undefined,
        maxDurability: body.maxDurability as number | undefined,
      },);
      return jsonResponse({ id, }, 201,);
    }, {
      params: t.Object({ worldId: Id, },),
      body: stationDefBody,
      response: {
        201: createdIdResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Create crafting station definition",
        description: "Create a new type of crafting station for a world.",
        tags: ["Crafting",],
      },
    },)
    .get(`${prefix}/worlds/:worldId/crafting-stations`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await resolveWorldOwner(database, ctx.params.worldId, userId,);
      if (denied) { return denied; }
      const defs = await svc().listStationDefs(ctx.params.worldId, ctx.query.type as CraftingStationType | undefined,);
      return jsonResponse({ stationDefs: defs, },);
    }, {
      params: t.Object({ worldId: Id, },),
      query: t.Object({ type: t.Optional(t.String(),), },),
      response: { 200: listDefsResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "List crafting station definitions",
        description: "List station definitions for a world, optionally filtered by type.",
        tags: ["Crafting",],
      },
    },)
    .get(`${prefix}/worlds/:worldId/crafting-stations/:stationDefId`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await resolveWorldOwner(database, ctx.params.worldId, userId,);
      if (denied) { return denied; }
      const def = await svc().getStationDef(ctx.params.stationDefId,);
      if (!def) { return notFoundResponse("Station definition",); }
      return jsonResponse(def,);
    }, {
      params: t.Object({ worldId: Id, stationDefId: Id, },),
      response: { 200: stationDefSchema, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Get crafting station definition",
        description: "Get a single station definition by ID.",
        tags: ["Crafting",],
      },
    },)
    .put(`${prefix}/worlds/:worldId/crafting-stations/:stationDefId`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await resolveWorldOwner(database, ctx.params.worldId, userId,);
      if (denied) { return denied; }
      const body = ctx.body as Record<string, unknown>;
      const ok = await svc().updateStationDef(ctx.params.stationDefId, {
        name: body.name as string | undefined,
        description: body.description as string | undefined,
        stationType: body.stationType as CraftingStationType | undefined,
        tier: body.tier as number | undefined,
        speedBonus: body.speedBonus as number | undefined,
        qualityBonus: body.qualityBonus as number | undefined,
        successBonus: body.successBonus as number | undefined,
        materialSavingChance: body.materialSavingChance as number | undefined,
        maxDurability: body.maxDurability as number | undefined,
      },);
      if (!ok) { return notFoundResponse("Station definition",); }
      return jsonResponse({ ok: true, },);
    }, {
      params: t.Object({ worldId: Id, stationDefId: Id, },),
      body: updateStationDefBody,
      response: { 200: okResponse, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Update crafting station definition",
        description: "Update a station definition's properties.",
        tags: ["Crafting",],
      },
    },)
    .delete(`${prefix}/worlds/:worldId/crafting-stations/:stationDefId`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await resolveWorldOwner(database, ctx.params.worldId, userId,);
      if (denied) { return denied; }
      const ok = await svc().deleteStationDef(ctx.params.stationDefId,);
      if (!ok) { return notFoundResponse("Station definition",); }
      return jsonResponse({ ok: true, },);
    }, {
      params: t.Object({ worldId: Id, stationDefId: Id, },),
      response: { 200: okResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Delete crafting station definition",
        description: "Delete a station definition.",
        tags: ["Crafting",],
      },
    },);
}

/* eslint-enable unicorn/max-nested-calls */
