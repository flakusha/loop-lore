// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Wardrobe item CRUD + inventory-instance binding routes.
 *
 * All routes are actor-ownership gated (404 for non-owners — no existence
 * oracle). World template paths (create `world_id` / list `?worldId=`)
 * additionally require world ownership or an admin role — actor ownership
 * alone must not let callers write templates into or read descriptors from
 * a world they do not own.
 */
import { Elysia, t, } from "elysia";
import {
  createWardrobeItem,
  deleteWardrobeItem,
  listWardrobeItems,
  updateWardrobeItem,
} from "../characters/services/wardrobe/crud";
import {
  ErrorResponse,
  SuccessResponse,
  WardrobeActorParams,
  WardrobeItemCreateBody,
  WardrobeItemParams,
  WardrobeItemUpdateBody,
} from "../validation/schemas";
import type { HandlerOpts, } from "./actor-auth";
import { requireOwnedActor, } from "./actor-auth";
import { HttpStatus, jsonCreated, jsonError, jsonResponse, } from "./http-utils";
import { wardrobeBindingRoutes, } from "./wardrobe-bindings";
import { requireOwnedWardrobeItem, } from "./wardrobe-item-auth";
import { requireWorldOwner, } from "./worlds/access";

const WardrobeItemListResponse = t.Array(t.Any(),);

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { actors: { ":actorId": { ...; }; }; }; } & ... 3 more ... & { ...; }, { ...; }, { ...; }>}
 */
export function wardrobeRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "wardrobe", },)
    // ── List wardrobe items ───────────────────────────────────────

    .get(`${prefix}/actors/:actorId/wardrobe`, async (ctx: any,) => {
      const owned = await requireOwnedActor(ctx, database,);
      if (owned instanceof Response) { return owned; }
      const { userId, actorId, } = owned;
      const worldId = (ctx.query?.worldId as string | undefined) ?? undefined;
      if (worldId) {
        const worldErr = await requireWorldOwner(database, worldId, userId, ctx.userRole as string | null,);
        if (worldErr) { return worldErr; }
      }

      const items = await listWardrobeItems(database, actorId, { worldId, },);
      return jsonResponse(items,);
    }, {
      params: WardrobeActorParams,
      query: t.Object({ worldId: t.Optional(t.String(),), },),
      response: {
        200: WardrobeItemListResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "List wardrobe items",
        description: "List an actor's wardrobe items (plus world templates when worldId is given).",
        tags: ["Wardrobe",],
      },
    },)
    // ── Create wardrobe item ──────────────────────────────────────

    .post(`${prefix}/actors/:actorId/wardrobe`, async (ctx: any,) => {
      const owned = await requireOwnedActor(ctx, database,);
      if (owned instanceof Response) { return owned; }
      const { userId, actorId, } = owned;
      const { name, descriptor, tags, sort_order, world_id, } = ctx.body;
      if (world_id) {
        const worldErr = await requireWorldOwner(database, world_id, userId, ctx.userRole as string | null,);
        if (worldErr) { return worldErr; }
      }

      const id = await createWardrobeItem(database, {
        actorId: world_id ? undefined : actorId,
        worldId: world_id,
        name,
        descriptor,
        tags,
        sortOrder: sort_order,
      },);

      return jsonCreated({ id, },);
    }, {
      params: WardrobeActorParams,
      body: WardrobeItemCreateBody,
      response: {
        201: t.Object({ id: t.String(), },),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
        422: ErrorResponse,
      },
      detail: {
        summary: "Create wardrobe item",
        description: "Create an actor-personal wardrobe item or a world template outfit.",
        tags: ["Wardrobe",],
      },
    },)
    // ── Update wardrobe item ──────────────────────────────────────

    .put(`${prefix}/actors/:actorId/wardrobe/:itemId`, async (ctx: any,) => {
      const owned = await requireOwnedWardrobeItem(ctx, opts,);
      if (owned instanceof Response) { return owned; }
      const { actorId, itemId, } = owned;
      return mutationResult(await updateWardrobeItem(database, itemId, actorId, ctx.body,),);
    }, {
      params: WardrobeItemParams,
      body: WardrobeItemUpdateBody,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
        422: ErrorResponse,
      },
      detail: {
        summary: "Update wardrobe item",
        description: "Partially update a wardrobe item the actor owns.",
        tags: ["Wardrobe",],
      },
    },)
    // ── Delete wardrobe item ──────────────────────────────────────

    .delete(`${prefix}/actors/:actorId/wardrobe/:itemId`, async (ctx: any,) => {
      const owned = await requireOwnedWardrobeItem(ctx, opts,);
      if (owned instanceof Response) { return owned; }
      const { actorId, itemId, } = owned;
      return mutationResult(await deleteWardrobeItem(database, itemId, actorId,),);
    }, {
      params: WardrobeItemParams,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Delete wardrobe item",
        description: "Delete a wardrobe item; bindings and overrides cascade away.",
        tags: ["Wardrobe",],
      },
    },)
    // ── Inventory-instance bindings (sub-plugin) ───────────────────

    .use(wardrobeBindingRoutes({ database, }, prefix,),);
}

/**
 * Map a boolean-mutating wardrobe service call to its HTTP response.
 * @param ok - whether the service applied the change
 * @returns 200 `{ok:true}`, or 404 when the item no longer exists
 */
function mutationResult(ok: boolean,): Response {
  return ok
    ? jsonResponse({ ok: true, },)
    : jsonError({ message: "Wardrobe item not found", status: HttpStatus.NotFound, },);
}
