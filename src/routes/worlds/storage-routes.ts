// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Persistent storage endpoints.
 *
 *   GET  /api/worlds/:worldId/storage?locationId=
 *   POST /api/worlds/:worldId/storage
 *   GET  /api/worlds/:worldId/storage/:storageId
 *   GET  /api/worlds/:worldId/storage/:storageId/contents
 *   POST /api/worlds/:worldId/storage/:storageId/deposit
 *   POST /api/worlds/:worldId/storage/:storageId/withdraw
 *
 * Creating a container is a world-owner act; USING one needs world access plus
 * the container's own rules, which `depositItem`/`withdrawItem`/
 * `readStorageContents` enforce internally — a route cannot bypass them by
 * writing the row itself, and none of them reads its actor from the request.
 *
 * IDENTITY: no endpoint here accepts an actor id from the client. The acting
 * actor comes from the session via `requireActingActor` (see
 * `./storage-route-support`), so world membership can never be confused with
 * being the owner.
 */
import { Elysia, t, } from "elysia";
import { ErrorResponse, } from "../../validation/schemas";
import {
  createStorage,
  depositItem,
  listStorages,
  readStorageContents,
  StorageError,
  storageUsage,
  withdrawItem,
} from "../../worlds/storage";
import { extractAuth, jsonCreated, jsonError, jsonResponse, } from "../http-utils";
import { requireWorldAccess, requireWorldOwner, } from "./access";
import {
  requireActingActor,
  respond,
  StorageContentBody,
  storageStatus,
  StorageSummary,
  StorageUsageBody,
  TransferBody,
} from "./storage-route-support";
import type { HandleOpts, } from "./types";

export function storageRoutes(opts: HandleOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "worlds-storage", },)
    .get(
      `${prefix}/worlds/:worldId/storage`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }

        const list = await listStorages(database, ctx.params.worldId, ctx.query.locationId,);
        return jsonResponse({ data: list, },);
      },
      {
        query: t.Object({ locationId: t.Optional(t.String(),), },),
        response: { 200: t.Object({ data: t.Array(StorageSummary,), },), 404: ErrorResponse, },
        detail: { summary: "List storage containers", tags: ["Worlds",], },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/storage`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldOwner(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }

        try {
          const created = await createStorage(database, {
            worldId: ctx.params.worldId,
            locationId: ctx.body.locationId,
            name: ctx.body.name,
            capacity: ctx.body.capacity,
            security: ctx.body.security,
            accessControl: ctx.body.accessControl,
          },);

          return jsonCreated({ id: created.id, },);
        } catch (error) {
          if (error instanceof StorageError) {
            return jsonError({ message: error.message, status: storageStatus(error.code,), },);
          }

          throw error;
        }
      },
      {
        body: t.Object({
          locationId: t.Optional(t.Union([t.String({ minLength: 1, },), t.Null(),],),),
          name: t.String({ minLength: 1, maxLength: 200, },),
          capacity: t.Integer({ minimum: 0, },),
          security: t.Optional(t.Integer({ minimum: 0, maximum: 100, },),),
          accessControl: t.Optional(t.Object({
            ownerActorId: t.Optional(t.String(),),
            allowedActorIds: t.Optional(t.Array(t.String(),),),
            requireSecurity: t.Optional(t.Integer({ minimum: 0, maximum: 100, },),),
          },),),
        },),
        response: { 201: t.Object({ id: t.String(), },), 400: ErrorResponse, 404: ErrorResponse, },
        detail: { summary: "Create a storage container", tags: ["Worlds",], },
      },
    )
    .get(
      `${prefix}/worlds/:worldId/storage/:storageId`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }

        // The container is scoped to `:worldId` INSIDE the engine load, so a
        // foreign id is a 404 rather than that world's usage report.
        return await respond(() => storageUsage(database, ctx.params.worldId, ctx.params.storageId,));
      },
      {
        response: { 200: t.Object({ data: StorageUsageBody, },), 404: ErrorResponse, },
        detail: { summary: "Read a container's usage", tags: ["Worlds",], },
      },
    )
    .get(
      `${prefix}/worlds/:worldId/storage/:storageId/contents`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }

        // Access-checked: an unguarded contents read hands every world member
        // every other member's private chest, bypassing the access model.
        const actor = await requireActingActor(database, ctx,);
        if (typeof actor !== "string") { return actor; }

        return await respond(() =>
          readStorageContents(database, {
            storageId: ctx.params.storageId,
            actorId: actor,
            worldId: ctx.params.worldId,
          },)
        );
      },
      {
        response: {
          200: t.Object({ data: t.Array(StorageContentBody,), },),
          400: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: { summary: "List a container's contents", tags: ["Worlds",], },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/storage/:storageId/deposit`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }

        const actor = await requireActingActor(database, ctx,);
        if (typeof actor !== "string") { return actor; }

        return await respond(() =>
          depositItem(database, {
            storageId: ctx.params.storageId,
            itemId: ctx.body.itemId,
            quantity: ctx.body.quantity,
            actorId: actor,
            worldId: ctx.params.worldId,
          },)
        );
      },
      {
        body: TransferBody,
        response: {
          200: t.Object({ data: StorageUsageBody, },),
          400: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
          409: ErrorResponse,
        },
        detail: { summary: "Deposit items into a container", tags: ["Worlds",], },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/storage/:storageId/withdraw`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }

        const actor = await requireActingActor(database, ctx,);
        if (typeof actor !== "string") { return actor; }

        return await respond(() =>
          withdrawItem(database, {
            storageId: ctx.params.storageId,
            itemId: ctx.body.itemId,
            quantity: ctx.body.quantity,
            actorId: actor,
            worldId: ctx.params.worldId,
          },)
        );
      },
      {
        body: TransferBody,
        response: {
          200: t.Object({ data: StorageUsageBody, },),
          400: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: { summary: "Withdraw items from a container", tags: ["Worlds",], },
      },
    );
}
