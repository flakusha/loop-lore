// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Builder chain CRUD routes (owner-scoped):
 *
 *   GET    /api/v1/comfyui-builder/chains       — list
 *   POST   /api/v1/comfyui-builder/chains       — create
 *   GET    /api/v1/comfyui-builder/chains/:id   — retrieve
 *   PATCH  /api/v1/comfyui-builder/chains/:id   — update (owner only)
 *   DELETE /api/v1/comfyui-builder/chains/:id   — delete (owner only)
 */
import { Type, } from "@sinclair/typebox";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import {
  createChain,
  deleteChain,
  getChain,
  listChains,
  updateChain,
} from "../../generation/builder";
import { notFound, } from "../../validation/middleware";
import {
  ChainCreateBody,
  type ChainCreateBodyT,
  ChainUpdateBody,
  type ChainUpdateBodyT,
  ErrorResponse,
  SuccessResponse,
} from "../../validation/schemas";
import { HttpStatus, jsonCreated, jsonError, jsonResponse, requireUserId, } from "../http-utils";

const IdParams = Type.Object({ id: Type.String(), },);

/**
 * @param root0 - Handler options
 * @param root0.database - Kysely database handle
 * @param prefix - Route prefix
 * @returns the Elysia plugin mounting the chain CRUD routes
 */
export function builderChainRoutes(
  { database, }: { database: Kysely<DB> },
  prefix = "/api",
) {
  return new Elysia({ name: "comfyui-builder-chains", },)
    .get(`${prefix}/comfyui-builder/chains`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const chains = await listChains(database, userId,);
      return jsonResponse({ chains, },);
    }, {
      response: { 200: SuccessResponse, 401: ErrorResponse, },
      detail: { summary: "List builder chains", tags: ["ComfyUI Builder",], },
    },)
    .post(`${prefix}/comfyui-builder/chains`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const body = ctx.body as ChainCreateBodyT;
      try {
        const chain = await createChain(database, userId, {
          name: body.name,
          description: body.description,
          steps: body.steps,
        },);

        return jsonCreated({ chain, },);
      } catch (error) {
        return jsonError({
          message: error instanceof Error ? error.message : "Invalid chain",
          status: HttpStatus.BadRequest,
        },);
      }
    }, {
      body: ChainCreateBody,
      response: { 201: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, },
      detail: { summary: "Create a builder chain", tags: ["ComfyUI Builder",], },
    },)
    .get(`${prefix}/comfyui-builder/chains/:id`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const chain = await getChain(database, ctx.params.id, userId,);
      if (!chain) { return notFound("Chain not found",); }
      return jsonResponse({ chain, },);
    }, {
      params: IdParams,
      response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: { summary: "Retrieve a builder chain", tags: ["ComfyUI Builder",], },
    },)
    .patch(`${prefix}/comfyui-builder/chains/:id`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const body = ctx.body as ChainUpdateBodyT;
      try {
        const chain = await updateChain(database, ctx.params.id, userId, body,);
        if (!chain) { return notFound("Chain not found",); }
        return jsonResponse({ chain, },);
      } catch (error) {
        return jsonError({
          message: error instanceof Error ? error.message : "Invalid chain update",
          status: HttpStatus.BadRequest,
        },);
      }
    }, {
      params: IdParams,
      body: ChainUpdateBody,
      response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: { summary: "Update a builder chain", tags: ["ComfyUI Builder",], },
    },)
    .delete(`${prefix}/comfyui-builder/chains/:id`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const deleted = await deleteChain(database, ctx.params.id, userId,);
      if (!deleted) { return notFound("Chain not found",); }
      return new Response(null, { status: 204, },);
    }, {
      params: IdParams,
      response: { 204: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: { summary: "Delete a builder chain", tags: ["ComfyUI Builder",], },
    },);
}
