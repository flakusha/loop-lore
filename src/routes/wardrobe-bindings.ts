// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Outfit ↔ inventory-instance binding routes.
 *
 * Actor-ownership gated (404 for non-owners); the service layer enforces
 * outfit visibility and instance ownership.
 */
import { Elysia, t, } from "elysia";
import {
  bindWardrobeItemInstance,
  listWardrobeBindings,
  unbindWardrobeItemInstance,
} from "../characters/services/wardrobe/bindings";
import { getWardrobeItem, } from "../characters/services/wardrobe/crud";
import {
  ErrorResponse,
  SuccessResponse,
  WardrobeBindBody,
  WardrobeBindingParams,
  WardrobeItemParams,
} from "../validation/schemas";
import { requireActorAccess, } from "./actor-auth";
import { HttpStatus, jsonCreated, jsonError, jsonResponse, } from "./http-utils";
import type { HandlerOpts } from "./actor-auth";

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { actors: { ":actorId": { ...; }; }; }; } & ... 2 more ... & { ...; }, { ...; }, { ...; }>}
 */
export function wardrobeBindingRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "wardrobe-bindings", },)
    .get(`${prefix}/actors/:actorId/wardrobe/:itemId/bindings`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, itemId, } = ctx.params;
      const item = await getWardrobeItem(database, itemId, actorId,);
      if (!item) {
        return jsonError({ message: "Wardrobe item not found", status: HttpStatus.NotFound, },);
      }
      const bindings = await listWardrobeBindings(database, actorId, itemId,);
      return jsonResponse(bindings,);
    }, {
      params: WardrobeItemParams,
      response: {
        200: t.Array(t.Any(),),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "List outfit bindings",
        description: "List inventory item instances bound into an outfit.",
        tags: ["Wardrobe",],
      },
    },)
    .post(`${prefix}/actors/:actorId/wardrobe/:itemId/bindings`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, itemId, } = ctx.params;
      try {
        const id = await bindWardrobeItemInstance(
          database,
          actorId,
          itemId,
          ctx.body.item_instance_id,
        );
        return jsonCreated({ id, },);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Binding failed";
        return jsonError({ message, status: HttpStatus.NotFound, },);
      }
    }, {
      params: WardrobeItemParams,
      body: WardrobeBindBody,
      response: {
        201: t.Object({ id: t.String(), },),
        401: ErrorResponse,
        404: ErrorResponse,
        422: ErrorResponse,
      },
      detail: {
        summary: "Bind inventory instance to outfit",
        description: "Bind an inventory item instance into an outfit (idempotent).",
        tags: ["Wardrobe",],
      },
    },)
    .delete(`${prefix}/actors/:actorId/wardrobe/:itemId/bindings/:bindingId`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, bindingId, } = ctx.params;
      const ok = await unbindWardrobeItemInstance(database, actorId, bindingId,);
      if (!ok) {
        return jsonError({ message: "Binding not found", status: HttpStatus.NotFound, },);
      }
      return jsonResponse({ ok: true, },);
    }, {
      params: WardrobeBindingParams,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Unbind inventory instance",
        description: "Remove an inventory item instance binding from an outfit.",
        tags: ["Wardrobe",],
      },
    },);
}
