// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Crafting Station Routes — CRUD for definitions and placed instances. */
import { Elysia, t, } from "elysia";
import { StationsService, } from "../../rpg/crafting";
import { ErrorResponse, Id, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { HttpStatus, } from "../http-utils/status";
import {
  assertWorldOwner,
  stationInstanceRoutes,
} from "./crafting-station-instances";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

const StationType = t.UnionEnum([
  "anvil",
  "forge",
  "workbench",
  "cauldron",
  "loom",
  "furnace",
  "kitchen",
  "enchanting_table",
],);
const CreateStationDefBody = t.Object({
  name: t.String({ minLength: 1, },),
  worldId: Id,
  stationType: StationType,
  tier: t.Optional(t.Number({ minimum: 1, },),),
  description: t.Optional(t.String(),),
  speedBonus: t.Optional(t.Number(),),
  qualityBonus: t.Optional(t.Number(),),
  successBonus: t.Optional(t.Number(),),
  materialSavingChance: t.Optional(t.Number(),),
  maxDurability: t.Optional(t.Number({ minimum: 1, },),),
},);
const NullableString = t.Union([t.String(), t.Null(),],);

const UpdateStationDefBody = t.Object({
  name: t.Optional(t.String({ minLength: 1, },),),
  stationType: t.Optional(StationType,),
  tier: t.Optional(t.Number({ minimum: 1, },),),
  description: t.Optional(NullableString,),
  speedBonus: t.Optional(t.Number(),),
  qualityBonus: t.Optional(t.Number(),),
  successBonus: t.Optional(t.Number(),),
  materialSavingChance: t.Optional(t.Number(),),
  maxDurability: t.Optional(t.Number({ minimum: 1, },),),
},);

export function craftingStationRoutes(opts: HandlerOpts, prefix = "/api",): Elysia {
  const R = `${prefix}/rpg/crafting`;
  const svc = new StationsService(opts.database,);

  return (
    new Elysia({ name: "rpg-crafting-stations", },)
      // ── List station definitions ────────────────────────
      .get(`${R}/stations`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const worldId = ctx.query.worldId as string | undefined;
        if (!worldId) { return jsonError("worldId required", HttpStatus.BadRequest,); }
        const type = ctx.query.type as string | undefined;
        const stations = await svc.listStationDefs(worldId, type as never,);
        return jsonResponse({ data: stations, },);
      }, {
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: { summary: "List station definitions", tags: ["RPG", "Crafting",], },
      },)
      // ── Create station definition ───────────────────────
      .post(`${R}/stations`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const body = ctx.body as {
          name: string;
          worldId: string;
          stationType: string;
          tier?: number;
          description?: string;
          speedBonus?: number;
          qualityBonus?: number;
          successBonus?: number;
          materialSavingChance?: number;
          maxDurability?: number;
        };
        const deny = await assertWorldOwner(opts.database, userId, body.worldId,);
        if (deny) { return deny; }
        try {
          const id = await svc.createStationDef({
            worldId: body.worldId,
            name: body.name,
            stationType: body.stationType as never,
            tier: body.tier,
            description: body.description,
            speedBonus: body.speedBonus,
            qualityBonus: body.qualityBonus,
            successBonus: body.successBonus,
            materialSavingChance: body.materialSavingChance,
            maxDurability: body.maxDurability,
          },);
          return jsonResponse({ id, }, HttpStatus.Created,);
        } catch (error) {
          log().error("Failed to create station def", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", HttpStatus.InternalServerError,);
        }
      }, {
        body: CreateStationDefBody,
        response: { 201: SuccessResponse, 401: ErrorResponse, },
        detail: { summary: "Create station definition", tags: ["RPG", "Crafting",], },
      },)
      // ── Get station definition ──────────────────────────
      .get(`${R}/stations/:id`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const id = (ctx.params as { id: string }).id;
        const station = await svc.getStationDef(id,);
        if (!station) { return jsonError("Station not found", HttpStatus.NotFound,); }
        return jsonResponse(station,);
      }, {
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: { summary: "Get station definition", tags: ["RPG", "Crafting",], },
      },)
      // ── Update station definition ───────────────────────
      .patch(`${R}/stations/:id`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const id = (ctx.params as { id: string }).id;
        const existing = await svc.getStationDef(id,);
        if (!existing) { return jsonError("Station not found", HttpStatus.NotFound,); }
        const deny = await assertWorldOwner(opts.database, userId, existing.worldId,);
        if (deny) { return deny; }
        const body = ctx.body as Record<string, unknown>;
        const ok = await svc.updateStationDef(id, body,);
        if (!ok) { return jsonError("Update failed", HttpStatus.InternalServerError,); }
        const updated = await svc.getStationDef(id,);
        return jsonResponse(updated,);
      }, {
        body: UpdateStationDefBody,
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: { summary: "Update station definition", tags: ["RPG", "Crafting",], },
      },)
      // ── Delete station definition ───────────────────────
      .delete(`${R}/stations/:id`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const id = (ctx.params as { id: string }).id;
        const existing = await svc.getStationDef(id,);
        if (!existing) { return jsonError("Station not found", HttpStatus.NotFound,); }
        const deny = await assertWorldOwner(opts.database, userId, existing.worldId,);
        if (deny) { return deny; }
        await svc.deleteStationDef(id,);
        return jsonResponse({ deleted: true, },);
      }, {
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: { summary: "Delete station definition", tags: ["RPG", "Crafting",], },
      },)
      // ── Station instances (sibling sub-plugin) ─────────
      .use(stationInstanceRoutes(opts, svc, R,),)
  );
}
